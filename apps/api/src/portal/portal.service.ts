import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';

export interface PortalCategory {
  icon: string;
  label: string;
  articleCount: number;
}
export interface LatestOrderStatus {
  extRef: string;
  status: string;
}
export interface PortalPayload {
  categories: PortalCategory[];
  latestOrder: LatestOrderStatus | null;
}

// Display order + icon for each KB category — counts come from a real groupBy below.
const CATEGORY_ORDER: { label: string; icon: string }[] = [
  { label: 'Orders & delivery', icon: '📦' },
  { label: 'Returns & refunds', icon: '↩️' },
  { label: 'Payments & EMI', icon: '💳' },
  { label: 'Account & app', icon: '👤' },
  { label: 'Warranty & repair', icon: '🛡️' },
];

@Injectable()
export class PortalService {
  private prisma = getPrisma();

  async get(tenantId: string): Promise<PortalPayload> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const [counts, latestOrder] = await Promise.all([
        tx.kbArticle.groupBy({
          by: ['category'],
          where: { status: 'published', category: { not: null } },
          _count: { category: true },
        }),
        tx.order.findFirst({ orderBy: { createdAt: 'desc' }, select: { extRef: true, status: true } }),
      ]);

      const countByLabel = new Map(counts.map((c) => [c.category, c._count.category]));
      const categories: PortalCategory[] = CATEGORY_ORDER.filter((c) => countByLabel.has(c.label)).map((c) => ({
        icon: c.icon,
        label: c.label,
        articleCount: countByLabel.get(c.label) ?? 0,
      }));

      return {
        categories,
        latestOrder: latestOrder?.extRef ? { extRef: latestOrder.extRef, status: latestOrder.status ?? 'unknown' } : null,
      };
    });
  }
}
