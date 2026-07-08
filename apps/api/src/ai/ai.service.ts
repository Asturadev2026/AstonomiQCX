import { Injectable, Logger } from '@nestjs/common';
import type { AstraAnswerDto } from '@aq/shared';
import { KbService } from '../kb/kb.service';
import { TicketsService } from '../tickets/tickets.service';
import { isConfigured, llmComplete, LlmAuthError } from './llm';

/**
 * Astra, the RAG support chatbot — Guide §10.3. Answers ONLY from the
 * tenant's own Knowledge Base, escalating to a human when the KB doesn't
 * cover it. KB search is keyword-based for now (see KbService.searchByKeyword
 * for why) — swap for pgvector cosine search once an embeddings key exists;
 * everything downstream of "here are the matching articles" stays the same.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private kb: KbService,
    private tickets: TicketsService,
  ) {}

  async ask(tenantId: string, question: string, language = 'en'): Promise<AstraAnswerDto> {
    if (!isConfigured()) {
      return { answer: null, escalate: false, configured: false, sources: [], ticketRef: null };
    }

    const articles = await this.kb.searchByKeyword(tenantId, question);
    const context = articles.map((a) => `# ${a.title}\n${a.body}`).join('\n---\n');

    const prompt =
      `You are Astra, the support assistant. Answer the customer ONLY using the context below. ` +
      `Reply in ${language}. If the answer is not in the context, or the issue needs a human ` +
      `(like a refund or complaint), reply with exactly the word ESCALATE.\n\n` +
      `Context:\n${context || '(no matching knowledge base articles)'}\n\nCustomer question: ${question}`;

    try {
      const reply = await llmComplete(prompt);
      const escalate = reply.trim().toUpperCase() === 'ESCALATE';

      // Guide §10.4: "If it says escalate, we do not guess — we mark the
      // conversation for a human and ... raise a ticket." No real
      // conversation/channel exists yet for this demo chatbot, so there's no
      // human to hand off to directly — raising the ticket is the concrete
      // part of that behavior we can do today.
      let ticketRef: string | null = null;
      if (escalate) {
        const ticket = await this.tickets.create(tenantId, null, {
          subject: question.slice(0, 60),
          description: question,
          category: 'chatbot_escalation',
        });
        ticketRef = ticket.extRef;
      }

      return {
        answer: escalate ? null : reply,
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
