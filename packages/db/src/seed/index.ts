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
// straight from a groupBy. Real body content (not placeholders): Omni Inbox's co-pilot
// falls back to quoting these when no LLM suggestion is available, so they're user-visible.
const PORTAL_KB_ARTICLES: { category: string; title: string; body: string }[] = [
  { category: 'Orders & delivery', title: 'How to track your order', body: 'Every order gets a tracking link by SMS and email once it ships. You can also find it anytime under Order History on the app or website.' },
  { category: 'Orders & delivery', title: 'What does "out for delivery" mean?', body: 'The courier has picked up your package for final delivery and it should arrive the same day, usually by 6-9 PM depending on your area.' },
  { category: 'Orders & delivery', title: 'Delivery is late — what now?', body: "If your order is delayed beyond the estimated date, share the order reference and we'll check with the courier and update you within 24 hours." },
  { category: 'Orders & delivery', title: 'Can I change my delivery address?', body: 'The delivery address can be changed only before the order is shipped. Once it shows "out for delivery" the address is locked for that trip.' },
  { category: 'Orders & delivery', title: 'Same-day delivery eligibility', body: 'Same-day delivery is available on select pin codes for orders placed before 12 PM — eligibility shows automatically at checkout.' },
  { category: 'Orders & delivery', title: 'Tracking shows no updates', body: "A tracking page can lag a few hours behind the courier's actual scan events. If it hasn't moved in over 24 hours, contact support with the order reference." },
  { category: 'Orders & delivery', title: 'Order marked delivered but not received', body: 'Check with neighbours or your building security first — couriers sometimes hand off to them. If it truly is missing, report it within 48 hours for a replacement or refund.' },
  { category: 'Orders & delivery', title: 'Scheduling a delivery slot', body: 'Some categories let you pick a delivery slot at checkout. For existing orders, contact support to request a preferred time window with the courier.' },
  { category: 'Returns & refunds', title: 'How to start a return', body: 'Start a return from Order History by selecting "Return item" within 30 days of delivery — pickup is free and no reason code is required.' },
  { category: 'Returns & refunds', title: 'Refund timelines by payment method', body: 'Refunds to UPI/cards take 3-4 business days after pickup; refunds to store wallet are instant once the return is received.' },
  { category: 'Returns & refunds', title: 'Return pickup not scheduled', body: "If a pickup hasn't been scheduled within 48 hours of requesting a return, share the order reference so we can raise it with the logistics partner directly." },
  { category: 'Returns & refunds', title: 'Exchanging a product for a different size', body: 'Size exchanges are free within 30 days — select "Exchange" instead of "Return" and the replacement ships once the original is picked up.' },
  { category: 'Returns & refunds', title: 'Items not eligible for return', body: 'Innerwear, perishables, and items marked non-returnable at purchase cannot be returned once delivered, per the listing terms.' },
  { category: 'Returns & refunds', title: 'Refund stuck — how to check status', body: 'Refund status is visible under Order History → Refunds. If it shows "processed" for more than 7 business days, contact support with the order reference.' },
  { category: 'Payments & EMI', title: 'Available EMI options', body: 'No-Cost EMI is available over 3, 6 or 9 months on major bank credit cards for orders above ₹3,000 — shown automatically at checkout.' },
  { category: 'Payments & EMI', title: 'Payment failed but amount deducted', body: 'If a payment fails after the amount is deducted, banks auto-reverse it within 5-7 business days. Share the transaction ID if it takes longer.' },
  { category: 'Payments & EMI', title: 'Applying a coupon code at checkout', body: 'Enter the coupon in the "Apply coupon" field before placing the order — it cannot be applied afterward, and each code works once per account.' },
  { category: 'Payments & EMI', title: 'Adding a new payment method', body: 'New cards, UPI IDs and wallets can be added from Account → Payment methods, or directly at checkout during any purchase.' },
  { category: 'Payments & EMI', title: 'Understanding your invoice', body: 'GST invoices are emailed automatically after dispatch and are also downloadable from Order History for every item.' },
  { category: 'Account & app', title: 'Resetting your password', body: 'Use "Forgot password" on the login screen — a reset link is sent to your registered email and expires after 30 minutes.' },
  { category: 'Account & app', title: 'OTP not received', body: 'Login OTPs are valid for 5 minutes. If one does not arrive, confirm your number is correct, wait 60 seconds, then use "Resend OTP".' },
  { category: 'Account & app', title: 'Updating your profile details', body: 'Name, email and address can be updated anytime under Account → Profile. Mobile number changes require OTP verification on the new number.' },
  { category: 'Account & app', title: 'App keeps crashing on checkout', body: 'Try updating to the latest app version and clearing the app cache first — this resolves most checkout crashes. Persisting issues should be reported with the device model.' },
  { category: 'Account & app', title: 'Deleting your account', body: 'Account deletion can be requested from Account → Privacy — it is processed within 7 days and cannot be reversed once confirmed.' },
  { category: 'Warranty & repair', title: 'Registering your product warranty', body: 'Warranty registers automatically against your order — no separate form needed. Coverage starts from the delivery date.' },
  { category: 'Warranty & repair', title: 'Booking a repair visit', body: 'Repair visits can be booked from Order History → Get help → Book repair. A technician typically visits within 3-5 business days.' },
  { category: 'Warranty & repair', title: 'Warranty claim rejected — next steps', body: 'If a claim is rejected, request the inspection report — most rejections are due to physical/liquid damage not covered by the standard warranty.' },
  { category: 'Warranty & repair', title: 'Extending your warranty (AMC)', body: 'Extended warranty (AMC) can be purchased within 30 days of delivery from the product page or Order History for eligible categories.' },
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

// 25 customer names for the extra-contacts loop below — distinct from AGENT_USERS
// (Kavya Menon, Aditya Nair, Priya Sharma, Meera Joshi, Rahul Verma) so Omni Inbox
// doesn't show the same name as both a customer and an agent.
const CONTACT_NAMES = [
  'Rohan Mehta', 'Ananya Iyer', 'Sneha Reddy', 'Vikram Singh', 'Arjun Patel',
  'Kavya Nair', 'Deepak Rao', 'Fatima Khan', 'Karan Malhotra', 'Neha Joshi',
  'Rahul Gupta', 'Pooja Nair', 'Amit Kumar', 'Divya Menon', 'Sameer Khan',
  'Kavita Rao', 'Vivek Shah', 'Anjali Desai', 'Manish Tiwari', 'Ritu Bansal',
  'Suresh Pillai', 'Meera Iyengar', 'Nikhil Chopra', 'Shreya Kapoor', 'Ishaan Bhatt',
];
// One city per contact above (same index) — Omni Inbox's co-pilot "Customer snapshot" shows this.
const CONTACT_CITIES = [
  'Pune', 'Chennai', 'Hyderabad', 'Jaipur', 'Ahmedabad',
  'Kochi', 'Mumbai', 'Delhi', 'Bengaluru', 'Kolkata',
  'Lucknow', 'Kochi', 'Indore', 'Kochi', 'Hyderabad',
  'Nagpur', 'Ahmedabad', 'Surat', 'Bhopal', 'Chandigarh',
  'Kochi', 'Bengaluru', 'Pune', 'Jaipur', 'Chennai',
];

// Realistic customer message / support reply pairs per intent — replaces flat
// "Customer message"/"Agent response" placeholders so Omni Inbox threads read
// like the prototype instead of lorem-ipsum stand-ins.
const INTENT_MESSAGES: Record<string, { customer: string[]; reply: string[] }> = {
  order_tracking: {
    customer: [
      'Hi, where is my order? It was due yesterday 😟',
      "Can you check my order status? No update in 2 days.",
    ],
    reply: [
      "Let me check that right away — your order is out for delivery and should reach you by 6 PM today. 🛵",
      "I can see your order is in transit and on schedule. You'll get an SMS the moment it's out for delivery.",
    ],
  },
  refund: {
    customer: [
      'I returned my item over a week ago but the refund is still not received.',
      'When will I get my refund for the returned product?',
    ],
    reply: [
      "I can see your refund was initiated a few days ago — it typically clears in 5-7 working days. I've raised a priority trace.",
      'Your refund has been processed and should reflect in your account within 3-4 business days. 💰',
    ],
  },
  delivery_delay: {
    customer: [
      'This is the third time my delivery has been delayed. Very disappointed.',
      'My order was supposed to arrive yesterday, still no sign of it.',
    ],
    reply: [
      "I'm really sorry for the delay — I've escalated this for priority dispatch and added a goodwill credit to your account.",
      'I understand the frustration. Checking with our courier partner now and will update you within the hour.',
    ],
  },
  product_enquiry: {
    customer: [
      'Does this come with a warranty? Also, is cash on delivery available?',
      'Can you tell me more about the return policy for this product?',
    ],
    reply: [
      'Yes, this comes with a 1-year manufacturer warranty and COD is available at checkout.',
      'You can return this within 30 days of delivery, no questions asked — free pickup included. 👗',
    ],
  },
  emi_payment: {
    customer: [
      'Can I pay in EMI for this? What are the options?',
      'Is No-Cost EMI available on this purchase?',
    ],
    reply: [
      'Yes! This is eligible for No-Cost EMI over 3, 6 or 9 months on major bank cards. 📺',
      "Absolutely — I've added No-Cost EMI options to your cart. Want me to share the payment link?",
    ],
  },
};

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

// Social listening — Conversation Hub mentions behind the "mentions" nav badge.
const MENTION_SEED = [
  { source: 'google', author: 'Deepak Rao', body: 'Ordered a fridge, delivery is 5 days late and no update. Very poor service.', sentiment: 'neg', tough: true },
  { source: 'instagram', author: 'ananya.styles', body: 'Loving my new ShopNova kurta set 😍 delivery was super fast!', sentiment: 'pos', tough: false },
  { source: 'facebook', author: 'Vikram Singh', body: 'DM about a damaged product on arrival — need a replacement.', sentiment: 'neg', tough: true },
  { source: 'x', author: '@arjunp', body: 'ShopNova EMI options are actually pretty good, just set mine up.', sentiment: 'pos', tough: false },
  { source: 'linkedin', author: 'Fatima Khan', body: 'Great experience returning a product, refund was quick.', sentiment: 'pos', tough: false },
  { source: 'whatsapp', author: 'Rohan Mehta', body: 'Group broadcast reply — asking about the Diwali sale dates.', sentiment: 'neu', tough: false },
  { source: 'google', author: 'Sneha Reddy', body: '3-star review — product fine but packaging was damaged.', sentiment: 'neu', tough: false },
  { source: 'instagram', author: 'karan.malhotra', body: 'Commented asking if cash on delivery is available.', sentiment: 'neu', tough: false },
];
const MENTION_STAGE_POOL = weighted<string>([['detected', 3], ['bot_replied', 4], ['escalated', 2], ['ticket', 2]]);

// Agent live status behind the Topbar "agents live" pill and Nav "agentsLive" count.
const AGENT_STATUS_POOL = weighted<string>([['available', 3], ['on_call', 1], ['on_break', 1], ['offline', 1]]);
// Resolution-SLA windows (minutes) cycled across fresh tickets — 2 to 6 hours.
const SLA_RESOLUTION_MINS = [120, 180, 240, 360];

// Topbar bell — notification kinds mirror Escalation/SLA events above.
const NOTIFICATION_TEMPLATES = [
  { kind: 'ticket.assigned', body: 'A new ticket was assigned to you' },
  { kind: 'sla.breach', body: 'A ticket you own is close to breaching its SLA' },
  { kind: 'mention.tough', body: 'A tough social mention needs a human reply' },
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
    // Repeat buyers (15-24) double as the "Gold loyalty members" campaign audience; a
    // cross-tier slice (10-19) is tagged as "festive_shopper" for the Festive shoppers audience.
    const newContacts = [];
    for (let i = 0; i < 25; i++) {
      const name = CONTACT_NAMES[i % CONTACT_NAMES.length]!;
      const emailSlug = name.toLowerCase().replace(/\s+/g, '.');
      newContacts.push(
        await tx.contact.create({
          data: {
            tenantId: tenant.id,
            name,
            phone: `9${(700000000 + i).toString()}`,
            email: `${emailSlug}@example.com`,
            location: CONTACT_CITIES[i % CONTACT_CITIES.length],
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

    // Agents behind Auto QA's leaderboard, the AI-vs-human split below, and ticket
    // assignment — created before tickets so tickets can actually reference them
    // (moved up from after the ticket loop). The lead (index 0) is excluded from
    // the assignment rotation.
    const agentUsers = await Promise.all(
      AGENT_USERS.map((u) => tx.user.create({ data: { tenantId: tenant.id, ...u } })),
    );
    const rotationAgents = agentUsers.slice(1);

    // Tickets across the 5 friction categories, mostly resolved. Non-resolved ones
    // cycle across new/in_progress/waiting so the Tickets Board's 4 kanban columns
    // aren't lopsided, and ~60% get a real assignee so the board shows agent avatars.
    const NON_RESOLVED_STATUSES = ['new', 'in_progress', 'waiting'] as const;
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
            status: isResolved ? 'resolved' : NON_RESOLVED_STATUSES[created % NON_RESOLVED_STATUSES.length],
            assignedUserId: created % 5 < 3 ? rotationAgents[created % rotationAgents.length]!.id : null,
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
        const intent = CONV_INTENTS[convIndex % CONV_INTENTS.length]!;
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
        const msgTpl = INTENT_MESSAGES[intent] ?? INTENT_MESSAGES.order_tracking!;
        messages.push(
          {
            tenantId: tenant.id,
            conversationId: id,
            senderType: 'customer',
            body: msgTpl.customer[convIndex % msgTpl.customer.length],
            createdAt,
          },
          {
            tenantId: tenant.id,
            conversationId: id,
            senderType: isAi ? 'bot' : 'agent',
            senderId: assignedUserId,
            body: msgTpl.reply[convIndex % msgTpl.reply.length],
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
        body: a.body,
        status: 'published',
      })),
    });

    console.log(
      `Seeded ${newContacts.length} contacts, ${created} tickets, ${KB_ARTICLES.length + PORTAL_KB_ARTICLES.length} KB articles, ` +
        `${agentUsers.length} agents, ${conversations.length} conversations, ${qaAudits.length} QA audits, surveys and ${NUDGE_RULES.length} rules.`,
    );
  });

  // Command Centre (Guide §10, Overview endpoint) reads rolling 24h/48h windows off
  // `now`, unlike the 14-day historical batch above (dated relative to whenever this
  // script last ran). Kept in its own block. Each piece is guarded independently —
  // NOT by one combined check — so e.g. agent status/mentions/notifications still
  // get seeded even on a run where the historical batch alone already covers the
  // last-48h conversation window (a single combined guard previously skipped all of
  // them together, leaving agentsLive/mentions/unreadNotifications stuck at zero).
  await withTenant(prisma, tenant.id, async (tx) => {
    const contacts = await tx.contact.findMany({ select: { id: true } });
    const allUsers = await tx.user.findMany();
    const agents = allUsers.filter((u) => u.title !== 'Team Lead');
    if (!contacts.length || !agents.length) {
      console.log('No contacts/agents yet for the live window — run the main seed block first.');
      return;
    }

    await Promise.all(
      allUsers.map((u, i) =>
        tx.agentStatusRow.upsert({
          where: { tenantId_userId: { tenantId: tenant.id, userId: u.id } },
          update: {},
          create: { tenantId: tenant.id, userId: u.id, status: AGENT_STATUS_POOL[i % AGENT_STATUS_POOL.length]! },
        }),
      ),
    );
    console.log(`Refreshed ${allUsers.length} agent status rows.`);

    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
    // Gated on OPEN conversations specifically, not total volume — the 14-day historical
    // batch above resolves almost everything by design (it feeds Analytics/QA "resolved"
    // metrics), so Omni Inbox (which only lists non-resolved threads) would otherwise be
    // left with the 1-2 stragglers that batch happens to leave open.
    const freshOpenCount = await tx.conversation.count({
      where: { createdAt: { gte: since48h }, status: { not: 'resolved' } },
    });
    let freshTickets: { id: string; resolved: boolean; assignedUserId: string | null; createdAt: Date }[] = [];
    let escalationTargets: typeof freshTickets = [];
    let freshConvCount = 0;

    if (freshOpenCount >= 15) {
      console.log('Rolling conversation window already fresh — skipping fresh conversations.');
    } else {
    const FRESH_TOTAL = 70;
    const freshConversations: any[] = [];
    const freshMessages: any[] = [];
    const freshTicketSeeds: { convId: string; contactId?: string; assignedUserId: string | null; createdAt: Date; resolved: boolean; intent: string }[] = [];
    for (let i = 0; i < FRESH_TOTAL; i++) {
      const createdAt = new Date(Date.now() - randInt(0, 47) * 60 * 60 * 1000 - randInt(0, 59) * 60_000);
      const isAi = i % 10 < 7; // ~70% AI-resolved, matching the prototype's resolution mix
      const isOpen = i % 10 >= 8; // ~20% still in progress — enough for a lively Omni Inbox list
      const contact = contacts[i % contacts.length];
      const assignedUserId = isAi ? null : agents[i % agents.length]!.id;
      const handleMins = isAi ? randInt(2, 8) : randInt(6, 22);
      const updatedAt = isOpen ? createdAt : new Date(createdAt.getTime() + handleMins * 60_000);
      const id = randomUUID();
      const channel = CONV_CHANNELS[i % CONV_CHANNELS.length];
      const intent = CONV_INTENTS[i % CONV_INTENTS.length]!;

      freshConversations.push({
        id,
        tenantId: tenant.id,
        contactId: contact?.id,
        channel,
        status: isOpen ? 'open' : 'resolved',
        sentiment: CONV_SENTIMENTS[i % CONV_SENTIMENTS.length],
        intent,
        language: CONV_LANGUAGES[i % CONV_LANGUAGES.length],
        assignedUserId,
        createdAt,
        updatedAt,
      });

      const responseSecs = isAi ? randInt(5, 40) : randInt(45, 420);
      const msgTpl = INTENT_MESSAGES[intent] ?? INTENT_MESSAGES.order_tracking!;
      freshMessages.push(
        {
          tenantId: tenant.id,
          conversationId: id,
          senderType: 'customer',
          body: msgTpl.customer[i % msgTpl.customer.length],
          createdAt,
        },
        {
          tenantId: tenant.id,
          conversationId: id,
          senderType: isAi ? 'bot' : 'agent',
          senderId: assignedUserId,
          body: msgTpl.reply[i % msgTpl.reply.length],
          createdAt: new Date(createdAt.getTime() + responseSecs * 1000),
        },
      );

      // ~1 in 5 conversations escalates into a ticket — enough for live SLA events/escalations.
      // Ticket assignment is decided independently of the conversation's own assignedUserId
      // (a human can still be assigned to follow up even when Astra AI resolved the chat) —
      // using seed.assignedUserId directly here would always be null, since i%5===0 (ticket
      // eligibility) implies i%10<7 (isAi) for every multiple of 5, so no ticket would ever
      // get a real assignee.
      if (i % 5 === 0) {
        const ticketAssignedUserId = i % 3 === 0 ? null : agents[i % agents.length]!.id;
        freshTicketSeeds.push({ convId: id, contactId: contact?.id, assignedUserId: ticketAssignedUserId, createdAt, resolved: !isOpen, intent });
      }
    }
    await tx.conversation.createMany({ data: freshConversations });
    await tx.message.createMany({ data: freshMessages });
    freshConvCount = freshConversations.length;

    const csatPool = weighted<number>([[5, 5], [4, 4], [3, 1]]);
    await Promise.all(
      freshConversations
        .filter((_c, i) => i % 4 === 0)
        .map((c, i) =>
          tx.survey.create({
            data: {
              tenantId: tenant.id,
              contactId: c.contactId,
              type: 'csat',
              score: csatPool[i % csatPool.length],
              channel: CHANNELS[i % CHANNELS.length],
              createdAt: c.createdAt,
            },
          }),
        ),
    );

    const NON_RESOLVED_TICKET_STATUSES = ['new', 'in_progress', 'waiting'] as const;
    for (let ti = 0; ti < freshTicketSeeds.length; ti++) {
      const seed = freshTicketSeeds[ti]!;
      const priority = seed.resolved ? 'p3' : ['p1', 'p2'][randInt(0, 1)]!;
      const ticket = await tx.ticket.create({
        data: {
          tenantId: tenant.id,
          extRef: await nextRef(tx, tenant.id, 'AQ-T-'),
          contactId: seed.contactId,
          subject: INTENT_LABELS[seed.intent] ?? 'Support query',
          category: INTENT_LABELS[seed.intent],
          priority,
          status: seed.resolved ? 'resolved' : NON_RESOLVED_TICKET_STATUSES[ti % NON_RESOLVED_TICKET_STATUSES.length],
          assignedUserId: seed.assignedUserId,
          createdAt: seed.createdAt,
        },
      });
      freshTickets.push({ id: ticket.id, resolved: seed.resolved, assignedUserId: seed.assignedUserId, createdAt: seed.createdAt });
    }

    // Resolution SLA events — a few open tickets get a near-term/overdue target so
    // nav's "at risk" badge has something real to count (no minute-sweep worker exists
    // yet to keep `breached` live, per Guide §15 — Nav/Analytics compute risk from targetAt).
    await tx.slaEvent.createMany({
      data: freshTickets.map((t, i) => {
        const resolutionMins = SLA_RESOLUTION_MINS[i % SLA_RESOLUTION_MINS.length]!;
        const targetAt = t.resolved
          ? new Date(t.createdAt.getTime() + resolutionMins * 60_000)
          : i % 3 === 0
            ? new Date(Date.now() + randInt(-10, 25) * 60_000) // at risk / already overdue
            : new Date(t.createdAt.getTime() + resolutionMins * 60_000);
        return {
          tenantId: tenant.id,
          ticketId: t.id,
          kind: 'resolution',
          targetAt,
          metAt: t.resolved ? new Date(t.createdAt.getTime() + randInt(20, resolutionMins - 10) * 60_000) : null,
          breached: false,
        };
      }),
    });

    // Escalate ~1 in 3 fresh tickets to a different agent than the one assigned.
    escalationTargets = freshTickets.filter((_t, i) => i % 3 === 0);
    for (const t of escalationTargets) {
      const toAgent = agents.find((a) => a.id !== t.assignedUserId) ?? agents[0]!;
      await tx.escalation.create({
        data: {
          tenantId: tenant.id,
          ticketId: t.id,
          level: 1,
          escalatedToUserId: toAgent.id,
          reason: 'No response within SLA window',
          createdAt: new Date(t.createdAt.getTime() + randInt(5, 30) * 60_000),
        },
      });
    }
    console.log(`Seeded ${freshConvCount} fresh conversations, ${freshTickets.length} tickets, ${escalationTargets.length} escalations.`);
    }

    const mentionCount = await tx.socialMention.count();
    if (mentionCount > 0) {
      console.log('Social mentions already seeded — skipping.');
    } else {
      // Conversation Hub — social mentions behind the "mentions" nav badge.
      await tx.socialMention.createMany({
        data: MENTION_SEED.map((m, i) => {
          const stage = MENTION_STAGE_POOL[i % MENTION_STAGE_POOL.length]!;
          return {
            tenantId: tenant.id,
            source: m.source,
            authorName: m.author,
            body: m.body,
            sentiment: m.sentiment,
            tough: m.tough,
            stage,
            botReply: stage === 'detected' ? null : 'Thanks for reaching out — our team is looking into this right away.',
            ticketId: stage === 'ticket' ? freshTickets[i % freshTickets.length]?.id : undefined,
            createdAt: new Date(Date.now() - randInt(0, 47) * 60 * 60 * 1000),
          };
        }),
      });
      console.log(`Seeded ${MENTION_SEED.length} social mentions.`);
    }

    const notificationCount = await tx.notification.count();
    if (notificationCount > 0) {
      console.log('Notifications already seeded — skipping.');
    } else {
      // Topbar bell — a handful of read/unread notifications per agent.
      const notifications: any[] = [];
      for (const u of allUsers) {
        for (let i = 0; i < 4; i++) {
          const tpl = NOTIFICATION_TEMPLATES[i % NOTIFICATION_TEMPLATES.length]!;
          const createdAt = new Date(Date.now() - randInt(0, 71) * 60 * 60 * 1000);
          notifications.push({
            tenantId: tenant.id,
            userId: u.id,
            kind: tpl.kind,
            body: tpl.body,
            readAt: i % 2 === 0 ? null : createdAt,
            createdAt,
          });
        }
      }
      await tx.notification.createMany({ data: notifications });
      console.log(`Seeded ${notifications.length} notifications.`);
    }
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
