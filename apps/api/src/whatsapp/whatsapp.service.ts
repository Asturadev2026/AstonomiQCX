import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { getPrisma, withTenant } from '@aq/db';
import { env } from '../config/env';
import { AiService } from '../ai/ai.service';

// Meta's current stable Graph API version (verified July 2026) — Guide §13/Appendix E.
const GRAPH_VERSION = 'v25.0';

interface WhatsappTextMessage {
  from: string;
  type: string;
  text?: { body: string };
}

/**
 * The WhatsApp channel gateway (Guide §13/Appendix E). Kept inside apps/api
 * rather than a separate apps/gateways app for now (that split only matters
 * at deploy time — same logic either way).
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private prisma = getPrisma();

  constructor(private ai: AiService) {}

  isConfigured(): boolean {
    return Boolean(env.WA_ACCESS_TOKEN && env.WA_PHONE_NUMBER_ID);
  }

  /** The one-time GET handshake Meta uses to confirm we own this webhook URL. */
  verifyToken(mode: string, token: string): boolean {
    return mode === 'subscribe' && Boolean(env.WA_VERIFY_TOKEN) && token === env.WA_VERIFY_TOKEN;
  }

  /** HMAC-SHA256 over the raw request body, keyed with the Meta App Secret. */
  verifySignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
    if (!env.WA_APP_SECRET) {
      this.logger.warn('WA_APP_SECRET not set — skipping signature verification (dev only, insecure)');
      return true;
    }
    if (!rawBody || !signatureHeader?.startsWith('sha256=')) return false;

    const expected = createHmac('sha256', env.WA_APP_SECRET).update(rawBody).digest('hex');
    const provided = signatureHeader.slice('sha256='.length);
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(provided, 'hex');
    return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
  }

  /** Which tenant owns this WhatsApp number — the channel version of Guide §6.2. */
  private async tenantForPhoneNumberId(phoneNumberId: string): Promise<string | null> {
    const channel = await this.prisma.channel.findFirst({
      where: { type: 'whatsapp', config: { path: ['phoneNumberId'], equals: phoneNumberId } },
    });
    return channel?.tenantId ?? null;
  }

  async handleWebhook(body: {
    entry?: Array<{
      changes?: Array<{
        field?: string;
        value?: {
          metadata?: { phone_number_id?: string };
          contacts?: Array<{ profile?: { name?: string } }>;
          messages?: WhatsappTextMessage[];
        };
      }>;
    }>;
  }): Promise<void> {
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (change.field !== 'messages' || !value?.messages?.length) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        const tenantId = phoneNumberId ? await this.tenantForPhoneNumberId(phoneNumberId) : null;
        if (!tenantId) {
          this.logger.warn(`No tenant found for WhatsApp phone_number_id ${phoneNumberId}`);
          continue;
        }

        for (const message of value.messages) {
          try {
            await this.handleMessage(tenantId, message, value.contacts?.[0]?.profile?.name);
          } catch (err) {
            // One bad message shouldn't drop the rest of the batch or crash the webhook.
            this.logger.error(`Failed to process WhatsApp message: ${(err as Error).message}`);
          }
        }
      }
    }
  }

  private async handleMessage(tenantId: string, message: WhatsappTextMessage, name?: string): Promise<void> {
    const text = message.text?.body;
    if (!text) return; // only text messages for now — media/interactive types are a later step

    const contact = await withTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.contact.findFirst({ where: { phone: message.from } });
      return existing ?? tx.contact.create({ data: { tenantId, phone: message.from, name } });
    });

    const conversation = await withTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.conversation.findFirst({
        where: { contactId: contact.id, channel: 'whatsapp', status: 'open' },
      });
      return existing ?? tx.conversation.create({ data: { tenantId, contactId: contact.id, channel: 'whatsapp' } });
    });

    await withTenant(this.prisma, tenantId, (tx) =>
      tx.message.create({ data: { tenantId, conversationId: conversation.id, senderType: 'customer', body: text } }),
    );

    // Guide §10.4: same Astra brain answers on every channel.
    const answer = await this.ai.ask(tenantId, text, { contactId: contact.id, conversationId: conversation.id });
    const replyText = !answer.configured
      ? "We're having a temporary issue — our team will follow up with you shortly."
      : answer.escalate
        ? `Thanks — I've raised this with our team (ref ${answer.ticketRef}). They'll follow up shortly.`
        : answer.answer ?? '';

    await withTenant(this.prisma, tenantId, (tx) =>
      tx.message.create({ data: { tenantId, conversationId: conversation.id, senderType: 'bot', body: replyText } }),
    );

    await this.sendMessage(message.from, replyText);
  }

  /** Real outbound send via Meta's Graph API — Guide §13. */
  async sendMessage(to: string, body: string): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn('WhatsApp not configured (WA_ACCESS_TOKEN/WA_PHONE_NUMBER_ID) — reply not sent');
      return;
    }
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${env.WA_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body },
      }),
    });
    if (!res.ok) {
      this.logger.error(`WhatsApp send failed: ${res.status} ${await res.text()}`);
    }
  }
}
