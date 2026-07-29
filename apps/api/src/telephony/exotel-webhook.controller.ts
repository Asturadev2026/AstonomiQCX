import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ExotelWebhookService, type ExotelWebhookBody } from './exotel-webhook.service';

/**
 * Exotel's inbound call-event/Passthru-applet webhook (Guide §13.4). Not
 * under TenantMiddleware — see tenant.middleware.ts's /webhooks/ skip —
 * because Exotel has no notion of our tenants; the service resolves the
 * tenant itself from the dialed virtual number. Exotel can hit this URL via
 * GET or POST depending on how the applet is configured, so both are
 * supported; the caller expects an Exoml (XML) response either way.
 */
@Controller('webhooks/exotel')
export class ExotelWebhookController {
  constructor(private svc: ExotelWebhookService) {}

  @Get('call')
  async handleGet(@Query() query: ExotelWebhookBody, @Res() res: Response) {
    const xml = await this.svc.handleCallEvent(query);
    res.status(200).type('text/xml').send(xml);
  }

  @Post('call')
  async handlePost(@Req() req: Request, @Res() res: Response) {
    const xml = await this.svc.handleCallEvent(req.body as ExotelWebhookBody);
    res.status(200).type('text/xml').send(xml);
  }
}
