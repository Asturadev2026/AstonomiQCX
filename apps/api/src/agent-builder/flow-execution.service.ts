import { Injectable, Logger } from '@nestjs/common';
import { getPrisma, withTenant, type Order } from '@aq/db';
import type { AgentFlowDefinition, AstraAnswerDto, FlowNode } from '@aq/shared';
import { KbService } from '../kb/kb.service';
import { TicketsService } from '../tickets/tickets.service';
import { isConfigured, llmComplete, LlmAuthError } from '../ai/llm';
import { stripMarkdownForSpeech, VOICE_STYLE_INSTRUCTION } from '../ai/reply-style';
import { AgentFlowService } from './agent-flow.service';

interface RunOptions {
  language?: string;
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

function ineligibleReason(order: Order, windowDays: number): string {
  if (order.status === 'refunded') return 'already refunded';
  if (order.status === 'cancelled') return 'order cancelled';
  if (order.status !== 'delivered') return `not yet delivered (currently ${order.status ?? 'unknown'})`;
  return `delivered more than ${windowDays} days ago`;
}

function formatOrderLine(order: Order, reason?: string): string {
  const base = `- ${order.extRef ?? order.id}: "${order.description ?? 'item'}" — ₹${order.amount ?? '?'}`;
  return reason ? `${base} (${reason})` : base;
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
    if (!isConfigured()) {
      return { answer: null, escalate: false, configured: false, sources: [], ticketRef: null, visitedNodeIds: [] };
    }

    // Use the preloaded flow when available; only fall back to DB when called directly.
    const flow = preloadedFlow !== undefined ? preloadedFlow : await this.flows.findPublishedChatFlow(tenantId);
    if (!flow) {
      // Caller (AiService) should have checked first — fall back safely rather than 500.
      return { answer: null, escalate: false, configured: false, sources: [], ticketRef: null, visitedNodeIds: [] };
    }

    const definition = flow.definition as unknown as AgentFlowDefinition;
    const language = options.language ?? 'en';
    const ctx: ExecContext = {};

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
            const CONVERSATIONAL: Record<string, RegExp> = {
              thanks: /^\s*(thanks|thank\s*you|thx|ty|dhanyavaad|shukriya|appreciated)\s*[!.]*\s*$/i,
              farewell: /^\s*(bye|goodbye|good\s*bye|see\s*you|take\s*care|cya|alvida)\s*[!.]*\s*$/i,
              acknowledge: /^\s*(ok|okay|k|alright|sure|got\s*it|understood|fine|right|hm+|cool|great|nice|perfect|no\s*problem|np|accha|theek\s*hai|haan|yes|no|yeah|yep|nope|nah|hmm+)\s*[!.]*\s*$/i,
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
            const keywordMap: Record<string, RegExp> = {
              track:  /\b(track|where.*order|order.*where|deliver|shipped|shipment|transit|package|parcel|status)\b/i,
              refund: /\b(refund|money back|reimburs|paid.*back|cashback)\b/i,
              return: /\b(return|send.*back|give.*back|take.*back|exchange|replace)\b/i,
              human:  /\b(human|agent|person|speak.*to|talk.*to|real person|live agent|customer.?care|support team)\b/i,
              greet:  /^(hi|hello|hey|namaste|good (morning|afternoon|evening)|hiya|sup)\b/i,
            };

            const keywordIntent = intents.find((intent) => keywordMap[intent]?.test(q));
            if (keywordIntent) {
              ctx.intent = keywordIntent;
              break;
            }

            // Fallback: ask the LLM only when keywords don't resolve the intent.
            // max_tokens:5 — we only need one word back ("track", "refund", etc.)
            const prompt =
              `Classify the customer's message into exactly one of these intents: ${intents.join(', ')}. ` +
              `Reply with ONLY the intent word, nothing else.\n\nMessage: ${question}`;
            const reply = (await llmComplete(prompt, 5)).trim().toLowerCase();
            ctx.intent = intents.find((i) => reply.includes(i.toLowerCase())) ?? 'other';
            break;
          }

          case 'fetch_data': {
            // Fetch a few recent orders, not just the latest — a customer with more
            // than one open order needs the LLM to be able to match a mentioned
            // order ref instead of only ever knowing about the newest one.
            if (node.config.source === 'latest_order' && options.contactId) {
              ctx.orders = await withTenant(this.prisma, tenantId, (tx) =>
                tx.order.findMany({ where: { contactId: options.contactId }, orderBy: { createdAt: 'desc' }, take: 5 }),
              );
            }
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
                answer: `Of course — I've raised ticket ${ticket.extRef} and one of our agents will contact you soon.`,
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
              return this.buildRefundEligibilityReply(definition, ctx.orders ?? [], visitedNodeIds);
            }

            // A return needs an actual delivered order and a human to arrange
            // pickup — check eligibility for real, ask which order when more
            // than one qualifies, and raise the ticket once a single order is
            // resolved, rather than leaving any of that to the LLM to guess.
            if (ctx.intent === 'return') {
              return this.buildReturnReply(tenantId, ctx.orders ?? [], question, options, visitedNodeIds);
            }

            // ── Greeting — instant, no LLM needed ──
            if (ctx.intent === 'greet') {
              return {
                answer: `Hello! 👋 I'm Astra, your support assistant. I can help you track orders, check refund eligibility, arrange returns, or connect you with a human agent. What can I help you with?`,
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: null,
                visitedNodeIds,
              };
            }

            // ── Thanks — warm acknowledgment ──
            if (ctx.intent === 'thanks') {
              return {
                answer: `You're welcome! 😊 Is there anything else I can help you with?`,
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: null,
                visitedNodeIds,
              };
            }

            // ── Farewell — friendly goodbye ──
            if (ctx.intent === 'farewell') {
              return {
                answer: `Goodbye! 👋 Feel free to reach out anytime you need help. Have a great day!`,
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: null,
                visitedNodeIds,
              };
            }

            // ── Acknowledgment / short reply — guide them to what we can do ──
            if (ctx.intent === 'acknowledge') {
              return {
                answer: `Is there anything else I can help you with? I can assist with:\n\n📦 **Order tracking**\n💰 **Refund eligibility**\n↩️ **Returns**\n👤 **Connect to a human agent**\n\nJust let me know!`,
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: null,
                visitedNodeIds,
              };
            }

            // ── Tracking — template response from real DB data, no LLM needed ──
            if (ctx.intent === 'track') {
              return this.buildTrackingReply(ctx.orders ?? [], question, visitedNodeIds);
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
                answer: `I'm sorry to hear that you haven't received order ${targetOrder.extRef ?? targetOrder.id} despite it being marked as delivered. I've raised escalation ticket ${ticket.extRef} for our logistics team to investigate immediately.`,
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: ticket.extRef,
                visitedNodeIds,
              };
            }

