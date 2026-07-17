import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import { KbService } from '../kb/kb.service';
import { isConfigured, llmComplete, LlmAuthError } from '../ai/llm';

export interface ConversationSummary {
  id: string;
  contactName: string;
  initials: string;
  avatarColor: string;
  channel: string;
  preview: string;
  time: string;
  sentiment: 'pos' | 'neu' | 'neg' | null;
  status: string;
}

export interface ThreadMessage {
  role: 'cust' | 'bot' | 'agent';
  text: string;
  time: string;
}

export interface ConversationThread {
  id: string;
  contactName: string;
  initials: string;
  avatarColor: string;
  channel: string;
  location: string | null;
  phone: string | null;
  linkedOrderRef: string | null;
  status: string;
  assignedUserId: string | null;
  messages: ThreadMessage[];
  copilot: {
    sentiment: 'pos' | 'neu' | 'neg' | null;
    suggestions: string[];
    kbArticles: string[];
    configured: boolean;
    nextBestActions: string[];
  };
}

const OPEN_STATUSES = ['open', 'in_progress', 'waiting'];
const RESOLVED_STATUSES = ['resolved', 'closed'];

// Rule-based "next best action" — a real lookup keyed by intent (same category as
// CHANNEL_META/INTENT_LABELS elsewhere: a business-rule table, not fabricated
// per-conversation text like the prototype's static "Offer ₹100 goodwill credit").
// Interpolates the conversation's own linked order when one exists.
const NEXT_BEST_ACTION_RULES: Record<string, (orderRef: string | null) => string[]> = {
  order_tracking: (orderRef) => [
    orderRef ? `Share the live tracking link for order ${orderRef}` : 'Look up the order and share a live tracking link',
    'Confirm the expected delivery window with the customer',
  ],
  refund: (orderRef) => [
    orderRef ? `Check the refund status for order ${orderRef}` : 'Look up the refund status for this order',
    'Offer a priority trace if the refund is past the SLA window',
  ],
  delivery_delay: (orderRef) => [
    orderRef ? `Escalate order ${orderRef} for priority dispatch` : 'Escalate this order for priority dispatch',
    'Offer a goodwill credit for the delay',
  ],
  product_enquiry: () => ['Share the relevant product details from the knowledge base', 'Confirm COD/EMI eligibility if asked'],
  emi_payment: (orderRef) => [
    'Share the available No-Cost EMI tenures',
    orderRef ? `Confirm EMI setup for order ${orderRef}` : 'Confirm EMI setup once the order is placed',
  ],
};

function nextBestActions(
  intent: string | null,
  sentiment: string | null,
  orderRef: string | null,
  status: string,
): string[] {
  const actions = intent ? (NEXT_BEST_ACTION_RULES[intent]?.(orderRef) ?? []) : [];
  if (sentiment === 'neg') actions.unshift('Acknowledge the frustration and offer a goodwill gesture');
  if (!RESOLVED_STATUSES.includes(status)) actions.push('Trigger a CSAT survey once this is resolved');
  return actions.slice(0, 3);
}
const SENDER_ROLE: Record<string, ThreadMessage['role']> = { customer: 'cust', bot: 'bot', agent: 'agent' };
// A contact has no stored colour (unlike User.avatarColor) — cycle a fixed palette by id,
// same category as the channel icon/colour maps (Plan §0.2: design tokens may live in code).
const AVATAR_PALETTE = ['#2563EB', '#0EA5E9', '#E08A00', '#16A34A', '#DB2777', '#4F46E5', '#DC2626'];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts[0]) return 'NA';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function avatarColorOf(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!;
}

