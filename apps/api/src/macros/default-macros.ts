import type { CreateMacroDto } from '@aq/shared';

/** The prototype's demo macros — real seeded content, not placeholder text. */
export const DEFAULT_MACROS: CreateMacroDto[] = [
  {
    title: 'Order delay apology',
    category: 'Delivery',
    body: "Hi {name}, I'm sorry your order is delayed. It's now out for delivery and will reach you by {eta}. I've added ₹100 cashback for the wait.",
  },
  {
    title: 'Start a return',
    category: 'Returns',
    body: "No problem! I've started a free return for order {order}. Pickup is scheduled for {date}. Refund reaches you 3–4 days after pickup.",
  },
  {
    title: 'Refund status',
    category: 'Payments',
    body: 'Your refund of {amount} for order {order} was initiated on {date} and reflects in 2–3 working days. Reference: {ref}.',
  },
  {
    title: 'No-Cost EMI options',
    category: 'Payments',
    body: 'This item is eligible for No-Cost EMI on HDFC, ICICI & Axis cards — 3, 6 or 9 months. Shall I add it to your cart?',
  },
  {
    title: 'Damaged item — replacement',
    category: 'Returns',
    body: "So sorry about that! I've approved a free replacement for order {order} — no need to return the old one. It ships today.",
  },
  {
    title: 'Escalate to senior (Hindi)',
    category: 'Escalation',
    body: 'Aapki samasya important hai. Main ise apne senior agent ko de rahi hoon jo 30 minute me aapse baat karenge.',
  },
];
