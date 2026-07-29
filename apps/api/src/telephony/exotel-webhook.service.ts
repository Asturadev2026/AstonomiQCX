import { Injectable, Logger } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import type { IvrFlowDefinition } from '@aq/shared';
import { IvrFlowExecutionService, type IvrStep } from './ivr-flow-execution.service';

export interface ExotelWebhookBody {
  CallSid?: string;
  CallFrom?: string;
  From?: string;
  CallTo?: string;
  To?: string;
  CallStatus?: string;
  Status?: string;
  Digits?: string;
  digits?: string;
  DialCallDuration?: string;
  CallDuration?: string;
  RecordingUrl?: string;
}

const COMPLETED_STATUSES = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled']);

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function exoml(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

function renderStep(step: IvrStep): string {
  const sayTags = step.say.map((s) => `<Say>${escapeXml(s)}</Say>`).join('');
  switch (step.kind) {
    case 'gather':
      return exoml(`<Gather numDigits="1" timeout="5">${sayTags}</Gather>`);
    case 'forward':
      return exoml(`${sayTags}<Dial><Number>${escapeXml(step.forwardTo)}</Number></Dial>`);
    case 'voicemail':
      return exoml(`${sayTags}<Record maxLength="120" />`);
    case 'hangup':
      return exoml(`${sayTags}<Hangup/>`);
  }
}

/**
 * Real inbound Exotel call-event handler (Guide §13.4) — resolves the
 * tenant from the dialed virtual number, upserts a Call row keyed by
 * CallSid so ringing → live → completed status transitions all land on the
 * same row (Live console reads exactly this data), and, if the dialed
 * number is mapped to a published IVR flow, drives it via
 * IvrFlowExecutionService and replies with Exotel's XML applet format.
 *
 * Best-effort against Exotel's documented Voice XML contract — same
 * caveat as TelephonyService.sendTestCall(): unverified against a live
 * Exotel account since EXOTEL_* credentials aren't configured yet.
 */
@Injectable()
export class ExotelWebhookService {
  private readonly logger = new Logger(ExotelWebhookService.name);
  private prisma = getPrisma();

  constructor(private ivrExec: IvrFlowExecutionService) {}

  private async resolveTenantId(virtualNumber: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ tenant_id: string | null }>>`
      SELECT resolve_tenant_by_virtual_number(${virtualNumber}) as tenant_id
    `;
    return rows[0]?.tenant_id ?? null;
  }

  async handleCallEvent(body: ExotelWebhookBody): Promise<string> {
    const callSid = body.CallSid;
    const fromNum = body.CallFrom ?? body.From;
    const toNum = body.CallTo ?? body.To;
    const status = (body.CallStatus ?? body.Status ?? '').toLowerCase();
    const digits = body.Digits ?? body.digits;

    if (!callSid || !toNum) {
      this.logger.warn('Exotel webhook missing CallSid/CallTo — ignoring');
      return exoml('<Hangup/>');
    }

    const tenantId = await this.resolveTenantId(toNum);
    if (!tenantId) {
      this.logger.warn(`No tenant found for virtual number ${toNum}`);
      return exoml('<Say>Sorry, this number is not in service.</Say><Hangup/>');
    }

    return withTenant(this.prisma, tenantId, async (tx) => {
      let call = await tx.call.findFirst({ where: { externalId: callSid } });
      if (!call) {
        let contact = fromNum ? await tx.contact.findFirst({ where: { phone: fromNum } }) : null;
        if (!contact && fromNum) {
          contact = await tx.contact.create({ data: { tenantId, phone: fromNum } });
        }
        call = await tx.call.create({
          data: {
            tenantId,
            externalId: callSid,
            direction: 'inbound',
            fromNum,
            toNum,
            virtualNum: toNum,
            contactId: contact?.id,
            status: 'ringing',
          },
        });
      }

      if (COMPLETED_STATUSES.has(status)) {
        const durationRaw = body.DialCallDuration ?? body.CallDuration;
        await tx.call.update({
          where: { id: call.id },
          data: {
            status: status === 'completed' ? 'completed' : 'abandoned',
            durationS: durationRaw ? Number(durationRaw) : undefined,
            recordingUrl: body.RecordingUrl ?? undefined,
          },
        });
        return exoml('<Hangup/>');
      }

      if (call.status !== 'live' && status === 'in-progress') {
        await tx.call.update({ where: { id: call.id }, data: { status: 'live' } });
      }

      const numberDid = await tx.numberDid.findFirst({ where: { number: toNum } });
      // Queried directly on the already-open `tx`, not via
      // IvrFlowService.findPublishedFlowByName() — that method opens its own
      // withTenant()/$transaction, and nesting a second interactive
      // transaction inside this one deadlocks waiting for a pool connection
      // the outer transaction is still holding.
      const flow = numberDid?.mappedTo
        ? await tx.agentFlow.findFirst({ where: { kind: 'ivr', status: 'published', name: numberDid.mappedTo }, orderBy: { id: 'asc' } })
        : null;
      if (!flow) {
        return exoml('<Say>This number is not yet configured with a call flow.</Say><Hangup/>');
      }

      const definition = flow.definition as unknown as IvrFlowDefinition;
      const step = this.ivrExec.step(definition, callSid, digits);
      return renderStep(step);
    });
  }
}