function relativeTime(at: Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function clockTime(at: Date): string {
  return at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

@Injectable()
export class ConversationsService {
  private prisma = getPrisma();
  private readonly logger = new Logger(ConversationsService.name);

  constructor(private kb: KbService) {}

  async list(tenantId: string, channel?: string): Promise<ConversationSummary[]> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const now = new Date();
      const conversations = await tx.conversation.findMany({
        where: { status: { in: OPEN_STATUSES }, ...(channel ? { channel } : {}) },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: {
          contact: { select: { name: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      return conversations.map((c) => {
        const name = c.contact?.name ?? 'Unknown customer';
        const lastMessage = c.messages[0];
        return {
          id: c.id,
          contactName: name,
          initials: initialsOf(name),
          avatarColor: avatarColorOf(c.contactId ?? c.id),
          channel: c.channel,
          preview: lastMessage?.body ?? '(no messages yet)',
          time: relativeTime(lastMessage?.createdAt ?? c.updatedAt, now),
          sentiment: c.sentiment as ConversationSummary['sentiment'],
          status: c.status,
        };
      });
    });
  }

  async getThread(tenantId: string, id: string): Promise<ConversationThread> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const conv = await tx.conversation.findUnique({
        where: { id },
        include: { contact: true, messages: { orderBy: { createdAt: 'asc' } } },
      });
      if (!conv) throw new NotFoundException(`Conversation ${id} not found`);

      const lastOrder = conv.contactId
        ? await tx.order.findFirst({ where: { contactId: conv.contactId }, orderBy: { createdAt: 'desc' } })
        : null;

      const lastCustomerMessage = [...conv.messages].reverse().find((m) => m.senderType === 'customer');
      const kbArticles = lastCustomerMessage?.body ? await this.kb.searchByKeyword(tenantId, lastCustomerMessage.body, 3) : [];

      let configured = isConfigured();
      let suggestions: string[] = [];
      if (configured && lastCustomerMessage?.body) {
        const context = kbArticles.map((a) => `# ${a.title}\n${a.body}`).join('\n---\n');
        const prompt =
          `You are Astra, an AI co-pilot helping a human support agent reply to a customer on ${conv.channel}. ` +
          `Suggest exactly 2 short, ready-to-send reply drafts (each under 40 words), grounded ONLY in the ` +
          `knowledge base context below — do not invent policy details it doesn't cover. Separate the two ` +
          `drafts with a line containing only "---". No numbering, no explanation, just the two drafts.\n\n` +
          `Knowledge base:\n${context || '(no matching articles)'}\n\nCustomer's last message: ${lastCustomerMessage.body}`;
        try {
          const reply = await llmComplete(prompt);
          suggestions = reply
            .split(/^\s*---\s*$/m)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 2);
        } catch (err) {
          // Viewing a thread must never hard-fail because AI suggestions had trouble
          // (bad/rate-limited key, provider outage, ...) — degrade to the KB fallback below.
          if (err instanceof LlmAuthError) configured = false;
          this.logger.warn(`Co-pilot suggestion generation failed: ${err instanceof Error ? err.message : err}`);
        }
      }
      // No LLM draft (not configured, or the call above failed) — fall back to the
      // matched KB articles themselves rather than showing nothing. Still real,
      // grounded content, just not conversationally rephrased.
      if (suggestions.length === 0 && kbArticles.length > 0) {
        suggestions = kbArticles.slice(0, 2).map((a) => {
          const snippet = a.body.length > 160 ? `${a.body.slice(0, 160).trim()}…` : a.body;
          return `${snippet} (from "${a.title}")`;
        });
      }

      const name = conv.contact?.name ?? 'Unknown customer';
      return {
        id: conv.id,
        contactName: name,
        initials: initialsOf(name),
        avatarColor: avatarColorOf(conv.contactId ?? conv.id),
        channel: conv.channel,
        location: conv.contact?.location ?? null,
        phone: conv.contact?.phone ?? null,
        linkedOrderRef: lastOrder?.extRef ?? null,
        status: conv.status,
        assignedUserId: conv.assignedUserId,
        messages: conv.messages.map((m) => ({
          role: SENDER_ROLE[m.senderType] ?? 'agent',
          text: m.body ?? '',
          time: clockTime(m.createdAt),
        })),
        copilot: {
          sentiment: conv.sentiment as ConversationThread['copilot']['sentiment'],
          suggestions,
          kbArticles: kbArticles.map((a) => a.title),
          configured,
          nextBestActions: nextBestActions(conv.intent, conv.sentiment, lastOrder?.extRef ?? null, conv.status),
        },
      };
    });
  }

  async reply(tenantId: string, id: string, userId: string, text: string): Promise<ThreadMessage> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const conv = await tx.conversation.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!conv) throw new NotFoundException(`Conversation ${id} not found`);

      const message = await tx.message.create({
        data: { tenantId, conversationId: id, senderType: 'agent', senderId: userId, body: text },
      });
      await tx.conversation.update({
        where: { id },
        data: { status: conv.status === 'resolved' ? 'resolved' : 'in_progress' },
      });

      return { role: 'agent', text: message.body ?? '', time: clockTime(message.createdAt) };
    });
  }

  async assign(tenantId: string, id: string, userId: string): Promise<{ id: string; assignedUserId: string }> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.conversation.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundException(`Conversation ${id} not found`);
      const conv = await tx.conversation.update({ where: { id }, data: { assignedUserId: userId } });
      return { id: conv.id, assignedUserId: userId };
    });
  }

  async resolve(tenantId: string, id: string): Promise<{ id: string; status: string }> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.conversation.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new NotFoundException(`Conversation ${id} not found`);
      const conv = await tx.conversation.update({ where: { id }, data: { status: 'resolved' } });
      return { id: conv.id, status: conv.status };
    });
  }
}
