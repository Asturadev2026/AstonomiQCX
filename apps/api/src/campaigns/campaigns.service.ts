import { Injectable } from '@nestjs/common';
import { getPrisma, withTenant, type Tx } from '@aq/db';
import type { SendCampaignDto } from './send-campaign.dto';

export const AUDIENCE_IDS = ['gold', 'abandoned_cart', 'festive'] as const;
export type AudienceId = (typeof AUDIENCE_IDS)[number];

export interface CampaignAudience {
  id: AudienceId;
  icon: string;
  iconClass: string;
  label: string;
  description: string;
  count: number;
  sampleName: string;
  defaultMessage: string;
}
export interface RecentCampaign {
  id: string;
  name: string;
  metricLabel: string;
}
export interface CampaignsPayload {
  audiences: CampaignAudience[];
  recent: RecentCampaign[];
}

const CART_ABANDONED_CATEGORY = 'Cart abandoned at payment';
const FESTIVE_TAG = 'festive_shopper';

const AUDIENCE_META: Record<AudienceId, Pick<CampaignAudience, 'icon' | 'iconClass' | 'label' | 'description' | 'defaultMessage'>> = {
  gold: {
    icon: '👑',
    iconClass: 'b-blue',
    label: 'Gold loyalty members',
    description: 'High-value repeat buyers',
    defaultMessage: "Hi {name}! 🎉 Your Gold membership unlocks an extra 15% off this weekend on ShopNova. Use code GOLD15. Shop now 👉 shopnova.in/gold",
  },
  abandoned_cart: {
    icon: '🛒',
    iconClass: 'b-amber',
    label: 'Abandoned cart',
    description: 'Left items in last 7 days',
    defaultMessage: 'Hi {name}! You left something in your cart 👀 Complete your order in the next 24h and get free shipping. shopnova.in/cart',
  },
  festive: {
    icon: '🎉',
    iconClass: 'b-green',
    label: 'Festive shoppers',
    description: 'Bought during last sale',
    defaultMessage: 'Hi {name}! 🪔 Our next festive sale drops early for you — 48h early access starts now. shopnova.in/festive',
  },
};

function firstName(name: string | null | undefined): string {
  return (name ?? 'there').split(' ')[0];
}

@Injectable()
export class CampaignsService {
  private prisma = getPrisma();

  private async countAudience(tx: Tx, id: AudienceId): Promise<{ count: number; sampleName: string }> {
    if (id === 'gold') {
      const [count, sample] = await Promise.all([
        tx.contact.count({ where: { loyaltyTier: 'Gold' } }),
        tx.contact.findFirst({ where: { loyaltyTier: 'Gold' }, select: { name: true } }),
      ]);
      return { count, sampleName: firstName(sample?.name) };
    }
    if (id === 'festive') {
      const where = { tags: { array_contains: FESTIVE_TAG } } as const;
      const [count, sample] = await Promise.all([
        tx.contact.count({ where }),
        tx.contact.findFirst({ where, select: { name: true } }),
      ]);
      return { count, sampleName: firstName(sample?.name) };
    }
    // abandoned_cart — distinct contacts with a "cart abandoned" support ticket
    const tickets = await tx.ticket.findMany({
      where: { category: CART_ABANDONED_CATEGORY, contactId: { not: null } },
      select: { contact: { select: { name: true } } },
      distinct: ['contactId'],
    });
    return { count: tickets.length, sampleName: firstName(tickets[0]?.contact?.name) };
  }

  async get(tenantId: string): Promise<CampaignsPayload> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const audiences = await Promise.all(
        AUDIENCE_IDS.map(async (id) => {
          const { count, sampleName } = await this.countAudience(tx, id);
          return { id, count, sampleName, ...AUDIENCE_META[id] };
        }),
      );

      const campaigns = await tx.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
      const recent: RecentCampaign[] = campaigns.map((c) => {
        const sent = c.sent || 0;
        const isReminder = (c.name ?? '').toLowerCase().includes('reminder');
        const pct = sent === 0 ? 0 : Math.round(((isReminder ? c.replied : c.read) / sent) * 100);
        return { id: c.id, name: c.name ?? 'Untitled campaign', metricLabel: sent === 0 ? '—' : `${pct}% ${isReminder ? 'reply' : 'read'}` };
      });

      return { audiences, recent };
    });
  }

  async send(tenantId: string, dto: SendCampaignDto): Promise<RecentCampaign> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const { count } = await this.countAudience(tx, dto.audienceId);
      const label = AUDIENCE_META[dto.audienceId].label;
      const campaign = await tx.campaign.create({
        data: {
          tenantId,
          name: `${label} broadcast`,
          channel: 'whatsapp',
          segment: dto.audienceId,
          template: dto.message,
          status: 'sending',
          sent: count,
        },
      });
      return { id: campaign.id, name: campaign.name ?? label, metricLabel: '—' };
    });
  }
}