            // ── LLM fallback — only for genuinely ambiguous questions ──
            // KB search is the only DB call needed here.
            const articles = await this.kb.searchByKeyword(tenantId, question);

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
              `below (and the order details above if relevant). Reply in ${language}. If the answer is not in the ` +
              `context, or the issue needs a human (like a refund or complaint), reply with exactly the word ` +
              `ESCALATE.\n\nContext:\n${kbContext || '(no matching knowledge base articles)'}\n\n` +
              `Customer question: ${question}`;

            const reply = await (llmFn ?? llmComplete)(prompt);
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
              answer: escalate ? null : answer,
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
        return { answer: null, escalate: false, configured: false, sources: [], ticketRef: null, visitedNodeIds };
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
  ): AstraAnswerDto {
    if (orders.length === 0) {
      return {
        answer:
          "I don't see any orders on your account, so there's nothing to check for a refund. If you placed the order with a different phone number or email, let me know and I'll look again.",
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
      lines.push(`These orders are eligible for a refund (delivered within the last ${windowDays} days):`);
      lines.push(...eligible.map((o) => formatOrderLine(o)));
    } else {
      lines.push('None of your recent orders are currently eligible for a refund.');
    }
    if (ineligible.length > 0) {
      lines.push('', 'Not eligible:');
      lines.push(...ineligible.map((o) => formatOrderLine(o, ineligibleReason(o, windowDays))));
    }
    if (eligible.length > 0) {
      lines.push('', 'Reply with the order reference to start a refund on an eligible order.');
    }

    return { answer: lines.join('\n'), escalate: false, configured: true, sources: [], ticketRef: null, visitedNodeIds };
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
  ): Promise<AstraAnswerDto> {
    const eligible = orders.filter((o) => o.status === 'delivered');

    if (eligible.length === 0) {
      return {
        answer:
          "I don't see any delivered orders on your account that are eligible for a return. If you placed the order with a different phone number or email, let me know and I'll look again.",
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
        answer: `You have ${eligible.length} delivered orders eligible for return — ${refs}. Which one would you like to return?`,
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
      answer: `Got it — I've raised a return request for ${target.extRef ?? target.id} ("${target.description ?? 'item'}"), ticket ${ticket.extRef}. One of our agents will contact you soon to arrange the pickup.`,
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
  ): AstraAnswerDto {
    if (orders.length === 0) {
      return {
        answer: `I'd be happy to help track your order! Could you please share your order reference number (e.g. ZK-123)?`,
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

    const STATUS_LABELS: Record<string, string> = {
      in_transit: '🚚 In Transit — your order is on its way',
      delivered: '✅ Delivered',
      cancelled: '❌ Cancelled',
      processing: '⏳ Processing — we\'re preparing your order',
      shipped: '📦 Shipped — your order has left the warehouse',
      returned: '↩️ Returned',
      refunded: '💰 Refunded',
    };

    const formatOrder = (o: Order): string => {
      const ref = o.extRef ?? o.id;
      const desc = o.description ?? 'item';
      const status = STATUS_LABELS[o.status ?? ''] ?? `Status: ${o.status ?? 'unknown'}`;
      const amount = o.amount ? `₹${o.amount}` : '';
      return `**${ref}** — "${desc}" ${amount}\n${status}`;
    };

    if (matchedOrder) {
      return {
        answer: `Here's the status of your order:\n\n${formatOrder(matchedOrder)}`,
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
        answer: `You have ${inTransit.length} orders currently in transit — ${refs}. Which one would you like to check?`,
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
    return {
      answer: `Here's the latest on your order:\n\n${formatOrder(target!)}`,
      escalate: false,
      configured: true,
      sources: [],
      ticketRef: null,
      visitedNodeIds,
    };
  }
}
