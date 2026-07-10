import { randomUUID } from 'crypto';
import { getPrisma } from '../client';
import { withTenant } from '../with-tenant';
import { nextRef } from '../next-ref';

/**
 * Dev seed — a tenant, plus enough tickets/surveys/rules/contacts+orders for
 * the Customer Journey aggregation (Journey summary endpoint, Plan §3.3) to
 * compute non-trivial numbers. Guarded by ticket count so re-running
 * `pnpm seed` doesn't duplicate rows.
 */

const TICKET_CATEGORIES = [
  { label: 'Cart abandoned at payment', count: 10 },
  { label: 'Delivery ETA unclear', count: 7 },
  { label: 'Return process confusion', count: 6 },
  { label: 'Coupon not applying', count: 4 },
  { label: 'Login/OTP issues', count: 3 },
];

// Knowledge Base articles (Guide §10) — Astra answers only from these.
const KB_ARTICLES = [
  {
    title: 'Delivery times and tracking',
    category: 'Delivery',
    body: 'Standard delivery takes 3-5 business days; express delivery takes 1-2 business days. You can track your order anytime from Order History — every order gets a tracking link by SMS and email once it ships. If your order is delayed beyond the estimated date, contact support with your order reference (format ZK-xxxxx) and we will check with the courier and update you within 24 hours.',
  },
  {
    title: 'Returns and refunds policy',
    category: 'Returns',
    body: 'Items can be returned within 7 days of delivery if unused and in original packaging. Start a return from Order History by selecting "Return item". Once the returned item is received and inspected, refunds are processed to the original payment method within 5-7 business days. Refunds cannot be issued for items marked non-returnable at purchase (e.g. innerwear, perishables) or after the 7-day window.',
  },
  {
    title: 'Applying a coupon code',
    category: 'Coupons',
    body: 'Enter your coupon code at checkout in the "Apply coupon" field before placing the order — coupons cannot be applied after an order is placed. Common reasons a coupon fails: it has expired, the cart total is below the minimum spend for that coupon, or the coupon is restricted to specific categories that are not in your cart. Each coupon code can only be used once per account.',
  },
  {
    title: 'Login and OTP troubleshooting',
    category: 'Account',
    body: 'The login OTP is sent by SMS to your registered mobile number and is valid for 5 minutes. If you do not receive it, check that your number is entered correctly, wait 60 seconds and use "Resend OTP", and confirm your phone has network signal. If OTP issues continue after 3 attempts, contact support to verify your account and registered number.',
  },
];

// Comments carry keyword phrases the Surveys service tags into VoC themes
// (fast resolution / friendly agents / delivery delays / refund speed / app issues).
const CSAT_COMMENTS = [
  'Astra sorted my refund in 2 minutes, super fast resolution!',
  'Delivery was late again, third time this month.',
  'The agent was so friendly and patient with me.',
  'Refund took over a week, refund speed needs work.',
  'App keeps crashing when I try to track my order.',
  'Quick help, resolved on the first try.',
  'Delivery delayed by 3 days with no update.',
  'Really friendly and helpful support team.',
  'Fast resolution, didn\'t expect it to be this smooth.',
  'App issues — checkout button doesn\'t respond.',
];

const CHANNELS = ['WhatsApp', 'Voice', 'Chat', 'Email'];

// Spreads survey createdAt across the last 8 weeks so the CSAT trend chart
// (Surveys & VoC) has real week-over-week variation instead of one spike today.
function weekDate(weekIndex: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - (7 - weekIndex) * 7 - Math.floor(Math.random() * 6));
  return d;
}

// Past WhatsApp broadcasts — createdAt spread over the last month so "Recent campaigns"
// (Campaigns view) lists them most-recent-first in this order.
const PAST_CAMPAIGNS = [
  { name: 'Monsoon Sale blast', daysAgo: 3, sent: 1000, delivered: 980, read: 720, replied: 50 },
  { name: 'Cart reminder — electronics', daysAgo: 10, sent: 1000, delivered: 950, read: 400, replied: 180 },
  { name: 'CSAT feedback request', daysAgo: 18, sent: 1000, delivered: 970, read: 640, replied: 80 },
  { name: 'Diwali early access', daysAgo: 25, sent: 1000, delivered: 980, read: 810, replied: 120 },
];

