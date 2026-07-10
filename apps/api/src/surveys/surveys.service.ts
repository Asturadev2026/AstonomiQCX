import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';

export interface CsatSummary {
  avg: number;
  deltaVsPrevMonth: number;
  responseCount: number;
}
export interface NpsSummary {
  score: number;
  promoterPct: number;
  passivePct: number;
  detractorPct: number;
}
export interface CesSummary {
  avg: number;
  deltaVsPrevMonth: number;
}
export interface CsatTrendPoint {
  label: string;
  avg: number;
}
export interface VocTheme {
  label: string;
  pct: number;
  color: string;
}
export interface RecentSurveyResponse {
  contactName: string;
  score: number;
  channel: string | null;
  comment: string | null;
}
export interface SurveysPayload {
  csat: CsatSummary;
  nps: NpsSummary;
  ces: CesSummary;
  trend: CsatTrendPoint[];
  themes: VocTheme[];
  recent: RecentSurveyResponse[];
}

const THEME_KEYWORDS: { label: string; color: string; keywords: string[] }[] = [
  { label: 'Fast resolution', color: 'var(--green)', keywords: ['fast resolution', 'resolved on the first try', 'quick help'] },
  { label: 'Friendly agents', color: 'var(--blue)', keywords: ['friendly', 'helpful'] },
  { label: 'Delivery delays', color: 'var(--amber)', keywords: ['delivery', 'delayed', 'late'] },
  { label: 'Refund speed', color: 'var(--sky)', keywords: ['refund'] },
  { label: 'App issues', color: 'var(--pink)', keywords: ['app ', 'app issues', 'crash', 'checkout button'] },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function avg(scores: { score: unknown }[]): number {
  if (!scores.length) return 0;
  const total = scores.reduce((sum, s) => sum + Number(s.score ?? 0), 0);
  return Math.round((total / scores.length) * 10) / 10;
}

function delta(current: number, previous: number): number {
  return Math.round((current - previous) * 10) / 10;
}

function splitByRecency<T extends { createdAt: Date }>(rows: T[], now: Date): { current: T[]; previous: T[] } {
  const current = rows.filter((r) => now.getTime() - r.createdAt.getTime() <= 30 * MS_PER_DAY);
  const previous = rows.filter((r) => {
    const ageDays = (now.getTime() - r.createdAt.getTime()) / MS_PER_DAY;
    return ageDays > 30 && ageDays <= 60;
  });
  return { current, previous };
}

@Injectable()
export class SurveysService {
  private prisma = getPrisma();

  async get(tenantId: string): Promise<SurveysPayload> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const now = new Date();
      const [csatRows, npsRows, cesRows, commentRows] = await Promise.all([
        tx.survey.findMany({ where: { type: 'csat' }, select: { score: true, createdAt: true } }),
        tx.survey.findMany({ where: { type: 'nps' }, select: { score: true } }),
        tx.survey.findMany({ where: { type: 'ces' }, select: { score: true, createdAt: true } }),
        tx.survey.findMany({
          where: { comment: { not: null } },
          select: { score: true, channel: true, comment: true, createdAt: true, contact: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

      const csatSplit = splitByRecency(csatRows, now);
      const cesSplit = splitByRecency(cesRows, now);

      const promoters = npsRows.filter((s) => Number(s.score) >= 9).length;
      const passives = npsRows.filter((s) => Number(s.score) >= 7 && Number(s.score) <= 8).length;
      const detractors = npsRows.filter((s) => Number(s.score) <= 6).length;
      const npsTotal = npsRows.length;
      const npsScore = npsTotal ? Math.round(((promoters - detractors) / npsTotal) * 100) : 0;

      const weeks = Array.from({ length: 8 }, (_, i) => {
        const start = new Date(now);
        start.setDate(start.getDate() - (8 - i) * 7);
        const end = new Date(now);
        end.setDate(end.getDate() - (7 - i) * 7);
        return { label: `W${i + 1}`, start, end };
      });
      const trend: CsatTrendPoint[] = weeks.map(({ label, start, end }) => ({
        label,
        avg: avg(csatRows.filter((r) => r.createdAt >= start && r.createdAt < end)),
      }));

      const themeCounts = new Map<string, number>();
      for (const row of commentRows) {
        const text = (row.comment ?? '').toLowerCase();
        for (const theme of THEME_KEYWORDS) {
          if (theme.keywords.some((k) => text.includes(k))) {
            themeCounts.set(theme.label, (themeCounts.get(theme.label) ?? 0) + 1);
          }
        }
      }
      const totalThemeHits = [...themeCounts.values()].reduce((a, b) => a + b, 0);
      const themes: VocTheme[] = THEME_KEYWORDS.filter((t) => themeCounts.has(t.label))
        .map((t) => ({
          label: t.label,
          color: t.color,
          pct: totalThemeHits ? Math.round(((themeCounts.get(t.label) ?? 0) / totalThemeHits) * 100) : 0,
        }))
        .sort((a, b) => b.pct - a.pct);

      const recent: RecentSurveyResponse[] = commentRows.map((r) => ({
        contactName: r.contact?.name ?? 'Unknown customer',
        score: Number(r.score ?? 0),
        channel: r.channel,
        comment: r.comment,
      }));

      return {
        csat: {
          avg: avg(csatSplit.current),
          deltaVsPrevMonth: delta(avg(csatSplit.current), avg(csatSplit.previous)),
          responseCount: csatRows.length,
        },
        nps: {
          score: npsScore,
          promoterPct: npsTotal ? Math.round((promoters / npsTotal) * 100) : 0,
          passivePct: npsTotal ? Math.round((passives / npsTotal) * 100) : 0,
          detractorPct: npsTotal ? Math.round((detractors / npsTotal) * 100) : 0,
        },
        ces: {
          avg: avg(cesSplit.current),
          deltaVsPrevMonth: delta(avg(cesSplit.current), avg(cesSplit.previous)),
        },
        trend,
        themes,
        recent,
      };
    });
  }
}
