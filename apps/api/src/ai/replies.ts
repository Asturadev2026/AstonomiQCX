import type { Order } from '@aq/db';
import type { Lang } from './language';

/**
 * Every canned, non-LLM customer-facing reply, in both supported languages.
 *
 * These exist because the deterministic paths (refund eligibility, return tickets, order
 * tracking, greetings) deliberately never call the LLM — they answer from real DB rows in
 * milliseconds, and a wrong "yes you can refund that" is a real-money mistake. That speed is
 * why they can't just be translated on the fly, and it's why every string needs a Hindi twin
 * here instead.
 *
 * Hindi is written in Devanagari script, matching what the LLM now produces on the AI-answered
 * paths (see languageInstruction() in ./language.ts). Order refs, amounts and statuses stay
 * verbatim in both languages — customers read those off emails and SMS that are themselves
 * English.
 */

const pick = <T,>(lang: Lang, en: T, hi: T): T => (lang === 'hi' ? hi : en);

// ---------------------------------------------------------------- shared (AiService + flows)

export const trackAskForRef = (lang: Lang): string =>
  pick(
    lang,
    "I'd be happy to help track your order! Could you please share your order reference number (e.g. ZK-123)?",
    'मैं आपका ऑर्डर ट्रैक करने में खुशी से मदद करूँगा! क्या आप अपना ऑर्डर रेफरेंस नंबर भेज सकते हैं (जैसे ZK-123)?',
  );

export const nonDeliveryEscalated = (lang: Lang, orderRef: string, ticketRef: string): string =>
  pick(
    lang,
    `I'm sorry to hear that — order ${orderRef} shows as delivered but you haven't received it. I've raised escalation ticket ${ticketRef} for our logistics team to investigate immediately.`,
    `मुझे इसका खेद है — ऑर्डर ${orderRef} डिलीवर हुआ दिखा रहा है लेकिन आपको मिला नहीं। मैंने एस्केलेशन टिकट ${ticketRef} रेज़ कर दिया है, हमारी लॉजिस्टिक्स टीम तुरंत इसकी जांच करेगी।`,
  );

/** Shown when no AI provider key is configured at all — an infra state, not a customer answer,
 *  but still worth showing in the customer's own language rather than always-English. */
export const notConfigured = (lang: Lang): string =>
  pick(
    lang,
    "We're having a temporary issue — our team will follow up with you shortly.",
    'फिलहाल एक तकनीकी समस्या आ रही है — हमारी टीम जल्द ही आपसे संपर्क करेगी।',
  );

/** Generic escalation reply — used whenever the LLM/flow hands off to a human without a more
 *  specific templated reason (see nonDeliveryEscalated for the order-specific one). */
export const escalatedGeneric = (lang: Lang, ticketRef: string | null): string =>
  pick(
    lang,
    `I've raised this with our team (ref ${ticketRef}). They'll follow up with you shortly.`,
    `मैंने इसे हमारी टीम के पास भेज दिया है (रेफरेंस ${ticketRef})। वे जल्द ही आपसे संपर्क करेंगे।`,
  );

// ---------------------------------------------------------------- conversational

export const humanHandoff = (lang: Lang, ticketRef: string): string =>
  pick(
    lang,
    `Of course — I've raised ticket ${ticketRef} and one of our agents will contact you soon.`,
    `ज़रूर — मैंने टिकट ${ticketRef} रेज़ कर दिया है, हमारे एजेंट जल्दी ही आपसे संपर्क करेंगे।`,
  );

export const greeting = (lang: Lang): string =>
  pick(
    lang,
    "Hello! 👋 I'm Astra, your support assistant. I can help you track orders, check refund eligibility, arrange returns, or connect you with a human agent. What can I help you with?",
    'नमस्ते! 👋 मैं Astra हूँ, आपका सपोर्ट असिस्टेंट। मैं ऑर्डर ट्रैक करने, रिफंड एलिजिबिलिटी चेक करने, रिटर्न अरेंज करने, या आपको किसी एजेंट से कनेक्ट करने में मदद कर सकता हूँ। बताइए, मैं आपकी क्या मदद करूँ?',
  );

