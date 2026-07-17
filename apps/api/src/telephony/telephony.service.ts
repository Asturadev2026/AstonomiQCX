import { Injectable, Logger } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import type {
  CallWorkflowStepDto,
  CdrRowDto,
  CreateNumberDidDto,
  NumberDidDto,
  TelephonyIntegrationStatus,
  TelephonyKpis,
  TestCallResultDto,
} from '@aq/shared';
import { env } from '../config/env';
import { CALL_WORKFLOW_STEPS } from './call-workflow-steps';

function mask(value: string): string {
  return value.length <= 4 ? '••••' : `${'•'.repeat(value.length - 4)}${value.slice(-4)}`;
}

function isExotelConfigured(): boolean {
  return Boolean(env.EXOTEL_SID && env.EXOTEL_API_KEY && env.EXOTEL_API_TOKEN);
}

/**
 * Real Cloud Telephony data — Guide §13.4/Appendix E. Scoped to "CDR + real
 * KPIs + real Integration settings + real Virtual numbers" (user's explicit
 * choice): the IVR call-flow builder and Live console/Masking bridge are
 * genuinely impossible without a connected phone line, so they're not built
 * here — same deferral as Voice AI's live-call half and Contact Centre's
 * live monitoring.
 */
@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name);
  private prisma = getPrisma();

  async kpis(tenantId: string): Promise<TelephonyKpis> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const callsToday = await tx.call.count({ where: { createdAt: { gte: startOfDay } } });
      return { callsToday, carrierUptimePct: null, avgWaitSecs: null, avgCostPerCall: null };
    });
  }

  workflowSteps(): CallWorkflowStepDto[] {
    return CALL_WORKFLOW_STEPS;
  }

  integrationStatus(): TelephonyIntegrationStatus {
    return {
      configured: isExotelConfigured(),
      maskedSid: env.EXOTEL_SID ? mask(env.EXOTEL_SID) : null,
      maskedToken: env.EXOTEL_API_TOKEN ? mask(env.EXOTEL_API_TOKEN) : null,
      webhookUrl: 'api.astronomiq.in/tel/exotel/hook',
      subdomain: env.EXOTEL_SUBDOMAIN || 'api.exotel.com',
    };
  }

  /**
   * Real Exotel Connect-Two-Numbers call (Guide §13.4) — rings the given
   * number and, once answered, bridges it back to itself via our registered
   * CallerId, as a pure connectivity/credentials test. Gracefully degrades
   * when Exotel isn't configured, same pattern as Sarvam/ElevenLabs/WhatsApp.
   */
  async sendTestCall(toNumber: string): Promise<TestCallResultDto> {
    if (!isExotelConfigured()) {
      return { configured: false };
    }
    const subdomain = env.EXOTEL_SUBDOMAIN || 'api.exotel.com';
    const url = `https://${env.EXOTEL_API_KEY}:${env.EXOTEL_API_TOKEN}@${subdomain}/v1/Accounts/${env.EXOTEL_SID}/Calls/connect.json`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: toNumber, To: toNumber, CallerId: toNumber }),
    });
    if (!res.ok) {
      const detail = await res.text();
      this.logger.warn(`Exotel test call failed: ${res.status} ${detail}`);
      throw new Error(`Exotel rejected the test call (${res.status}) — check credentials`);
    }
    const body = (await res.json()) as { Call?: { Sid?: string; Status?: string } };
    return { configured: true, callSid: body.Call?.Sid, status: body.Call?.Status };
  }

  async listNumbers(tenantId: string): Promise<NumberDidDto[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const rows = await tx.numberDid.findMany({ orderBy: { number: 'asc' } });
      return rows.map((r) => ({ id: r.id, number: r.number, type: r.type, mappedTo: r.mappedTo, status: r.status }));
    });
  }

  async createNumber(tenantId: string, dto: CreateNumberDidDto): Promise<NumberDidDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const created = await tx.numberDid.create({
        data: { tenantId, number: dto.number, type: dto.type, mappedTo: dto.mappedTo, status: 'active' },
      });
      return { id: created.id, number: created.number, type: created.type, mappedTo: created.mappedTo, status: created.status };
    });
  }

  async cdr(tenantId: string): Promise<CdrRowDto[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const calls = await tx.call.findMany({
        include: { agent: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return calls.map((c) => ({
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        direction: c.direction,
        fromNum: c.fromNum,
        toNum: c.toNum,
        virtualNum: c.virtualNum,
        agentName: c.agent?.name ?? null,
        durationS: c.durationS,
        disposition: c.disposition ?? c.status,
        recordingUrl: c.recordingUrl,
      }));
    });
  }
}
