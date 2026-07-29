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

  async run(tenantId: string, question: string, options: RunOptions = {}): Promise<AstraAnswerDto> {
    if (!isConfigured()) {
      return { answer: null, escalate: false, configured: false, sources: [], ticketRef: null };
    }

    const flow = await this.flows.findPublishedChatFlow(tenantId);
    if (!flow) {
      // Caller (AiService) should have checked first — fall back safely rather than 500.
      return { answer: null, escalate: false, configured: false, sources: [], ticketRef: null };
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

    try {
      while (node && steps++ < definition.nodes.length * 2) {
        switch (node.type) {
          case 'trigger':
            break; // entry point only

          case 'detect_intent': {
            const intents = node.config.intents ?? ['other'];
            // A reply that's essentially just an order ref (e.g. answering "which
            // order?" with "zk6") is unambiguously about tracking — classify it
            // directly rather than asking the LLM, which tends to call a ref-only
            // reply "other" and re-trigger ask_question's own clarifying question,
            // ignoring the answer the customer just gave.
            if (intents.includes('track') && /zk\d+/.test(normalizeRef(question))) {
              ctx.intent = 'track';
              break;
            }
            const prompt =
              `Classify the customer's message into exactly one of these intents: ${intents.join(', ')}. ` +
              `Reply with ONLY the intent word, nothing else.\n\nMessage: ${question}`;
            const reply = (await llmComplete(prompt)).trim().toLowerCase();
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
              };
            }
            break;
          }

          case 'send_reply': {
            // Resolve a mentioned order ref up front (case/hyphen-insensitive) so a
            // reply like "zk6" reliably matches "ZK-6" — both for skipping the
            // ambiguity check below and for narrowing what the LLM sees, so it can't
            // pick the wrong order out of a list when the customer already named one.
            const normalizedQuestion = normalizeRef(question);
            const matchedOrder = ctx.orders?.find((o) => o.extRef && normalizedQuestion.includes(normalizeRef(o.extRef)));
            const relevantOrders = matchedOrder ? [matchedOrder] : ctx.orders;

            // More than one order genuinely in transit is ambiguous for a tracking
            // question — "most recent" isn't a safe default when several are equally
            // "on their way". Ask which one instead of guessing, unless the customer
            // already named a specific order ref.
            const inTransitOrders = ctx.orders?.filter((o) => o.status === 'in_transit') ?? [];
            const looksLikeOrderQuestion =
              ctx.intent === 'track' ||
              (ctx.intent === undefined && /order|track|deliver|shipped|shipment|transit|package|parcel/i.test(question));
            if (inTransitOrders.length > 1 && !matchedOrder && looksLikeOrderQuestion) {
              const refs = inTransitOrders.map((o) => o.extRef ?? o.id).join(' or ');
              return {
                answer: `You have ${inTransitOrders.length} orders currently in transit — ${refs}. Which one would you like to check?`,
                escalate: false,
                configured: true,
                sources: [],
                ticketRef: null,
                clarifying: true,
              };
            }

            const articles = await this.kb.searchByKeyword(tenantId, question);
            const kbContext = articles.map((a) => `# ${a.title}\n${a.body}`).join('\n---\n');
            // List every relevant order rather than just the newest — lets the LLM
            // match a specific order ref the customer mentions instead of always
            // defaulting to the latest one, while still instructing it to name which
            // order it means so a multi-order customer never gets an ambiguous answer.
            const orderLine = relevantOrders?.length
              ? `Their orders, most recent first:\n` +
                relevantOrders
                  .map(
                    (o) =>
                      `- ${o.extRef ?? o.id}: "${o.description ?? 'item'}", status: ${o.status ?? 'unknown'}, amount: ₹${o.amount ?? '?'}`,
                  )
                  .join('\n') +
                `\n\nIf the customer's question names a specific order reference, answer about that one. Otherwise ` +
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

            const reply = await llmComplete(prompt);
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

            if (!escalate && articles.length > 0) {
              await this.kb.recordCitations(tenantId, articles.map((a) => a.id));
            }

            return {
              answer: escalate ? null : answer,
              escalate,
              configured: true,
              sources: articles.map((a) => a.title),
              ticketRef,
            };
          }

          case 'human_handoff':
            break; // escalation itself already happened in send_reply
        }

        const idx = definition.nodes.indexOf(node);
        node = node.nextId ? byId.get(node.nextId) : definition.nodes[idx + 1];
      }

      // Flow had no send_reply node — nothing to say.
      return { answer: null, escalate: false, configured: true, sources: [], ticketRef: null };
    } catch (err) {
      if (err instanceof LlmAuthError) {
        this.logger.warn(err.message);
        return { answer: null, escalate: false, configured: false, sources: [], ticketRef: null };
      }
      throw err;
    }
  }
}