export const thanksReply = (lang: Lang): string =>
  pick(
    lang,
    "You're welcome! 😊 Is there anything else I can help you with?",
    'खुशी हुई मदद करके! 😊 क्या मैं आपकी किसी और चीज़ में मदद कर सकता हूँ?',
  );

export const farewell = (lang: Lang): string =>
  pick(
    lang,
    'Goodbye! 👋 Feel free to reach out anytime you need help. Have a great day!',
    'अलविदा! 👋 जब भी मदद चाहिए हो, बेझिझक संपर्क करें। आपका दिन शुभ हो!',
  );

export const acknowledgeMenu = (lang: Lang): string =>
  pick(
    lang,
    'Is there anything else I can help you with? I can assist with:\n\n📦 **Order tracking**\n💰 **Refund eligibility**\n↩️ **Returns**\n👤 **Connect to a human agent**\n\nJust let me know!',
    'क्या मैं आपकी किसी और चीज़ में मदद कर सकता हूँ? मैं इन चीज़ों में मदद कर सकता हूँ:\n\n📦 **ऑर्डर ट्रैकिंग**\n💰 **रिफंड एलिजिबिलिटी**\n↩️ **रिटर्न्स**\n👤 **किसी एजेंट से बात**\n\nबस बताइए!',
  );

// ---------------------------------------------------------------- refund

export const refundNoOrders = (lang: Lang): string =>
  pick(
    lang,
    "I don't see any orders on your account, so there's nothing to check for a refund. If you placed the order with a different phone number or email, let me know and I'll look again.",
    'आपके अकाउंट पर कोई ऑर्डर नहीं दिख रहा, इसलिए रिफंड के लिए चेक करने को कुछ नहीं है। अगर आपने किसी दूसरे फोन नंबर या ईमेल से ऑर्डर किया था, तो बताइए — मैं दोबारा देख लेता हूँ।',
  );

export const refundEligibleHeader = (lang: Lang, windowDays: number): string =>
  pick(
    lang,
    `These orders are eligible for a refund (delivered within the last ${windowDays} days):`,
    `ये ऑर्डर रिफंड के लिए एलिजिबल हैं (पिछले ${windowDays} दिन में डिलीवर हुए):`,
  );

export const refundNoneEligible = (lang: Lang): string =>
  pick(
    lang,
    'None of your recent orders are currently eligible for a refund.',
    'आपके हाल के ऑर्डर में से अभी कोई भी रिफंड के लिए एलिजिबल नहीं है।',
  );

export const refundNotEligibleHeader = (lang: Lang): string => pick(lang, 'Not eligible:', 'एलिजिबल नहीं:');

export const refundFooter = (lang: Lang): string =>
  pick(
    lang,
    'Reply with the order reference to start a refund on an eligible order.',
    'किसी एलिजिबल ऑर्डर पर रिफंड शुरू करने के लिए उसका ऑर्डर रेफरेंस भेजें।',
  );

/** Order.status is free-form; these two are the only statuses that permanently rule out a refund. */
export const ineligibleReason = (lang: Lang, order: Order, windowDays: number): string => {
  if (order.status === 'refunded') return pick(lang, 'already refunded', 'पहले ही रिफंड हो चुका है');
  if (order.status === 'cancelled') return pick(lang, 'order cancelled', 'ऑर्डर कैंसिल हो गया था');
  if (order.status !== 'delivered') {
    return pick(
      lang,
      `not yet delivered (currently ${order.status ?? 'unknown'})`,
      `अभी डिलीवर नहीं हुआ (फिलहाल ${order.status ?? 'unknown'})`,
    );
  }
  return pick(lang, `delivered more than ${windowDays} days ago`, `${windowDays} दिन से ज़्यादा पहले डिलीवर हुआ था`);
};

