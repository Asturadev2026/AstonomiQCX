import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';

export interface AnalyticsKpis {
  conversations30d: number;
  costSavedLabel: string;
  avgHandleTimeLabel: string;
  slaMetPct: number;
}
export interface TrendPoint {
  label: string;
  total: number;
  aiResolved: number;
}
export interface ChannelCsat {
  label: string;
  avg: number;
  color: string;
}
export interface HourBar {
  label: string;
  pct: number;
}
export interface LanguageSplit {
  label: string;
  pct: number;
  color: string;
}
export interface AnalyticsPayload {
  kpis: AnalyticsKpis;
  trend: TrendPoint[];
  csatByChannel: ChannelCsat[];
  hourBars: HourBar[];
  languages: LanguageSplit[];
  heat: number[];
}

const CHANNEL_COLORS: Record<string, string> = {
  WhatsApp: '#25D366',
  Chat: '#2563EB',
  Voice: '#E08A00',
  Email: '#0EA5E9',
  Instagram: '#DB2777',
};
const LANGUAGE_META: Record<string, { label: string; color: string }> = {
  en: { label: 'English', color: '#2563EB' },
  hi: { label: 'हिन्दी', color: '#0EA5E9' },
  ta: { label: 'Tamil', color: '#16A34A' },
  te: { label: 'Telugu', color: '#E08A00' },
  bn: { label: 'Bengali', color: '#DB2777' },
  mr: { label: 'Marathi', color: '#4F46E5' },
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TREND_DAYS = 14;
const HEAT_BUCKET_HOURS = 2; // 12 buckets across a day

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class AnalyticsService {
  private prisma = getPrisma();

  async get(tenantId: string): Promise<AnalyticsPayload> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const now = new Date();
      const since30d = new Date(now.getTime() - 30 * MS_PER_DAY);
      const sinceTrend = new Date(now.getTime() - TREND_DAYS * MS_PER_DAY);

      const [conversations30d, conversations, csatByChannelGroups, slaEvents, messages] = await Promise.all([
        tx.conversation.count({ where: { createdAt: { gte: since30d } } }),
        tx.conversation.findMany({
          where: { createdAt: { gte: sinceTrend } },
          select: { id: true, status: true, assignedUserId: true, language: true, createdAt: true, updatedAt: true },
        }),
        tx.survey.groupBy({ by: ['channel'], where: { type: 'csat', channel: { not: null } }, _avg: { score: true } }),
        tx.slaEvent.findMany({ where: { kind: 'resolution' }, select: { breached: true } }),
        tx.message.findMany({
          where: { conversation: { createdAt: { gte: sinceTrend } } },
          select: { conversationId: true, senderType: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      // Trend — total vs AI-resolved conversations per day, oldest first.
      const dayBuckets = new Map<string, { total: number; aiResolved: number }>();
      for (let i = 0; i < TREND_DAYS; i++) {
        const d = new Date(now.getTime() - (TREND_DAYS - 1 - i) * MS_PER_DAY);
        dayBuckets.set(dayKey(d), { total: 0, aiResolved: 0 });
      }
      for (const c of conversations) {
        const bucket = dayBuckets.get(dayKey(c.createdAt));
        if (!bucket) continue;
        bucket.total++;
        if (!c.assignedUserId && c.status === 'resolved') bucket.aiResolved++;
      }
      const trend: TrendPoint[] = [...dayBuckets.values()].map((v, i) => ({
        label: `D${i + 1}`,
        total: v.total,
        aiResolved: v.aiResolved,
      }));

      // Handle time — resolved conversations only.
      const resolved = conversations.filter((c) => c.status === 'resolved');
      const handleSecs = resolved.map((c) => (c.updatedAt.getTime() - c.createdAt.getTime()) / 1000);
      const avgHandleSecs = handleSecs.length ? handleSecs.reduce((a, b) => a + b, 0) / handleSecs.length : 0;
      const avgHandleTimeLabel = avgHandleSecs
        ? `${Math.floor(avgHandleSecs / 60)}m ${Math.round(avgHandleSecs % 60)}s`
        : '—';

      // CSAT by channel — real avg from Survey.channel (populated on CSAT surveys).
      const csatByChannel: ChannelCsat[] = csatByChannelGroups
        .filter((g) => g.channel)
        .map((g) => ({
          label: g.channel as string,
          avg: Math.round((g._avg.score ? Number(g._avg.score) : 0) * 10) / 10,
          color: CHANNEL_COLORS[g.channel as string] ?? '#94A3B8',
        }))
        .sort((a, b) => b.avg - a.avg);

      // First response time by hour-of-day, averaged across the trend window — bar height
      // is relative to the slowest hour (taller = slower).
      const byConv = new Map<string, Date[]>();
      for (const m of messages) {
        if (!byConv.has(m.conversationId)) byConv.set(m.conversationId, []);
        byConv.get(m.conversationId)!.push(m.createdAt);
      }
      const convById = new Map(conversations.map((c) => [c.id, c]));
      const hourGapSecs = new Map<number, number[]>();
      for (const [convId, timestamps] of byConv) {
        if (timestamps.length < 2) continue;
        const conv = convById.get(convId);
        if (!conv) continue;
        const gapSecs = (timestamps[1].getTime() - timestamps[0].getTime()) / 1000;
        const hour = conv.createdAt.getHours();
        if (!hourGapSecs.has(hour)) hourGapSecs.set(hour, []);
        hourGapSecs.get(hour)!.push(gapSecs);
      }
      const hourAverages = [...hourGapSecs.entries()]
        .map(([hour, gaps]) => ({ hour, avgSecs: gaps.reduce((a, b) => a + b, 0) / gaps.length }))
        .sort((a, b) => a.hour - b.hour);
      const maxAvgSecs = Math.max(1, ...hourAverages.map((h) => h.avgSecs));
      const hourBars: HourBar[] = hourAverages.map((h) => ({
        label: h.hour < 12 ? `${h.hour}a` : h.hour === 12 ? '12p' : `${h.hour - 12}p`,
        pct: Math.round((h.avgSecs / maxAvgSecs) * 100),
      }));

      // Language split.
      const languageCounts = new Map<string, number>();
      for (const c of conversations) {
        if (!c.language) continue;
        languageCounts.set(c.language, (languageCounts.get(c.language) ?? 0) + 1);
      }
      const totalWithLanguage = [...languageCounts.values()].reduce((a, b) => a + b, 0);
      const languages: LanguageSplit[] = [...languageCounts.entries()]
        .map(([code, count]) => {
          const meta = LANGUAGE_META[code] ?? { label: code, color: '#94A3B8' };
          return { label: meta.label, color: meta.color, pct: totalWithLanguage ? Math.round((count / totalWithLanguage) * 100) : 0 };
        })
        .sort((a, b) => b.pct - a.pct);

      // Peak-hours heat — conversation volume in 2-hour buckets across the trend window.
      const heatCounts = new Array(24 / HEAT_BUCKET_HOURS).fill(0);
      for (const c of conversations) {
        heatCounts[Math.floor(c.createdAt.getHours() / HEAT_BUCKET_HOURS)]++;
      }
      const maxHeat = Math.max(1, ...heatCounts);
      const heat = heatCounts.map((v) => Math.round((v / maxHeat) * 10));

      const slaMet = slaEvents.filter((e) => !e.breached).length;
      const slaMetPct = slaEvents.length ? Math.round((slaMet / slaEvents.length) * 100) : 0;

      return {
        kpis: {
          conversations30d,
          // No cost-rate model exists yet (no per-conversation cost/plan pricing tied to
          // AI vs human handling) — left unset intentionally rather than fabricated.
          costSavedLabel: '—',
          avgHandleTimeLabel,
          slaMetPct,
        },
        trend,
        csatByChannel,
        hourBars,
        languages,
        heat,
      };
    });
  }
}
