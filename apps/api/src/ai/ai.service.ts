import { Injectable, Logger } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import type { AstraAnswerDto } from '@aq/shared';
import { AgentFlowService } from '../agent-builder/agent-flow.service';
import { FlowExecutionService } from '../agent-builder/flow-execution.service';
import { KbService } from '../kb/kb.service';
import { TicketsService } from '../tickets/tickets.service';
import { isConfigured, llmComplete, LlmAuthError } from './llm';
import { stripMarkdownForSpeech, VOICE_STYLE_INSTRUCTION } from './reply-style';

const ORDER_QUERY_RE = /order|track|deliver|shipped|shipment|transit|package|parcel|where.*order|order.*where/i;
const NON_DELIVERY_RE = /not received|didn't get|haven't received|never arrived|missing package|not here/i;

function normalizeRef(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Astra, the RAG support chatbot — Guide §10.3. Answers ONLY from the
 * tenant's own Knowledge Base, escalating to a human when the KB doesn't
 * cover it. KB search is keyword-based for now (see KbService.searchByKeyword
 * for why) — swap for pgvector cosine search once an embeddings key exists;
 * everything downstream of "here are the matching articles" stays the same.
 *
 * If the tenant has published an Agent Builder flow (Guide §1.3/§12), that
 * flow's real node-by-node execution (intent detection, order lookup,
 * clarifying questions, escalation) takes over instead of this plain path —
 * every channel (Chatbot/WhatsApp/Voice) gets that behavior automatically.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private prisma = getPrisma();

  constructor(
    private kb: KbService,
    private tickets: TicketsService,
    private flows: AgentFlowService,
    private flowExecution: FlowExecutionService,
  ) {}

  async ask(
    tenantId: string,
    question: string,
    options: { language?: string; contactId?: string; conversationId?: string; channel?: 'chat' | 'whatsapp' | 'voice' } = {},
  ): Promise<AstraAnswerDto> {
    const language = options.language ?? 'en';
    if (!isConfigured()) {
      return { answer: null, escalate: false, configured: false, sources: [], ticketRef: null };
    }

    const publishedFlow = await this.flows.findPublishedChatFlow(tenantId);
    if (publishedFlow) {
      return this.flowExecution.run(tenantId, question, options);
    }

    const articles = await this.kb.searchByKeyword(tenantId, question);
    const context = articles.map((a) => `# ${a.title}\n${a.body}`).join('\n---\n');

    const recentMessages = options.conversationId
      ? await withTenant(this.prisma, tenantId, (tx) =>
          tx.message.findMany({
            where: { conversationId: options.conversationId },
            orderBy: { createdAt: 'desc' },
            take: 6,
          }),
        )
      : [];

    const historyBlock = recentMessages.length
      ? `Recent conversation history (most recent last):\n` +
        recentMessages
          .slice()
          .reverse()
          .map((m) => `- ${m.senderType === 'customer' ? 'Customer' : 'Astra'}: ${m.body ?? ''}`)
          .join('\n') +
        `\n\n`
      : '';

    // Order-aware path for tenants without a published Agent Builder flow.
    // Mirrors FlowExecutionService so that "where is my order" / "not received"
    // queries work on all channels regardless of whether a flow is published.
    const looksLikeOrderQuery = ORDER_QUERY_RE.test(question) || NON_DELIVERY_RE.test(question);
    if (looksLikeOrderQuery && options.contactId) {
      const orders = await withTenant(this.prisma, tenantId, (tx) =>
        tx.order.findMany({ where: { contactId: options.contactId }, orderBy: { createdAt: 'desc' }, take: 5 }),
      );

      // Match an explicit order ref in the question, then fall back to recent history.
      const normalizedQ = normalizeRef(question);
      let matchedOrder = orders.find((o) => o.extRef && normalizedQ.includes(normalizeRef(o.extRef)));
      if (!matchedOrder && recentMessages.length) {
        const historyText = recentMessages.map((m) => normalizeRef(m.body ?? '')).join(' ');
        matchedOrder = orders.find((o) => o.extRef && historyText.includes(normalizeRef(o.extRef)));
      }
      const relevantOrders = matchedOrder ? [matchedOrder] : orders;
      const targetOrder = matchedOrder ?? (relevantOrders.length === 1 ? relevantOrders[0] : null);

      // Non-delivery on a delivered order → immediate logistics ticket.
      if (NON_DELIVERY_RE.test(question) && targetOrder?.status === 'delivered') {
        try {
          const ticket = await this.tickets.create(tenantId, null, {
            subject: `Non-delivery complaint for ${targetOrder.extRef ?? targetOrder.id}`,
            description: `Customer states order ${targetOrder.extRef ?? targetOrder.id} was not received despite status being delivered. Question: ${question}`,
            category: 'non_delivery_complaint',
            contactId: options.contactId,
            conversationId: options.conversationId,
          });
          return {
            answer: `I'm sorry to hear that — order ${targetOrder.extRef ?? targetOrder.id} shows as delivered but you haven't received it. I've raised escalation ticket ${ticket.extRef} for our logistics team to investigate immediately.`,
            escalate: false,
            configured: true,
            sources: [],
            ticketRef: ticket.extRef,
          };
        } catch (err) {
          if (err instanceof LlmAuthError) {
            this.logger.warn((err as Error).message);
            return { answer: null, escalate: false, configured: false, sources: [], ticketRef: null };
          }
          throw err;
        }
      }

      // No orders on record — ask for the order reference rather than
      // falling through to the plain KB path which has nothing to ground on
      // and will respond with ESCALATE for any order-related question.
      if (orders.length === 0) {
        return {
          answer: `I'd be happy to help track your order! Could you please share your order reference number (e.g. ZK-123)?`,
          escalate: false,
          configured: true,
          sources: [],
          ticketRef: null,
        };
      }

      if (orders.length > 0) {
        const orderLine =
          `Customer's orders, most recent first:\n` +
          relevantOrders
            .map((o) => `- ${o.extRef ?? o.id}: "${o.description ?? 'item'}", status: ${o.status ?? 'unknown'}, amount: ₹${o.amount ?? '?'}`)
            .join('\n') +
          `\n\nIf the customer's question names or refers to a specific order reference, answer about that one. Otherwise answer about the most recent order and state its reference explicitly.\n\n`;
        const styleInstruction = options.channel === 'voice' ? `${VOICE_STYLE_INSTRUCTION} ` : '';
        const prompt =
          `You are Astra, the support assistant. ${styleInstruction}${historyBlock}${orderLine}Answer the customer ONLY using the knowledge base context ` +
          `below and the order details above. Reply in ${language}. If the issue needs a human ` +
          `(like a complaint or account dispute), reply with exactly the word ESCALATE.\n\n` +
          `Context:\n${context || '(no matching knowledge base articles)'}\n\nCustomer question: ${question}`;

        try {
          const reply = await llmComplete(prompt);
          const escalate = reply.trim().toUpperCase() === 'ESCALATE';
          const answer = options.channel === 'voice' ? stripMarkdownForSpeech(reply) : reply;
          let ticketRef: string | null = null;
          if (escalate) {
            const ticket = await this.tickets.create(tenantId, null, {
              subject: question.slice(0, 60),
              description: question,
              category: 'chatbot_escalation',
              contactId: options.contactId,
              conversationId: options.conversationId,
            });
            ticketRef = ticket.extRef;
          }
          return { answer: escalate ? null : answer, escalate, configured: true, sources: articles.map((a) => a.title), ticketRef };
        } catch (err) {
          if (err instanceof LlmAuthError) {
            this.logger.warn((err as Error).message);
            return { answer: null, escalate: false, configured: false, sources: [], ticketRef: null };
          }
          throw err;
        }
      }
    }

    const styleInstruction = options.channel === 'voice' ? `${VOICE_STYLE_INSTRUCTION} ` : '';
    const prompt =
      `You are Astra, the support assistant. ${styleInstruction}${historyBlock}Answer the customer ONLY using the context below (and conversation history above if relevant). ` +
      `Reply in ${language}. If the answer is not in the context, or the issue needs a human ` +
      `(like a refund or complaint), reply with exactly the word ESCALATE.\n\n` +
      `Context:\n${context || '(no matching knowledge base articles)'}\n\nCustomer question: ${question}`;

    try {
      const reply = await llmComplete(prompt);
      const escalate = reply.trim().toUpperCase() === 'ESCALATE';
      const answer = options.channel === 'voice' ? stripMarkdownForSpeech(reply) : reply;

      // Guide §10.4: "If it says escalate, we do not guess — we mark the
      // conversation for a human and ... raise a ticket." Links to the real
      // contact/conversation when the caller has one (e.g. WhatsApp).
      let ticketRef: string | null = null;
      if (escalate) {
        const ticket = await this.tickets.create(tenantId, null, {
          subject: question.slice(0, 60),
          description: question,
          category: 'chatbot_escalation',
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
    } catch (err) {
      if (err instanceof LlmAuthError) {
        this.logger.warn(err.message);
        return { answer: null, escalate: false, configured: false, sources: [], ticketRef: null };
      }
      throw err;
    }
  }
}