export const formatOrderLine = (order: Order, reason?: string): string => {
  const base = `- ${order.extRef ?? order.id}: "${order.description ?? 'item'}" — ₹${order.amount ?? '?'}`;
  return reason ? `${base} (${reason})` : base;
};

// ---------------------------------------------------------------- returns

export const returnNoneEligible = (lang: Lang): string =>
  pick(
    lang,
    "I don't see any delivered orders on your account that are eligible for a return. If you placed the order with a different phone number or email, let me know and I'll look again.",
    'आपके अकाउंट पर कोई डिलीवर ऑर्डर नहीं दिख रहा जो रिटर्न के लिए एलिजिबल हो। अगर आपने किसी दूसरे फोन नंबर या ईमेल से ऑर्डर किया था, तो बताइए — मैं दोबारा देख लेता हूँ।',
  );

export const returnWhichOne = (lang: Lang, count: number, refs: string): string =>
  pick(
    lang,
    `You have ${count} delivered orders eligible for return — ${refs}. Which one would you like to return?`,
    `आपके ${count} डिलीवर ऑर्डर रिटर्न के लिए एलिजिबल हैं — ${refs}. आप कौन-सा रिटर्न करना चाहते हैं?`,
  );

export const returnCreated = (lang: Lang, orderRef: string, description: string, ticketRef: string): string =>
  pick(
    lang,
    `Got it — I've raised a return request for ${orderRef} ("${description}"), ticket ${ticketRef}. One of our agents will contact you soon to arrange the pickup.`,
    `ठीक है — मैंने ${orderRef} ("${description}") के लिए रिटर्न रिक्वेस्ट रेज़ कर दी है, टिकट ${ticketRef}। पिकअप अरेंज करने के लिए हमारा एजेंट जल्दी आपसे संपर्क करेगा।`,
  );

// ---------------------------------------------------------------- tracking

const STATUS_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    in_transit: '🚚 In Transit — your order is on its way',
    delivered: '✅ Delivered',
    cancelled: '❌ Cancelled',
    processing: "⏳ Processing — we're preparing your order",
    shipped: '📦 Shipped — your order has left the warehouse',
    returned: '↩️ Returned',
    refunded: '💰 Refunded',
  },
  hi: {
    in_transit: '🚚 In Transit — आपका ऑर्डर रास्ते में है',
    delivered: '✅ डिलीवर हो चुका है',
    cancelled: '❌ कैंसिल हो गया था',
    processing: '⏳ Processing — हम आपका ऑर्डर तैयार कर रहे हैं',
    shipped: '📦 Shipped — ऑर्डर वेयरहाउस से निकल चुका है',
    returned: '↩️ रिटर्न हो चुका है',
    refunded: '💰 रिफंड हो चुका है',
  },
};

export const formatOrderCard = (lang: Lang, order: Order): string => {
  const ref = order.extRef ?? order.id;
  const desc = order.description ?? 'item';
  const status =
    STATUS_LABELS[lang][order.status ?? ''] ??
    pick(lang, `Status: ${order.status ?? 'unknown'}`, `Status: ${order.status ?? 'unknown'}`);
  const amount = order.amount ? `₹${order.amount}` : '';
  return `**${ref}** — "${desc}" ${amount}\n${status}`;
};

export const trackingStatusHeader = (lang: Lang): string =>
  pick(lang, "Here's the status of your order:", 'आपके ऑर्डर का स्टेटस यह है:');

export const trackingLatestHeader = (lang: Lang): string =>
  pick(lang, "Here's the latest on your order:", 'आपके ऑर्डर का लेटेस्ट अपडेट यह है:');

export const trackingWhichOne = (lang: Lang, count: number, refs: string): string =>
  pick(
    lang,
    `You have ${count} orders currently in transit — ${refs}. Which one would you like to check?`,
    `आपके ${count} ऑर्डर अभी ट्रांज़िट में हैं — ${refs}. आप कौन-सा चेक करना चाहते हैं?`,
  );
