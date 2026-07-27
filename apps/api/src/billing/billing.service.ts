import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import type { BillingPayload, InvoiceRow, PlanCard, UsageMeter } from '@aq/shared';

// Usage caps per plan tier (Tenant.plan) — no metering worker exists yet (Guide §15),
// so these are the plan's advertised entitlements; usage itself is real, counted below.
const PLAN_USAGE_LIMITS: Record<string, { conversations: number; whatsappMessages: number; voiceMinutes: number; aiResolutions: number }> = {
  growth: { conversations: 20_000, whatsappMessages: 60_000, voiceMinutes: 4_000, aiResolutions: 15_000 },
  business: { conversations: 60_000, whatsappMessages: 2_00_000, voiceMinutes: 15_000, aiResolutions: 50_000 },
  enterprise: { conversations: 5_00_000, whatsappMessages: 10_00_000, voiceMinutes: 1_00_000, aiResolutions: 4_00_000 },
};

// Display order for the plan grid — Plan.priceInr can't be sorted on directly since
// Enterprise (Custom pricing) is stored as 0, which would otherwise sort first.
const PLAN_ORDER = ['Growth', 'Business', 'Enterprise'];

function inr(amount: number): string {
  return `₹${new Intl.NumberFormat('en-IN').format(Math.round(amount))}`;
}

function pct(used: number, limit: number): number {
  return limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

@Injectable()
export class BillingService {
  private prisma = getPrisma();

  async getOverview(tenantId: string): Promise<BillingPayload> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const plans = await this.prisma.plan.findMany();
    const sortedPlans = [...plans].sort((a, b) => PLAN_ORDER.indexOf(a.name) - PLAN_ORDER.indexOf(b.name));
    const currentPlan = sortedPlans.find((p) => p.name.toLowerCase() === tenant.plan.toLowerCase()) ?? sortedPlans[1];
    const limits = PLAN_USAGE_LIMITS[tenant.plan.toLowerCase()] ?? PLAN_USAGE_LIMITS.business!;

    return withTenant(this.prisma, tenantId, async (tx) => {
      const subscription = await tx.subscription.findFirst({ where: { tenantId } });
      const now = new Date();
      // Date.UTC — cycleStart/cycleEnd are `@db.Date` columns (pure calendar dates); a
      // local-time fallback here would drift a day against what the seed script wrote.
      const cycleStart = subscription?.cycleStart ?? new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      const cycleEnd = subscription?.cycleEnd ?? new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
      const inCycle = { gte: cycleStart, lte: cycleEnd };

      const [conversationsUsed, whatsappMessagesUsed, calls, agentSeatsUsed, aiResolutionsUsed, invoices] = await Promise.all([
        tx.conversation.count({ where: { createdAt: inCycle } }),
        tx.message.count({ where: { createdAt: inCycle, conversation: { channel: 'whatsapp' } } }),
        tx.call.findMany({ where: { createdAt: inCycle }, select: { durationS: true } }),
        tx.user.count(),
        tx.conversation.count({ where: { createdAt: inCycle, assignedUserId: null, status: { in: ['resolved', 'closed'] } } }),
        tx.invoice.findMany({ where: { tenantId }, orderBy: { periodStart: 'desc' }, take: 4 }),
      ]);
      const voiceMinutesUsed = Math.round(calls.reduce((sum, c) => sum + (c.durationS ?? 0), 0) / 60);
      const seatLimit = subscription?.seats ?? 50;

      const usage: UsageMeter[] = [
        { label: 'Conversations', usedLabel: `${conversationsUsed.toLocaleString()} / ${limits.conversations.toLocaleString()}`, limitLabel: limits.conversations.toLocaleString(), pct: pct(conversationsUsed, limits.conversations), color: 'var(--blue)' },
        { label: 'WhatsApp messages', usedLabel: `${whatsappMessagesUsed.toLocaleString()} / ${limits.whatsappMessages.toLocaleString()}`, limitLabel: limits.whatsappMessages.toLocaleString(), pct: pct(whatsappMessagesUsed, limits.whatsappMessages), color: '#25D366' },
        { label: 'Voice minutes', usedLabel: `${voiceMinutesUsed.toLocaleString()} / ${limits.voiceMinutes.toLocaleString()}`, limitLabel: limits.voiceMinutes.toLocaleString(), pct: pct(voiceMinutesUsed, limits.voiceMinutes), color: 'var(--amber)' },
        { label: 'Agent seats', usedLabel: `${agentSeatsUsed} / ${seatLimit}`, limitLabel: String(seatLimit), pct: pct(agentSeatsUsed, seatLimit), color: 'var(--indigo)' },
        { label: 'AI resolutions', usedLabel: `${aiResolutionsUsed.toLocaleString()} / ${limits.aiResolutions.toLocaleString()}`, limitLabel: limits.aiResolutions.toLocaleString(), pct: pct(aiResolutionsUsed, limits.aiResolutions), color: 'var(--sky)' },
      ];

      const invoiceRows: InvoiceRow[] = invoices.map((inv) => ({
        id: inv.id,
        extRef: inv.extRef,
        period: (inv.periodStart ?? inv.createdAt).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
        amountLabel: inr(Number(inv.amount ?? 0)),
        status: inv.status === 'paid' ? 'Paid' : 'Due',
      }));

      const planCards: PlanCard[] = sortedPlans.map((p) => ({
        id: p.id,
        name: p.name,
        priceLabel: Number(p.priceInr) === 0 ? 'Custom' : inr(Number(p.priceInr)),
        current: p.id === currentPlan?.id,
        features: (p.features as string[] | null) ?? [],
      }));

      return {
        cycleLabel: `${cycleStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${cycleEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`,
        usage,
        estimatedBillLabel: `${inr(Number(currentPlan?.priceInr ?? 0))} + GST`,
        invoices: invoiceRows,
        plans: planCards,
      };
    });
  }
}
