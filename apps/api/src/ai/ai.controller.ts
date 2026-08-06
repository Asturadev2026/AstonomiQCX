import { Body, Controller, Logger, Post, Req } from '@nestjs/common';
import type { AstraAnswerDto } from '@aq/shared';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { ConversationsService } from '../conversations/conversations.service';
import { AiService } from './ai.service';
import { AskAstraDto } from './ask-astra.dto';

/** Not guarded yet — same rationale as KbController (see its comment). */
@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private svc: AiService,
    private conversations: ConversationsService,
  ) {}

  @Post('ask')
  async ask(@Req() req: TenantScopedRequest, @Body() dto: AskAstraDto): Promise<AstraAnswerDto> {
    // No channel → a caller that isn't one of the customer-facing widgets
    // (or an older client) — answer only, same as before this existed.
    if (!dto.channel) {
      return this.svc.ask(req.tenantId, dto.question, { language: dto.language, contactId: dto.contactId });
    }

    // Fire-and-forget: find/create conversation and log the inbound message
    // in the BACKGROUND, so the AI response can start immediately without
    // waiting for 2 sequential DB round-trips (~400 ms to Neon us-east-1).
    // The conversationId is resolved asynchronously — the AI service runs
    // WITHOUT it initially, and the outbound log runs after both complete.
    const conversationPromise = this.conversations
      .findOrCreateOpenConversation(req.tenantId, {
        contactId: dto.contactId,
        channel: dto.channel,
      })
      .then(async (conversation) => {
        await this.conversations.appendMessage(req.tenantId, conversation.id, {
          senderType: 'customer',
          body: dto.question,
        });
        return conversation.id;
      })
      .catch((err) => {
        this.logger.warn(`Failed to log inbound message: ${(err as Error).message}`);
        return undefined;
      });

    // Run the AI service immediately — don't wait for conversation logging.
    // Pass conversationId as undefined; the flow can still work without it
    // (it just won't include conversation history on this first call, which
    // is fine since the customer just typed the question anyway).
    const answer = await this.svc.ask(req.tenantId, dto.question, {
      language: dto.language,
      channel: dto.channel,
      contactId: dto.contactId,
      // conversationId is not awaited here — speed over history context
    });

    // Now log the outbound message in the background (don't make the client wait).
    conversationPromise.then(async (conversationId) => {
      if (!conversationId) return;
      const replyText = !answer.configured
        ? "We're having a temporary issue — our team will follow up with you shortly."
        : answer.escalate
          ? `Thanks — I've raised this with our team (ref ${answer.ticketRef}). They'll follow up shortly.`
          : answer.answer ?? '';
      try {
        await this.conversations.appendMessage(req.tenantId, conversationId, {
          senderType: 'bot',
          body: replyText,
          sources: answer.sources,
        });
      } catch (err) {
        this.logger.warn(`Failed to log outbound message: ${(err as Error).message}`);
      }
    });

    return answer;
  }
}
