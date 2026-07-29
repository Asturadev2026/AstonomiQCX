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

    // Same find-or-create-conversation → log inbound → ask → log outbound
    // sequence the real WhatsApp webhook uses (WhatsappService.handleMessage),
    // via the same shared ConversationsService methods, so every channel ends
    // up in Omni Inbox/Command Centre the same way. Persistence failures must
    // never break the customer-facing answer, so they're caught and logged.
    let conversationId: string | undefined;
    try {
      const conversation = await this.conversations.findOrCreateOpenConversation(req.tenantId, {
        contactId: dto.contactId,
        channel: dto.channel,
      });
      conversationId = conversation.id;
      await this.conversations.appendMessage(req.tenantId, conversationId, {
        senderType: 'customer',
        body: dto.question,
      });
    } catch (err) {
      this.logger.warn(`Failed to log inbound message: ${(err as Error).message}`);
    }

    const answer = await this.svc.ask(req.tenantId, dto.question, {
      language: dto.language,
      channel: dto.channel,
      contactId: dto.contactId,
      conversationId,
    });

    if (conversationId) {
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
    }

    return answer;
  }
}
