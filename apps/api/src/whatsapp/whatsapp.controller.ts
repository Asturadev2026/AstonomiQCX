import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { WhatsappService } from './whatsapp.service';

/**
 * Meta's webhook endpoints for WhatsApp (Guide §13/Appendix E). Not under
 * TenantMiddleware — see tenant.middleware.ts's /webhooks/ skip — because
 * Meta has no notion of our tenants; the service resolves the tenant itself
 * from the message's phone_number_id.
 */
@Controller('webhooks/whatsapp')
export class WhatsappController {
  constructor(private svc: WhatsappService) {}

  /** One-time handshake when the webhook URL is registered in the Meta App Dashboard. */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (this.svc.verifyToken(mode, token)) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Forbidden');
    }
  }

  @Post()
  async receive(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!this.svc.verifySignature(req.rawBody, signature)) {
      res.status(401).send('Invalid signature');
      return;
    }

    // Meta expects a fast ack; process after responding so a slow AI/DB
    // round-trip can't cause it to time out and retry the same webhook.
    res.status(200).send('EVENT_RECEIVED');
    await this.svc.handleWebhook(req.body);
  }
}