// Published KB articles behind the Self-Service Portal's category tiles — counts come
// straight from a groupBy, so the tile copy below just needs enough titles per category.
const PORTAL_KB_ARTICLES: { category: string; title: string }[] = [
  { category: 'Orders & delivery', title: 'How to track your order' },
  { category: 'Orders & delivery', title: 'What does "out for delivery" mean?' },
  { category: 'Orders & delivery', title: 'Delivery is late — what now?' },
  { category: 'Orders & delivery', title: 'Can I change my delivery address?' },
  { category: 'Orders & delivery', title: 'Same-day delivery eligibility' },
  { category: 'Orders & delivery', title: 'Tracking shows no updates' },
  { category: 'Orders & delivery', title: 'Order marked delivered but not received' },
  { category: 'Orders & delivery', title: 'Scheduling a delivery slot' },
  { category: 'Returns & refunds', title: 'How to start a return' },
  { category: 'Returns & refunds', title: 'Refund timelines by payment method' },
  { category: 'Returns & refunds', title: 'Return pickup not scheduled' },
  { category: 'Returns & refunds', title: 'Exchanging a product for a different size' },
  { category: 'Returns & refunds', title: 'Items not eligible for return' },
  { category: 'Returns & refunds', title: 'Refund stuck — how to check status' },
  { category: 'Payments & EMI', title: 'Available EMI options' },
  { category: 'Payments & EMI', title: 'Payment failed but amount deducted' },
  { category: 'Payments & EMI', title: 'Applying a coupon code at checkout' },
  { category: 'Payments & EMI', title: 'Adding a new payment method' },
  { category: 'Payments & EMI', title: 'Understanding your invoice' },
  { category: 'Account & app', title: 'Resetting your password' },
  { category: 'Account & app', title: 'OTP not received' },
  { category: 'Account & app', title: 'Updating your profile details' },
  { category: 'Account & app', title: 'App keeps crashing on checkout' },
  { category: 'Account & app', title: 'Deleting your account' },
  { category: 'Warranty & repair', title: 'Registering your product warranty' },
  { category: 'Warranty & repair', title: 'Booking a repair visit' },
  { category: 'Warranty & repair', title: 'Warranty claim rejected — next steps' },
  { category: 'Warranty & repair', title: 'Extending your warranty (AMC)' },
];

// Agents behind Auto QA's leaderboard and the AI-vs-human split in conversations/QA audits.
// index 0 (Kavya Menon) is the team lead — excluded from the agent-assignment rotation below.
const AGENT_USERS = [
  { name: 'Kavya Menon', email: 'kavya.menon@shopnova.in', avatarColor: '#2563EB', title: 'Team Lead' },
  { name: 'Aditya Nair', email: 'aditya.nair@shopnova.in', avatarColor: '#4F46E5', title: 'Senior Agent · BFSI' },
  { name: 'Priya Sharma', email: 'priya.sharma@shopnova.in', avatarColor: '#0EA5E9', title: 'Agent · Retail' },
  { name: 'Meera Joshi', email: 'meera.joshi@shopnova.in', avatarColor: '#E08A00', title: 'Agent · Travel' },
  { name: 'Rahul Verma', email: 'rahul.verma@shopnova.in', avatarColor: '#16A34A', title: 'Agent · Retail' },
];

