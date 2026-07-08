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
    const newContacts = [];
    for (let i = 0; i < 25; i++) {
      newContacts.push(
        await tx.contact.create({
          data: {
            tenantId: tenant.id,
            name: `Demo Contact ${i + 1}`,
            phone: `9${(700000000 + i).toString()}`,
            email: `demo.contact${i + 1}@example.com`,
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
    const resolvedTickets = await tx.ticket.findMany({ where: { status: 'resolved' }, select: { id: true } });
    for (const t of resolvedTickets.slice(0, 5)) {
      await tx.escalation.create({
        data: { tenantId: tenant.id, ticketId: t.id, level: 1, reason: 'No response within SLA window' },
      });
    }

    // CSAT tied to resolved tickets (Support stage).
    const csatScores = [4, 4, 5, 5, 5, 3, 4, 5, 4, 5, 5, 4, 5, 4, 5];
    await Promise.all(
      resolvedTickets
        .slice(0, csatScores.length)
        .map((t, i) => tx.survey.create({ data: { tenantId: tenant.id, ticketId: t.id, type: 'csat', score: csatScores[i] } })),
    );

    // CSAT not tied to a ticket — post-delivery survey (Onboarding stage).
    const onboardingCsat = [5, 4, 5, 5, 4, 5, 3, 5, 4, 5];
    await Promise.all(
      newContacts
        .slice(0, onboardingCsat.length)
        .map((c, i) => tx.survey.create({ data: { tenantId: tenant.id, contactId: c.id, type: 'csat', score: onboardingCsat[i] } })),
    );

    // NPS — 14 promoters, 4 passives, 2 detractors → NPS ≈ +60.
    const npsScores = [10, 9, 10, 9, 9, 10, 10, 9, 10, 9, 10, 9, 10, 9, 8, 7, 8, 7, 4, 6];
    await Promise.all(
      newContacts
        .slice(0, npsScores.length)
        .map((c, i) => tx.survey.create({ data: { tenantId: tenant.id, contactId: c.id, type: 'nps', score: npsScores[i] } })),
    );

    // Proactive nudges — automation rules behind the Journey "nudges firing" panel.
    await tx.rule.createMany({
      data: NUDGE_RULES.map((r) => ({ tenantId: tenant.id, ...r })),
    });

    console.log(`Seeded ${newContacts.length} contacts, ${created} tickets, surveys and ${NUDGE_RULES.length} rules.`);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
