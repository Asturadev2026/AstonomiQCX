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

export interface OverviewKpis {
  conversationsToday: number;
  conversationsTrendPct: number;
  aiResolvedPct: number;
  aiResolvedTrendPct: number;
  avgCsat: number;
  csatTrend: number;
  avgFirstResponseSecs: number;
  firstResponseTrendSecs: number;
}
export interface ChannelSplit {
  name: string;
  pct: number;
  color: string;
  icon: string;
}
export interface ResolutionMix {
  totalLabel: string;
  aiPct: number;
  agentPct: number;
  inProgressPct: number;
}
export interface OverviewPayload {
  kpis: OverviewKpis;
  channels: ChannelSplit[];
  resolution: ResolutionMix;
}

// Keyed by Conversation.channel (the CHANNELS enum, packages/shared/constants.ts) — icon/color
// pairing for the Overview "Volume by channel" bars, ported verbatim from the prototype.
const CHANNEL_META: Record<string, { label: string; icon: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', icon: '💬', color: '#25D366' },
  chat: { label: 'Live Chat', icon: '💭', color: '#2563EB' },
  email: { label: 'Email', icon: '✉️', color: '#0EA5E9' },
  voice: { label: 'Voice', icon: '📞', color: '#E08A00' },
  instagram: { label: 'Instagram', icon: '📸', color: '#DB2777' },
  facebook: { label: 'Facebook', icon: '📘', color: '#1877F2' },
  x: { label: 'X', icon: '✖️', color: '#111827' },
};
const OVERVIEW_RESOLVED_STATUSES = ['resolved', 'closed'];

function pct(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

function pctChange(curr: number, prev: number): number {
  if (!prev) return curr ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function compactCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
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

  async getOverview(tenantId: string): Promise<OverviewPayload> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const now = new Date();
      const since48h = new Date(now.getTime() - 2 * MS_PER_DAY);
      const since24h = new Date(now.getTime() - MS_PER_DAY);

      const [conversations, csatRows, messages] = await Promise.all([
        tx.conversation.findMany({
          where: { createdAt: { gte: since48h } },
          select: { id: true, channel: true, status: true, assignedUserId: true, createdAt: true, updatedAt: true },
        }),
        tx.survey.findMany({
          where: { type: 'csat', createdAt: { gte: since48h } },
          select: { score: true, createdAt: true },
        }),
        tx.message.findMany({
          where: { conversation: { createdAt: { gte: since48h } } },
          select: { conversationId: true, senderType: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      const today = conversations.filter((c) => c.createdAt >= since24h);
      const yesterday = conversations.filter((c) => c.createdAt < since24h);

      const aiResolved = (list: typeof today) =>
        list.filter((c) => !c.assignedUserId && OVERVIEW_RESOLVED_STATUSES.includes(c.status)).length;
      const agentResolved = (list: typeof today) =>
        list.filter((c) => c.assignedUserId && OVERVIEW_RESOLVED_STATUSES.includes(c.status)).length;

      const aiResolvedToday = aiResolved(today);
      const agentResolvedToday = agentResolved(today);
      const inProgressToday = today.length - aiResolvedToday - agentResolvedToday;

      const aiPctToday = pct(aiResolvedToday, today.length);
      const aiPctYesterday = pct(aiResolved(yesterday), yesterday.length);

      const csatToday = csatRows.filter((s) => s.createdAt >= since24h);
      const csatYesterday = csatRows.filter((s) => s.createdAt < since24h);
      const avgCsatToday = avg(csatToday.map((s) => Number(s.score ?? 0)));
      const avgCsatYesterday = avg(csatYesterday.map((s) => Number(s.score ?? 0)));

      const messagesByConv = new Map<string, { senderType: string; createdAt: Date }[]>();
      for (const m of messages) {
        if (!messagesByConv.has(m.conversationId)) messagesByConv.set(m.conversationId, []);
        messagesByConv.get(m.conversationId)!.push(m);
      }
      const avgFirstResponseSecs = (list: typeof today) => {
        const gaps: number[] = [];
        for (const c of list) {
          const msgs = messagesByConv.get(c.id);
          if (!msgs) continue;
          const firstCustomer = msgs.find((m) => m.senderType === 'customer');
          if (!firstCustomer) continue;
          const firstReply = msgs.find((m) => m.senderType !== 'customer' && m.createdAt > firstCustomer.createdAt);
          if (!firstReply) continue;
          gaps.push((firstReply.createdAt.getTime() - firstCustomer.createdAt.getTime()) / 1000);
        }
        return gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
      };
      const firstResponseToday = avgFirstResponseSecs(today);
      const firstResponseYesterday = avgFirstResponseSecs(yesterday);

      const channelCounts = new Map<string, number>();
      for (const c of today) channelCounts.set(c.channel, (channelCounts.get(c.channel) ?? 0) + 1);
      const channels: ChannelSplit[] = [...channelCounts.entries()]
        .map(([channel, count]) => {
          const meta = CHANNEL_META[channel] ?? { label: channel, icon: '💬', color: '#94A3B8' };
          return { name: meta.label, icon: meta.icon, color: meta.color, pct: pct(count, today.length) };
        })
        .sort((a, b) => b.pct - a.pct);

      return {
        kpis: {
          conversationsToday: today.length,
          conversationsTrendPct: pctChange(today.length, yesterday.length),
          aiResolvedPct: aiPctToday,
          aiResolvedTrendPct: pctChange(aiPctToday, aiPctYesterday),
          avgCsat: avgCsatToday,
          csatTrend: Math.round((avgCsatToday - avgCsatYesterday) * 10) / 10,
          avgFirstResponseSecs: firstResponseToday,
          firstResponseTrendSecs: firstResponseYesterday - firstResponseToday,
        },
        channels,
        resolution: {
          totalLabel: compactCount(today.length),
          aiPct: aiPctToday,
          agentPct: pct(agentResolvedToday, today.length),
          inProgressPct: pct(inProgressToday, today.length),
        },
      };
    });
  }

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
