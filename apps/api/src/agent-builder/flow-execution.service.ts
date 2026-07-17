import { Injectable, Logger } from '@nestjs/common';
import { getPrisma, withTenant, type Order } from '@aq/db';
import type { AgentFlowDefinition, AstraAnswerDto } from '@aq/shared';
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
  order?: Order | null;
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

    try {
      for (const node of definition.nodes) {
        switch (node.type) {
          case 'trigger':
            break; // entry point only

          case 'detect_intent': {
            const intents = node.config.intents ?? ['other'];
            const prompt =
              `Classify the customer's message into exactly one of these intents: ${intents.join(', ')}. ` +
              `Reply with ONLY the intent word, nothing else.\n\nMessage: ${question}`;
            const reply = (await llmComplete(prompt)).trim().toLowerCase();
            ctx.intent = intents.find((i) => reply.includes(i.toLowerCase())) ?? 'other';
            break;
          }

          case 'fetch_data': {
            if (node.config.source === 'latest_order' && options.contactId) {
              ctx.order = await withTenant(this.prisma, tenantId, (tx) =>
                tx.order.findFirst({ where: { contactId: options.contactId }, orderBy: { createdAt: 'desc' } }),
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
            const articles = await this.kb.searchByKeyword(tenantId, question);
            const kbContext = articles.map((a) => `# ${a.title}\n${a.body}`).join('\n---\n');
            const orderLine = ctx.order
              ? `Their most recent order: ${ctx.order.extRef ?? ctx.order.id}, "${ctx.order.description ?? 'item'}", ` +
                `status: ${ctx.order.status ?? 'unknown'}, amount: ₹${ctx.order.amount ?? '?'}.\n\n`
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