function weighted<T>(pairs: [T, number][]): T[] {
  const out: T[] = [];
  for (const [value, count] of pairs) for (let i = 0; i < count; i++) out.push(value);
  // Shuffle so consecutive conversations don't streak on the same value — pairs are built
  // as contiguous same-value blocks, which would otherwise cluster in any short window
  // (e.g. the "recent audits" list) even though the overall distribution stays correct.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 100-entry weighted pools — index by `i % pool.length` to distribute conversations
// realistically across channel/language/intent/sentiment without needing true randomness.
const CONV_CHANNELS = weighted<string>([['whatsapp', 45], ['chat', 20], ['voice', 15], ['email', 12], ['instagram', 8]]);
const CONV_LANGUAGES = weighted<string>([['en', 52], ['hi', 28], ['ta', 7], ['te', 6], ['bn', 4], ['mr', 3]]);
const CONV_INTENTS = weighted<string>([
  ['order_tracking', 34],
  ['refund', 26],
  ['delivery_delay', 18],
  ['product_enquiry', 12],
  ['emi_payment', 10],
]);
const CONV_SENTIMENTS = weighted<string>([['pos', 60], ['neu', 25], ['neg', 15]]);
// Hour-of-day pool shaped like real support volume — lunch (12-13h) and evening (20-21h) peaks.
const CONV_HOURS = weighted<number>([
  [9, 2], [10, 3], [11, 3], [12, 5], [13, 4], [14, 3], [15, 3], [16, 3], [17, 3], [18, 4], [19, 4], [20, 5], [21, 3],
]);
const INTENT_LABELS: Record<string, string> = {
  order_tracking: 'Order tracking',
  refund: 'Refunds & returns',
  delivery_delay: 'Delivery delay',
  product_enquiry: 'Product enquiry',
  emi_payment: 'EMI & payment',
};

// Conversation volume per day, last 14 days (index 0 = 13 days ago .. index 13 = today) —
// shaped like a growing trend so Analytics' line chart isn't flat. AI-resolved is the subset
// with no assigned human agent.
const DAILY_TOTAL = [5, 6, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9];
const DAILY_AI = [3, 4, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 8];

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

const NUDGE_RULES = [
  { name: 'Cart abandoned → WhatsApp reminder', trigger: 'cart_abandoned', enabled: true },
  { name: 'Delivery delayed → proactive SMS', trigger: 'delivery_delayed', enabled: true },
  { name: 'Post-delivery → CSAT survey', trigger: 'order_delivered', enabled: true },
  { name: 'No order 60 days → win-back offer', trigger: 'no_order_60d', enabled: true },
  { name: 'Warranty expiring → AMC renewal', trigger: 'warranty_expiring', enabled: false },
];

// Default roles (Guide §7.5), using the canonical permission strings from
// @aq/shared's PERMISSIONS list. Admin's '*' means "can do everything" — see
// PermissionsGuard in apps/api/src/auth/permissions.guard.ts.
const DEFAULT_ROLES = [
  { name: 'Admin', permissions: ['*'] },
  {
    name: 'Manager',
    permissions: ['ticket.view.all', 'ticket.create', 'ticket.move', 'ticket.assign', 'sla.view', 'refund.approve', 'analytics.view', 'audit.view'],
  },
  {
    name: 'TeamLead',
    permissions: ['ticket.view.all', 'ticket.create', 'ticket.move', 'ticket.assign', 'sla.view'],
  },
  {
    name: 'Agent',
    permissions: ['ticket.view.assigned', 'ticket.move', 'conversation.view', 'conversation.reply'],
  },
  { name: 'QA', permissions: ['conversation.view', 'qa.view', 'qa.audit'] },
  { name: 'Viewer', permissions: ['analytics.view'] },
];

// One default SLA policy per priority (Guide §8.3/§11) — without these,
// SlaService.startTimers() has nothing to attach to a new ticket.
const DEFAULT_SLA_POLICIES = [
  { priority: 'p1', name: 'P1 — Urgent', firstResponseMins: 15, resolutionMins: 120 },
  { priority: 'p2', name: 'P2 — High', firstResponseMins: 30, resolutionMins: 240 },
  { priority: 'p3', name: 'P3 — Medium', firstResponseMins: 60, resolutionMins: 480 },
  { priority: 'p4', name: 'P4 — Low', firstResponseMins: 120, resolutionMins: 1440 },
];

async function main() {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'shopnova' },
    update: {},
    create: { name: 'Shopnova', subdomain: 'shopnova' },
  });
  console.log(`Seeded tenant: ${tenant.name} (${tenant.id})`);

  for (const role of DEFAULT_ROLES) {
    await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: role.name } },
      update: { permissions: role.permissions },
      create: { tenantId: tenant.id, name: role.name, permissions: role.permissions },
    });
  }
  console.log(`Seeded ${DEFAULT_ROLES.length} default roles.`);

  await withTenant(prisma, tenant.id, async (tx) => {
    for (const policy of DEFAULT_SLA_POLICIES) {
      const existing = await tx.slaPolicy.findFirst({
        where: { tenantId: tenant.id, priority: policy.priority },
      });
      if (!existing) {
        await tx.slaPolicy.create({ data: { tenantId: tenant.id, ...policy } });
      }
    }
    console.log(`Seeded ${DEFAULT_SLA_POLICIES.length} default SLA policies.`);
  });

  await withTenant(prisma, tenant.id, async (tx) => {
    for (const article of KB_ARTICLES) {
      const existing = await tx.kbArticle.findFirst({
        where: { tenantId: tenant.id, title: article.title },
      });
      if (!existing) {
        await tx.kbArticle.create({ data: { tenantId: tenant.id, ...article } });
      }
    }
    console.log(`Seeded ${KB_ARTICLES.length} KB articles.`);
  });

  await withTenant(prisma, tenant.id, async (tx) => {
    const existingTickets = await tx.ticket.count();
    if (existingTickets > 0) {
      console.log('Demo data already seeded — skipping (tickets exist).');
      return;
    }

    // 25 extra contacts: 5 with no orders, 10 with exactly one, 10 repeat buyers (2-3 orders).
    // Repeat buyers (15-24) double as the "Gold loyalty members" campaign audience; a
    // cross-tier slice (10-19) is tagged as "festive_shopper" for the Festive shoppers audience.
    const newContacts = [];
    for (let i = 0; i < 25; i++) {
      newContacts.push(
        await tx.contact.create({
          data: {
            tenantId: tenant.id,
            name: `Demo Contact ${i + 1}`,
            phone: `9${(700000000 + i).toString()}`,
            email: `demo.contact${i + 1}@example.com`,
            loyaltyTier: i >= 15 ? 'Gold' : i >= 5 ? 'Silver' : null,
            tags: i >= 10 && i < 20 ? ['festive_shopper'] : [],
          },
        }),
      );
    }

    const ordersPerContact = (index: number) => {
      if (index < 5) return 0;
      if (index < 15) return 1;
      return 2 + (index % 2); // 2 or 3
    };
    for (let i = 0; i < newContacts.length; i++) {
      const n = ordersPerContact(i);
      for (let j = 0; j < n; j++) {
        await tx.order.create({
          data: {
            tenantId: tenant.id,
            contactId: newContacts[i]!.id,
            extRef: await nextRef(tx, tenant.id, 'ZK-'),
            description: 'Demo order',
            amount: 999 + j * 250,
            status: 'delivered',
          },
        });
      }
    }

    const allContacts = await tx.contact.findMany({ select: { id: true } });

    // Tickets across the 5 friction categories, mostly resolved.
    let created = 0;
    for (const { label, count } of TICKET_CATEGORIES) {
      for (let i = 0; i < count; i++) {
        const isResolved = created % 5 !== 0; // ~80% resolved
        await tx.ticket.create({
          data: {
            tenantId: tenant.id,
            extRef: await nextRef(tx, tenant.id, 'AQ-T-'),
            contactId: allContacts[created % allContacts.length]?.id,
            subject: label,
            category: label,
            status: isResolved ? 'resolved' : 'in_progress',
          },
        });
        created++;
      }
    }

    // Escalate a handful of resolved tickets so FCR isn't 100%.
    const resolvedTickets = await tx.ticket.findMany({ where: { status: 'resolved' }, select: { id: true, createdAt: true } });
    for (const t of resolvedTickets.slice(0, 5)) {
      await tx.escalation.create({
        data: { tenantId: tenant.id, ticketId: t.id, level: 1, reason: 'No response within SLA window' },
      });
    }

    // CSAT tied to resolved tickets (Support stage), spread across 8 weeks for the trend chart.
    const csatScores = [4, 4, 5, 5, 5, 3, 4, 5, 4, 5, 5, 4, 5, 4, 5];
    await Promise.all(
      resolvedTickets
        .slice(0, csatScores.length)
        .map((t, i) =>
          tx.survey.create({
            data: {
              tenantId: tenant.id,
              ticketId: t.id,
              type: 'csat',
              score: csatScores[i],
              channel: CHANNELS[i % CHANNELS.length],
              createdAt: weekDate(i % 8),
            },
          }),
        ),
    );

    // CSAT not tied to a ticket — post-delivery survey (Onboarding stage). Carries the
    // comment/channel that the Surveys service tags into VoC themes and shows in the
    // "Recent survey responses" list.
    const onboardingCsat = [5, 4, 5, 5, 4, 5, 3, 5, 4, 5];
    await Promise.all(
      newContacts
        .slice(0, onboardingCsat.length)
        .map((c, i) =>
          tx.survey.create({
            data: {
              tenantId: tenant.id,
              contactId: c.id,
              type: 'csat',
              score: onboardingCsat[i],
              comment: CSAT_COMMENTS[i],
              channel: CHANNELS[i % CHANNELS.length],
              createdAt: weekDate(i % 8),
            },
          }),
        ),
    );

    // NPS — 14 promoters, 4 passives, 2 detractors → NPS ≈ +60.
    const npsScores = [10, 9, 10, 9, 9, 10, 10, 9, 10, 9, 10, 9, 10, 9, 8, 7, 8, 7, 4, 6];
    await Promise.all(
      newContacts
        .slice(0, npsScores.length)
        .map((c, i) => tx.survey.create({ data: { tenantId: tenant.id, contactId: c.id, type: 'nps', score: npsScores[i] } })),
    );

    // CES — Customer Effort Score, 1–7 scale ("how easy was it to get help").
    const cesScores = [6, 7, 6, 5, 6, 7, 5, 6, 7, 6, 5, 6, 7, 6, 5];
    await Promise.all(
      newContacts
        .slice(0, cesScores.length)
        .map((c, i) =>
          tx.survey.create({
            data: {
              tenantId: tenant.id,
              contactId: c.id,
              type: 'ces',
              score: cesScores[i],
              channel: CHANNELS[i % CHANNELS.length],
              createdAt: weekDate(i % 8),
            },
          }),
        ),
    );

    // Agents behind Auto QA's leaderboard and the AI-vs-human split below. The lead
    // (index 0) is excluded from the assignment rotation.
    const agentUsers = await Promise.all(
      AGENT_USERS.map((u) => tx.user.create({ data: { tenantId: tenant.id, ...u } })),
    );
    const rotationAgents = agentUsers.slice(1);

    // Conversations + messages + QA audits behind Auto QA and Analytics — 14 days of
    // volume shaped so AI resolves a growing share (Analytics line chart), and every
    // resolved conversation gets audited (QA's "100% auto-audited" KPI).
    const conversations: any[] = [];
    const messages: any[] = [];
    const qaAudits: any[] = [];
    let convIndex = 0;
    for (let day = 0; day < DAILY_TOTAL.length; day++) {
      const daysAgo = DAILY_TOTAL.length - 1 - day;
      const total = DAILY_TOTAL[day];
      const aiCount = DAILY_AI[day];
      const isLastDay = day === DAILY_TOTAL.length - 1;
      for (let j = 0; j < total; j++) {
        const isAi = j < aiCount;
        const contact = allContacts[convIndex % allContacts.length];
        const assignedUserId = isAi ? null : rotationAgents[convIndex % rotationAgents.length].id;
        const hour = CONV_HOURS[convIndex % CONV_HOURS.length];
        const createdAt = new Date();
        createdAt.setDate(createdAt.getDate() - daysAgo);
        createdAt.setHours(hour, randInt(0, 59), 0, 0);
        const isOpen = isLastDay && j >= total - 2; // today's last couple are still in-flight
        const handleTimeMins = isAi ? randInt(2, 8) : randInt(6, 22);
        const updatedAt = isOpen ? createdAt : new Date(createdAt.getTime() + handleTimeMins * 60_000);
        const id = randomUUID();
        const intent = CONV_INTENTS[convIndex % CONV_INTENTS.length];
        const channel = CONV_CHANNELS[convIndex % CONV_CHANNELS.length];

        conversations.push({
          id,
          tenantId: tenant.id,
          contactId: contact?.id,
          channel,
          status: isOpen ? 'open' : 'resolved',
          sentiment: CONV_SENTIMENTS[convIndex % CONV_SENTIMENTS.length],
          intent,
          language: CONV_LANGUAGES[convIndex % CONV_LANGUAGES.length],
          assignedUserId,
          createdAt,
          updatedAt,
        });

        const responseSecs = isAi ? randInt(5, 40) : randInt(45, 420);
        messages.push(
          { tenantId: tenant.id, conversationId: id, senderType: 'customer', body: 'Customer message', createdAt },
          {
            tenantId: tenant.id,
            conversationId: id,
            senderType: isAi ? 'bot' : 'agent',
            senderId: assignedUserId,
            body: isAi ? 'Astra AI response' : 'Agent response',
            createdAt: new Date(createdAt.getTime() + responseSecs * 1000),
          },
        );

        if (!isOpen) {
          const score = isAi ? randInt(88, 97) : randInt(65, 95);
          const flagged = score < 75;
          const empathy = score >= 90 ? 'High' : score >= 80 ? 'Good' : 'Needs work';
          const resolution = isAi ? 'Auto' : flagged ? 'Escalated' : 'Resolved';
          qaAudits.push({
            tenantId: tenant.id,
            conversationId: id,
            agentUserId: assignedUserId,
            contactId: contact?.id,
            score,
            breakdown: { category: INTENT_LABELS[intent], empathy, resolution, channel },
            flagged,
            createdAt: updatedAt,
          });
        }
        convIndex++;
      }
    }
    await tx.conversation.createMany({ data: conversations });
    await tx.message.createMany({ data: messages });
    await tx.qaAudit.createMany({ data: qaAudits });

    // SLA resolution events for resolved tickets — ~92% met, a few breached (Analytics'
    // "SLA met" KPI).
    await tx.slaEvent.createMany({
      data: resolvedTickets.map((t, i) => {
        const targetMins = 240;
        const breached = i % 12 === 0;
        const actualMins = breached ? targetMins + randInt(30, 180) : randInt(20, targetMins - 10);
        const targetAt = new Date(t.createdAt.getTime() + targetMins * 60_000);
        return {
          tenantId: tenant.id,
          ticketId: t.id,
          kind: 'resolution',
          targetAt,
          metAt: breached ? null : new Date(t.createdAt.getTime() + actualMins * 60_000),
          breached,
        };
      }),
    });

    // Proactive nudges — automation rules behind the Journey "nudges firing" panel.
    await tx.rule.createMany({
      data: NUDGE_RULES.map((r) => ({ tenantId: tenant.id, ...r })),
    });

    // Past broadcasts behind the Campaigns view's "Recent campaigns" panel.
    await Promise.all(
      PAST_CAMPAIGNS.map(({ daysAgo, ...c }) => {
        const createdAt = new Date();
        createdAt.setDate(createdAt.getDate() - daysAgo);
        return tx.campaign.create({
          data: { tenantId: tenant.id, channel: 'whatsapp', status: 'sent', createdAt, ...c },
        });
      }),
    );

    // KB articles behind the Self-Service Portal's category tiles.
    await tx.kbArticle.createMany({
      data: PORTAL_KB_ARTICLES.map((a) => ({
        tenantId: tenant.id,
        category: a.category,
        title: a.title,
        body: `Placeholder content for "${a.title}".`,
        status: 'published',
      })),
    });

    console.log(
      `Seeded ${newContacts.length} contacts, ${created} tickets, ${KB_ARTICLES.length + PORTAL_KB_ARTICLES.length} KB articles, ` +
        `${agentUsers.length} agents, ${conversations.length} conversations, ${qaAudits.length} QA audits, surveys and ${NUDGE_RULES.length} rules.`,
    );
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
