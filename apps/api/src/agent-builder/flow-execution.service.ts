import { Injectable, Logger } from '@nestjs/common';
import { getPrisma, withTenant, type Order } from '@aq/db';
import type { AgentFlowDefinition, AstraAnswerDto, FlowNode, SupportedLanguage } from '@aq/shared';
import { KbService } from '../kb/kb.service';
import { TicketsService } from '../tickets/tickets.service';
import { isConfigured, llmComplete, LlmAuthError } from '../ai/llm';
import { languageInstruction, resolveLanguage, type Lang } from '../ai/language';
import * as R from '../ai/replies';
import { stripMarkdownForSpeech, VOICE_STYLE_INSTRUCTION } from '../ai/reply-style';
import { AgentFlowService } from './agent-flow.service';

interface RunOptions {
  language?: SupportedLanguage;
  contactId?: string;
  conversationId?: string;
  channel?: 'chat' | 'whatsapp' | 'voice';
}

interface ExecContext {
  intent?: string;
  orders?: Order[];
}

// Order refs are always "ZK-<n>" (see nextRef(tx, tenantId, 'ZK-')), but a customer
// typing one back — e.g. after being asked "which order?" — won't reliably match
// case or the hyphen ("zk6", "zk 6", "ZK-6"). Strip everything but letters/digits
// and lowercase before comparing, everywhere a ref might be mentioned in free text.
function normalizeRef(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Order.status is free-form (Guide's convention: delivered | in_transit | refunded | ...) —
// these two are the only statuses that permanently rule out a refund regardless of age.
const NEVER_REFUNDABLE_STATUSES = new Set(['refunded', 'cancelled']);

function isRefundEligible(order: Order, windowDays: number): boolean {
  if (order.status && NEVER_REFUNDABLE_STATUSES.has(order.status)) return false;
  if (order.status !== 'delivered') return false;
  const daysSinceOrder = (Date.now() - order.createdAt.getTime()) / 86_400_000;
  return daysSinceOrder <= windowDays;
}

/**
 * Real node-by-node executor for a published Agent Builder flow (Guide
 * §1.3/§12) — walks the definition's nodes and does each one's actual job,
 * rather than the fixed single-prompt behavior AiService used before this
 * existed. Same AstraAnswerDto contract as AiService.ask(), so every
 * channel (Chatbot/WhatsApp/Voice) benefits with zero changes on their side.
 */
@Injectable()
export class FlowExecutionService {
  private readonly logger = new Logger(FlowExecutionService.name);
  private prisma = getPrisma();

  constructor(
    private flows: AgentFlowService,
    private kb: KbService,
    private tickets: TicketsService,
  ) {}

  async run(
    tenantId: string,
    question: string,
    options: RunOptions = {},
    /** Pass the already-fetched flow from AiService to avoid a redundant DB round-trip. */
    preloadedFlow?: import('@aq/db').AgentFlow | null,
    /**
     * Injectable LLM function — defaults to llmComplete (buffered). Pass a streaming
     * variant from the SSE controller so the final answer streams token-by-token
     * without modifying the rest of the flow logic.
     */
    llmFn?: (prompt: string) => Promise<string>,
  ): Promise<AstraAnswerDto> {
    const language = options.language ?? 'auto';
    // Most replies below this point are canned templates that deliberately never reach the LLM
    // (see ../ai/replies.ts), so they can't rely on the model to mirror the customer's language
    // the way the send_reply fallback does — they need an answer up front.
    const lang = resolveLanguage(language, question);

    if (!isConfigured()) {
      return { answer: R.notConfigured(lang), escalate: false, configured: false, sources: [], ticketRef: null, visitedNodeIds: [] };
    }

    // Use the preloaded flow when available; only fall back to DB when called directly.
    const flow = preloadedFlow !== undefined ? preloadedFlow : await this.flows.findPublishedChatFlow(tenantId);
    if (!flow) {
      // Caller (AiService) should have checked first — fall back safely rather than 500.
      return { answer: R.notConfigured(lang), escalate: false, configured: false, sources: [], ticketRef: null, visitedNodeIds: [] };
    }

    const definition = flow.definition as unknown as AgentFlowDefinition;
    const ctx: ExecContext = {};
    const t0 = Date.now(); // [PROFILE] temporary — remove before shipping

    // Kicked off speculatively from inside detect_intent (see below) only when intent isn't
    // resolved by an instant regex/keyword match and has to go through the LLM classifier —
    // that's the one case where fetch_data's later DB round-trip (~1s, India↔us-east-1) can
    // run concurrently with the classifier call (~1s) instead of stacking after it. A `.catch`
    // is attached solely to stop Node from logging an "unhandled rejection" if the classified
    // intent turns out not to need order data at all and this ends up never awaited — fetch_data
    // still awaits the ORIGINAL promise below, so a real failure still propagates normally there.
    let speculativeOrdersPromise: Promise<Order[]> | null = null;

    // Walk via each node's `nextId` override when set, falling through to the
    // next array element otherwise (the array order the Agent Builder canvas
    // shows). `nextId` is user-editable ("on success, go to"), so a capped
    // step count guards against a cycle someone wires up by mistake.
    const byId = new Map(definition.nodes.map((n) => [n.id, n]));
    let node: FlowNode | undefined = definition.nodes[0];
    let steps = 0;
    // Every node actually reached, in order — exists purely so Agent Builder's
    // Test panel can highlight the real path on the canvas; no other caller
    // (Chatbot/WhatsApp/Voice) needs to read this field.
    const visitedNodeIds: string[] = [];

    try {
      while (node && steps++ < definition.nodes.length * 2) {
        visitedNodeIds.push(node.id);
        this.logger.log(`[PROFILE] node=${node.type} start +${Date.now() - t0}ms`); // temporary
        switch (node.type) {
          case 'trigger':
            break; // entry point only

          case 'detect_intent': {
            const intents = node.config.intents ?? ['other'];
            // A reply that's essentially just an order ref (e.g. answering "which
            // order?" with "zk6") is unambiguous — but only once we know what that
            // specific order's status actually is: an in-transit order means the
            // customer is continuing a tracking conversation, a delivered one means
            // they're continuing a return one (see the "which order to return?"
            // question below). Classify from the order itself rather than asking
            // the LLM, which has no memory of which clarifying question was just
            // asked and tends to call a bare ref-only reply "other".
            const refOnlyMatch = normalizeRef(question);
            if (/zk\d+/.test(refOnlyMatch) && options.contactId && (intents.includes('track') || intents.includes('return'))) {
              const recentOrders = await withTenant(this.prisma, tenantId, (tx) =>
                tx.order.findMany({ where: { contactId: options.contactId }, orderBy: { createdAt: 'desc' }, take: 5 }),
              );
              const matched = recentOrders.find((o) => o.extRef && refOnlyMatch.includes(normalizeRef(o.extRef)));
              if (matched?.status === 'delivered' && intents.includes('return')) {
                ctx.intent = 'return';
                break;
              }
              if (intents.includes('track')) {
                ctx.intent = 'track';
                break;
              }
            }

            // Fast keyword-based intent matching — covers ~80% of messages with
            // zero LLM latency. Only fall through to llmComplete() for messages
            // that don't match any keyword pattern (genuinely ambiguous).
            // ── Universal conversational patterns ──
            // These are matched regardless of the flow's configured intents because
            // every support bot needs to handle "ok", "thanks", "bye", and menu numbers.
            const q = question.toLowerCase();
            // Devanagari terms alongside the romanized ones — Sarvam's STT transcribes Hindi
            // speech in Devanagari script (see voice.service.ts), not Hinglish, so a spoken
            // "धन्यवाद" needs to match here too, not just a typed "dhanyavaad". `।` (danda) is
            // Hindi's own full stop, accepted as trailing punctuation alongside "!."
            const CONVERSATIONAL: Record<string, RegExp> = {
              thanks: /^\s*(thanks|thank\s*you|thx|ty|dhanyavaad|dhanyawad|shukriya|shukriya\s*ji|appreciated|धन्यवाद|शुक्रिया)\s*[!.।]*\s*$/i,
              farewell: /^\s*(bye|goodbye|good\s*bye|see\s*you|take\s*care|cya|alvida|phir\s*milte\s*hain?|अलविदा|फिर\s*मिलते\s*हैं)\s*[!.।]*\s*$/i,
              acknowledge: /^\s*(ok|okay|k|alright|sure|got\s*it|understood|fine|right|hm+|cool|great|nice|perfect|no\s*problem|np|accha|acha|theek\s*hai|thik\s*hai|theek|haan|han|ji|ji\s*haan|yes|no|yeah|yep|nope|nah|hmm+)\s*[!.]*\s*$/i,
            };

            // Bare numeric menu replies ("1", "2", etc.)
            if (/^\s*\d{1,2}\s*$/.test(q)) {
              ctx.intent = 'acknowledge';
              break;
            }
            for (const [intent, re] of Object.entries(CONVERSATIONAL)) {
              if (re.test(q)) {
                ctx.intent = intent;
                break;
              }
            }
            if (ctx.intent) break;

            // ── Flow-configured intent keywords ──
            // Hindi alternates are romanized, since that's how customers actually type on chat
            // and WhatsApp. Without these, "mera order kahan hai" matched nothing and fell
            // through to the (slower, paid) LLM classifier, while "mujhe refund chahiye"
            // matched the English word "refund" — so Hindi speakers got inconsistent routing.
            // `wapas` (back) is genuinely ambiguous between refund and return; it sits on
            // `return` only, and `paise wapas` is caught by `refund`'s `paise`.
            const keywordMap: Record<string, RegExp> = {
              track:  /\b(track|where.*order|order.*where|deliver|shipped|shipment|transit|package|parcel|status|kahan|kaha|pahunch|pohonch|kab\s*tak|kab\s*aayega|mil\s*jayega)\b/i,
              refund: /\b(refund|money back|reimburs|paid.*back|cashback|paisa|paise|paise\s*wapas|rupaye)\b/i,
              return: /\b(return|send.*back|give.*back|take.*back|exchange|replace|wapas|vapas|lautana|lauta|badalna|badal)\b/i,
              human:  /\b(human|agent|person|speak.*to|talk.*to|real person|live agent|customer.?care|support team|insaan|aadmi|kisi\s*se\s*baat|banda)\b/i,
              greet:  /^(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening)|hiya|sup)\b/i,
            };

            const keywordIntent = intents.find((intent) => keywordMap[intent]?.test(q));
            if (keywordIntent) {
              ctx.intent = keywordIntent;
              break;
            }

            // Fallback: ask the LLM only when keywords don't resolve the intent.
            // 'thanks'/'farewell' are always offered as candidates alongside the flow's own
            // configured intents — the regex fast-path above only catches an exact "thank you"/
            // "bye" with nothing else in the message; something like "Nahi, thank you." or
            // "Thanks, but where's my order?" needs real language understanding to tell a genuine
            // closing from a closing-shaped sentence that still has a live request in it.
            // max_tokens:5 — we only need one word back ("track", "refund", etc.)
            const classifierIntents = Array.from(new Set([...intents, 'thanks', 'farewell']));
            const prompt =
              `Classify the customer's message into exactly one of these intents: ${classifierIntents.join(', ')}. ` +
              `Classify as "thanks" or "farewell" ONLY if the customer is purely thanking you or ending the ` +
              `conversation with no further request — if they mention a new question or ask for anything else ` +
              `(even alongside "thanks"/"bye"), classify that request's own intent instead. ` +
              `Reply with ONLY the intent word, nothing else.\n\nMessage: ${question}`;
            // Most ambiguous messages in a support bot end up being about an order (that's
            // usually WHY they didn't match a keyword — "what about my thing" style phrasing) —
            // so start the order fetch now, in parallel with the classifier call, rather than
            // waiting to know the intent first. If the eventual intent doesn't need it (e.g. the
            // classifier lands on "thanks"), fetch_data below just leaves this promise unawaited.
            if (options.contactId) {
              speculativeOrdersPromise = withTenant(this.prisma, tenantId, (tx) =>
                tx.order.findMany({ where: { contactId: options.contactId }, orderBy: { createdAt: 'desc' }, take: 5 }),
              );
              speculativeOrdersPromise.catch(() => {});
            }
            const _tClassify = Date.now(); // [PROFILE] temporary
            const reply = (await llmComplete(prompt, 5)).trim().toLowerCase();
            this.logger.log(`[PROFILE] classifier LLM took ${Date.now() - _tClassify}ms`); // temporary
            ctx.intent = classifierIntents.find((i) => reply.includes(i.toLowerCase())) ?? 'other';
            break;
          }

          case 'fetch_data': {
            // Fetch a few recent orders, not just the latest — a customer with more
            // than one open order needs the LLM to be able to match a mentioned
            // order ref instead of only ever knowing about the newest one.
            // None of these intents' send_reply branches ever read ctx.orders (see the thanks/
            // farewell/greet/human/acknowledge cases below) — skip the DB round-trip entirely
            // rather than fetching data nothing downstream will look at.
            const NEVER_NEEDS_ORDERS = new Set(['thanks', 'farewell', 'greet', 'human', 'acknowledge']);
            const _tFetch = Date.now(); // [PROFILE] temporary
            if (node.config.source === 'latest_order' && options.contactId && !NEVER_NEEDS_ORDERS.has(ctx.intent ?? '')) {
              ctx.orders = speculativeOrdersPromise
                ? await speculativeOrdersPromise
                : await withTenant(this.prisma, tenantId, (tx) =>
                    tx.order.findMany({ where: { contactId: options.contactId }, orderBy: { createdAt: 'desc' }, take: 5 }),
                  );
            }
            this.logger.log(`[PROFILE] fetch_data DB took ${Date.now() - _tFetch}ms, intent=${ctx.intent}`); // temporary
            break;
          }

          case 'ask_question': {
            // Ambiguous intent → ask the configured clarifying question and
            // stop here; the customer's next message re-enters at
            // detect_intent, which should now resolve clearly from their answer.
            if (ctx.intent === 'other' && node.config.question) {
              return {
                answer: node.config.question,
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: null,
                clarifying: true,
                visitedNodeIds,
              };
            }
            break;
          }

          case 'send_reply': {
            // An explicit "talk to a human" request is unambiguous — raise the
            // ticket immediately rather than routing it through the generic
            // ESCALATE-if-the-LLM-can't-answer path below, which is meant for
            // questions the KB doesn't cover, not a customer who already knows
            // they want a person.
            if (ctx.intent === 'human') {
              const ticket = await this.tickets.create(tenantId, null, {
                subject: 'Customer asked to speak with an agent',
                description: question,
                category: 'agent_flow_handoff',
                contactId: options.contactId,
                conversationId: options.conversationId,
              });
              return {
                answer: R.humanHandoff(lang, ticket.extRef ?? ticket.id),
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: ticket.extRef,
                visitedNodeIds,
              };
            }

            // Refund eligibility is a real, deterministic check against the
            // customer's actual orders — not left to the LLM to guess at —
            // since a wrong "yes you can refund that" is a real-money mistake.
            if (ctx.intent === 'refund') {
              return this.buildRefundEligibilityReply(definition, ctx.orders ?? [], visitedNodeIds, lang, options);
            }

            // A return needs an actual delivered order and a human to arrange
            // pickup — check eligibility for real, ask which order when more
            // than one qualifies, and raise the ticket once a single order is
            // resolved, rather than leaving any of that to the LLM to guess.
            if (ctx.intent === 'return') {
              return this.buildReturnReply(tenantId, ctx.orders ?? [], question, options, visitedNodeIds, lang);
            }

            // ── Greeting — instant, no LLM needed ──
            if (ctx.intent === 'greet') {
              return {
                answer: R.greeting(lang),
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: null,
                visitedNodeIds,
              };
            }

            // ── Thanks — warm acknowledgment, and a genuine closing (customer is done) ──
            if (ctx.intent === 'thanks') {
              return {
                answer: R.thanksReply(lang),
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: null,
                closing: true,
                visitedNodeIds,
              };
            }

            // ── Farewell — friendly goodbye, and a genuine closing ──
            if (ctx.intent === 'farewell') {
              return {
                answer: R.farewell(lang),
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: null,
                closing: true,
                visitedNodeIds,
              };
            }

            // ── Acknowledgment / short reply — guide them to what we can do ──
            if (ctx.intent === 'acknowledge') {
              const menuAns = R.acknowledgeMenu(lang);
              return {
                answer: options.channel === 'voice' ? stripMarkdownForSpeech(menuAns) : menuAns,
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: null,
                visitedNodeIds,
              };
            }

            // ── Tracking — template response from real DB data, no LLM needed ──
            if (ctx.intent === 'track') {
              return this.buildTrackingReply(ctx.orders ?? [], question, visitedNodeIds, lang, options);
            }

            // Handle non-delivery complaint when a customer says "not received" for a delivered order
            const isNonDeliveryComplaint = /not received|didn't get|haven't received|never arrived|missing package|not here/i.test(question);
            const normalizedQuestion = normalizeRef(question);
            let matchedOrder = ctx.orders?.find((o) => o.extRef && normalizedQuestion.includes(normalizeRef(o.extRef)));
            const relevantOrders = matchedOrder ? [matchedOrder] : ctx.orders;
            const targetOrder = matchedOrder ?? (relevantOrders?.length === 1 ? relevantOrders?.[0] : null);

            if (isNonDeliveryComplaint && targetOrder && targetOrder.status === 'delivered') {
              const ticket = await this.tickets.create(tenantId, null, {
                subject: `Non-delivery complaint for ${targetOrder.extRef ?? targetOrder.id}`,
                description: `Customer states order ${targetOrder.extRef ?? targetOrder.id} was not received despite status being delivered. Question: ${question}`,
                category: 'non_delivery_complaint',
                contactId: options.contactId,
                conversationId: options.conversationId,
              });
              return {
                answer: R.nonDeliveryEscalated(lang, targetOrder.extRef ?? targetOrder.id, ticket.extRef ?? ticket.id),
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: ticket.extRef,
                visitedNodeIds,
              };
            }

            // ── LLM fallback — only for genuinely ambiguous questions ──
            // KB search is the only DB call needed here.
            const _tKb = Date.now(); // [PROFILE] temporary
            const articles = await this.kb.searchByKeyword(tenantId, question);
            this.logger.log(`[PROFILE] KB search took ${Date.now() - _tKb}ms`); // temporary

            const kbContext = articles.map((a) => `# ${a.title}\n${a.body}`).join('\n---\n');

            const orderLine = relevantOrders?.length
              ? `Their orders, most recent first:\n` +
                relevantOrders
                  .map(
                    (o) =>
                      `- ${o.extRef ?? o.id}: "${o.description ?? 'item'}", status: ${o.status ?? 'unknown'}, amount: ₹${o.amount ?? '?'}`,
                  )
                  .join('\n') +
                `\n\nIf the customer's question names or refers to a specific order reference, answer about that one. Otherwise ` +
                `answer about the most recent order (listed first) and state its reference explicitly so they know ` +
                `which order you mean.\n\n`
              : '';
            const styleInstruction = options.channel === 'voice' ? `${VOICE_STYLE_INSTRUCTION} ` : '';
            const prompt =
              `You are Astra, the support assistant. ${styleInstruction}The customer's detected intent is ` +
              `"${ctx.intent ?? 'other'}". ${orderLine}Answer the customer ONLY using the knowledge base context ` +
              `below (and the order details above if relevant). ${languageInstruction(language)} If the answer is not in the ` +
              `context, or the issue needs a human (like a refund or complaint), reply with exactly the word ` +
              `ESCALATE.\n\nContext:\n${kbContext || '(no matching knowledge base articles)'}\n\n` +
              `Customer question: ${question}`;

            const _tGen = Date.now(); // [PROFILE] temporary
            const reply = await (llmFn ?? llmComplete)(prompt);
            this.logger.log(`[PROFILE] answer-generation LLM took ${Date.now() - _tGen}ms, total run() so far ${Date.now() - t0}ms`); // temporary
            const escalate = reply.trim().toUpperCase() === 'ESCALATE';
            const answer = options.channel === 'voice' ? stripMarkdownForSpeech(reply) : reply;

            let ticketRef: string | null = null;
            if (escalate) {
              const ticket = await this.tickets.create(tenantId, null, {
                subject: question.slice(0, 60),
                description: question,
                category: 'agent_flow_escalation',
                contactId: options.contactId,
                conversationId: options.conversationId,
              });
              ticketRef = ticket.extRef;
            }

            // Fire-and-forget — don't block the response on citation recording
            if (!escalate && articles.length > 0) {
              this.kb.recordCitations(tenantId, articles.map((a) => a.id)).catch(() => {});
            }

            return {
              answer: escalate ? R.escalatedGeneric(lang, ticketRef) : answer,
              escalate,
              configured: true,
              sources: articles.map((a) => a.title),
              ticketRef,
              visitedNodeIds,
            };
          }

          case 'human_handoff':
            break; // escalation itself already happened in send_reply
        }

        const idx = definition.nodes.indexOf(node);
        node = node.nextId ? byId.get(node.nextId) : definition.nodes[idx + 1];
      }

      // Flow had no send_reply node — nothing to say.
      return { answer: null, escalate: false, configured: true, sources: [], ticketRef: null, visitedNodeIds };
    } catch (err) {
      if (err instanceof LlmAuthError) {
        this.logger.warn(err.message);
        return { answer: R.notConfigured(lang), escalate: false, configured: false, sources: [], ticketRef: null, visitedNodeIds };
      }
      throw err;
    }
  }

  /**
   * Real, deterministic refund-eligibility answer — checks the customer's
   * actual orders against the fetch_data block's configured refund window
   * (Agent Builder → Fetch order details → "Refund eligibility window") and
   * NEVER-refundable statuses, rather than letting the LLM freely decide.
   * Handles the zero-orders case explicitly instead of leaving the LLM to
   * improvise with no context.
   */
  private buildRefundEligibilityReply(
    definition: AgentFlowDefinition,
    orders: Order[],
    visitedNodeIds: string[],
    lang: Lang,
    options?: RunOptions,
  ): AstraAnswerDto {
    if (orders.length === 0) {
      return {
        answer: R.refundNoOrders(lang),
        escalate: false,
        configured: true,
        sources: [],
        ticketRef: null,
        visitedNodeIds,
      };
    }

    const fetchDataNode = definition.nodes.find((n) => n.type === 'fetch_data');
    const windowDays = fetchDataNode?.config.refundWindowDays ?? 7;

    const eligible = orders.filter((o) => isRefundEligible(o, windowDays));
    const ineligible = orders.filter((o) => !isRefundEligible(o, windowDays));

    const lines: string[] = [];
    if (eligible.length > 0) {
      lines.push(R.refundEligibleHeader(lang, windowDays));
      lines.push(...eligible.map((o) => R.formatOrderLine(o)));
    } else {
      lines.push(R.refundNoneEligible(lang));
    }
    if (ineligible.length > 0) {
      lines.push('', R.refundNotEligibleHeader(lang));
      lines.push(...ineligible.map((o) => R.formatOrderLine(o, R.ineligibleReason(lang, o, windowDays))));
    }
    if (eligible.length > 0) {
      lines.push('', R.refundFooter(lang));
    }

    const fullAnswer = lines.join('\n');
    return {
      answer: options?.channel === 'voice' ? stripMarkdownForSpeech(fullAnswer) : fullAnswer,
      escalate: false,
      configured: true,
      sources: [],
      ticketRef: null,
      visitedNodeIds,
    };
  }

  /**
   * Real return handling: only a delivered order is eligible (an in-transit
   * or already-refunded/cancelled one has nothing to return), and returns
   * need an actual person to arrange pickup — so this raises a real ticket
   * rather than just describing eligibility like the refund reply does.
   * When more than one order qualifies it asks which one first; the
   * customer's next message (typically just an order ref) resolves back to
   * `ctx.intent === 'return'` via the ref-only shortcut in detect_intent above.
   */
  private async buildReturnReply(
    tenantId: string,
    orders: Order[],
    question: string,
    options: RunOptions,
    visitedNodeIds: string[],
    lang: Lang,
  ): Promise<AstraAnswerDto> {
    const eligible = orders.filter((o) => o.status === 'delivered');

    if (eligible.length === 0) {
      return {
        answer: R.returnNoneEligible(lang),
        escalate: false,
        configured: true,
        sources: [],
        ticketRef: null,
        visitedNodeIds,
      };
    }

    const normalizedQuestion = normalizeRef(question);
    const matchedOrder = eligible.find((o) => o.extRef && normalizedQuestion.includes(normalizeRef(o.extRef)));
    const target = eligible.length === 1 ? eligible[0] : matchedOrder;

    if (!target) {
      const refs = eligible.map((o) => o.extRef ?? o.id).join(' or ');
      return {
        answer: R.returnWhichOne(lang, eligible.length, refs),
        escalate: false,
        configured: true,
        sources: [],
        ticketRef: null,
        clarifying: true,
        visitedNodeIds,
      };
    }

    const ticket = await this.tickets.create(tenantId, null, {
      subject: `Return request — ${target.extRef ?? target.id}`,
      description: `Customer wants to return order ${target.extRef ?? target.id} ("${target.description ?? 'item'}"). Their message: ${question}`,
      category: 'agent_flow_return',
      contactId: options.contactId,
      conversationId: options.conversationId,
    });

    return {
      answer: R.returnCreated(lang, target.extRef ?? target.id, target.description ?? 'item', ticket.extRef ?? ticket.id),
      escalate: false,
      configured: true,
      sources: [],
      ticketRef: ticket.extRef,
      visitedNodeIds,
    };
  }

  /**
   * Instant tracking reply built from real DB data — no LLM call.
   * Covers: no orders, single order, multiple orders, specific ref match.
   */
  private buildTrackingReply(
    orders: Order[],
    question: string,
    visitedNodeIds: string[],
    lang: Lang,
    options?: RunOptions,
  ): AstraAnswerDto {
    const isVoice = options?.channel === 'voice';

    if (orders.length === 0) {
      return {
        answer: R.trackAskForRef(lang),
        escalate: false,
        configured: true,
        sources: [],
        ticketRef: null,
        clarifying: true,
        visitedNodeIds,
      };
    }

    // Check if customer mentioned a specific order ref
    const normalizedQ = normalizeRef(question);
    const matchedOrder = orders.find((o) => o.extRef && normalizedQ.includes(normalizeRef(o.extRef)));

    if (matchedOrder) {
      const rawAns = `${R.trackingStatusHeader(lang)}\n\n${R.formatOrderCard(lang, matchedOrder)}`;
      return {
        answer: isVoice ? stripMarkdownForSpeech(rawAns) : rawAns,
        escalate: false,
        configured: true,
        sources: [],
        ticketRef: null,
        visitedNodeIds,
      };
    }

    // Multiple in-transit orders — ask which one
    const inTransit = orders.filter((o) => o.status === 'in_transit');
    if (inTransit.length > 1) {
      const refs = inTransit.map((o) => o.extRef ?? o.id).join(' or ');
      return {
        answer: R.trackingWhichOne(lang, inTransit.length, refs),
        escalate: false,
        configured: true,
        sources: [],
        ticketRef: null,
        clarifying: true,
        visitedNodeIds,
      };
    }

    // Single order or single in-transit — show it
    const target = inTransit.length === 1 ? inTransit[0] : orders[0];
    const rawAns = `${R.trackingLatestHeader(lang)}\n\n${R.formatOrderCard(lang, target!)}`;
    return {
      answer: isVoice ? stripMarkdownForSpeech(rawAns) : rawAns,
      escalate: false,
      configured: true,
      sources: [],
      ticketRef: null,
      visitedNodeIds,
    };
  }
}
