import { Injectable, Logger } from '@nestjs/common';
import type { AstraAnswerDto } from '@aq/shared';
import { AgentFlowService } from '../agent-builder/agent-flow.service';
import { FlowExecutionService } from '../agent-builder/flow-execution.service';
import { KbService } from '../kb/kb.service';
import { TicketsService } from '../tickets/tickets.service';
import { isConfigured, llmComplete, LlmAuthError } from './llm';
import { stripMarkdownForSpeech, VOICE_STYLE_INSTRUCTION } from './reply-style';

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

    const styleInstruction = options.channel === 'voice' ? `${VOICE_STYLE_INSTRUCTION} ` : '';
    const prompt =
      `You are Astra, the support assistant. ${styleInstruction}Answer the customer ONLY using the context below. ` +
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
