import { Injectable, NotFoundException } from '@nestjs/common';
import { getPrisma, withTenant, type Contact } from '@aq/db';
import type { ContactDto } from '@aq/shared';
import { CreateContactDto } from './create-contact.dto';

export interface ContactProfile {
  id: string;
  name: string;
  location: string | null;
  memberSince: string;
  orderCount: number;
  lifetimeValue: number;
  loyaltyTier: string | null;
  sentiment: 'pos' | 'neu' | 'neg' | null;
  phone: string | null;
  email: string | null;
  language: string | null;
  preferredChannel: string | null;
  openTickets: number;
}

export interface ContactOrderView {
  id: string;
  extRef: string | null;
  description: string | null;
  amount: number | null;
  status: string | null;
  createdAt: string;
}

export interface ContactTicketView {
  id: string;
  extRef: string | null;
  subject: string;
  channel: string | null;
  status: string;
  createdAt: string;
}

export interface SentimentMonth {
  label: string;
  pos: number;
  neu: number;
  neg: number;
  dominant: 'pos' | 'neu' | 'neg' | null;
}

function toContactDto(c: Contact): ContactDto {
  return {
    id: c.id,
    customerType: c.customerType as ContactDto['customerType'],
    name: c.name ?? '',
    mobile: c.phone ?? '',
    email: c.email,
    company: c.company,
    segment: c.segment as ContactDto['segment'],
    tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
    lifetimeValue: Number(c.lifetimeValue),
    createdAt: c.createdAt.toISOString(),
  };
}

const OPEN_TICKET_STATUSES_EXCLUDED = ['resolved', 'closed'];

@Injectable()
export class ContactsService {
  private prisma = getPrisma();

  async create(tenantId: string, dto: CreateContactDto): Promise<ContactDto> {
    const lifetimeValue = dto.orders.reduce((sum, o) => sum + (o.amount || 0), 0);

    return withTenant(this.prisma, tenantId, async (tx) => {
      const contact = await tx.contact.create({
        data: {
          tenantId,
          customerType: dto.customerType,
          name: dto.name,
          phone: dto.mobile,
          altPhone: dto.altMobile,
          email: dto.email,
          company: dto.company,
          industry: dto.industry,
          gstin: dto.gstin,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          city: dto.city,
          state: dto.state,
          pincode: dto.pincode,
          landmark: dto.landmark,
          language: dto.language,
          segment: dto.segment,
          source: dto.source,
          assignedTo: dto.assignedTo,
          tags: dto.tags,
          consentWhatsapp: dto.consent.whatsapp,
          consentSms: dto.consent.sms,
          consentEmail: dto.consent.email,
          consentCall: dto.consent.call,
          notes: dto.notes,
          lifetimeValue,
          orders: {
            create: dto.orders.map((o) => ({
              tenantId,
              extRef: o.orderRef,
              description: o.product,
              qty: o.qty,
              amount: o.amount,
              ...(o.purchaseDate ? { createdAt: new Date(o.purchaseDate) } : {}),
            })),
          },
        },
      });
      return toContactDto(contact);
    });
  }

  async getLatestId(tenantId: string): Promise<string | null> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const contact = await tx.contact.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      return contact?.id ?? null;
    });
  }

  async getProfile(tenantId: string, id: string): Promise<ContactProfile> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const contact = await tx.contact.findUnique({ where: { id } });
      if (!contact) throw new NotFoundException(`Contact ${id} not found`);

      const [orderCount, openTickets, lastConversation, topChannel] = await Promise.all([
        tx.order.count({ where: { contactId: id } }),
        tx.ticket.count({ where: { contactId: id, status: { notIn: OPEN_TICKET_STATUSES_EXCLUDED } } }),
        tx.conversation.findFirst({ where: { contactId: id }, orderBy: { createdAt: 'desc' } }),
        tx.conversation.groupBy({
          by: ['channel'],
          where: { contactId: id },
          _count: { channel: true },
          orderBy: { _count: { channel: 'desc' } },
          take: 1,
        }),
      ]);

      return {
        id: contact.id,
        name: contact.name ?? '',
        location: contact.location,
        memberSince: contact.createdAt.toISOString(),
        orderCount,
        lifetimeValue: Number(contact.lifetimeValue),
        loyaltyTier: contact.loyaltyTier,
        sentiment: (lastConversation?.sentiment as ContactProfile['sentiment']) ?? null,
        phone: contact.phone,
        email: contact.email,
        language: contact.language,
        preferredChannel: topChannel[0]?.channel ?? null,
        openTickets,
      };
    });
  }

  async getOrders(tenantId: string, id: string): Promise<ContactOrderView[]> {
    const orders = await withTenant(this.prisma, tenantId, (tx) =>
      tx.order.findMany({ where: { contactId: id }, orderBy: { createdAt: 'desc' } }),
    );
    return orders.map((o) => ({
      id: o.id,
      extRef: o.extRef,
      description: o.description,
      amount: o.amount ? Number(o.amount) : null,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async getTickets(tenantId: string, id: string): Promise<ContactTicketView[]> {
    const tickets = await withTenant(this.prisma, tenantId, (tx) =>
      tx.ticket.findMany({
        where: { contactId: id },
        orderBy: { createdAt: 'desc' },
        include: { conversation: true },
      }),
    );
    return tickets.map((t) => ({
      id: t.id,
      extRef: t.extRef,
      subject: t.subject,
      channel: t.conversation?.channel ?? null,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  async getTimeline(tenantId: string, id: string): Promise<SentimentMonth[]> {
    const conversations = await withTenant(this.prisma, tenantId, (tx) =>
      tx.conversation.findMany({
        where: { contactId: id, sentiment: { not: null } },
        select: { sentiment: true, createdAt: true },
      }),
    );

    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleString('en-US', { month: 'short' }) };
    });

    return months.map(({ year, month, label }) => {
      const inMonth = conversations.filter(
        (c) => c.createdAt.getFullYear() === year && c.createdAt.getMonth() === month,
      );
      const pos = inMonth.filter((c) => c.sentiment === 'pos').length;
      const neu = inMonth.filter((c) => c.sentiment === 'neu').length;
      const neg = inMonth.filter((c) => c.sentiment === 'neg').length;
      const total = pos + neu + neg;
      const dominant: SentimentMonth['dominant'] =
        total === 0 ? null : pos >= neu && pos >= neg ? 'pos' : neg >= neu ? 'neg' : 'neu';
      return { label, pos, neu, neg, dominant };
    });
  }
}
