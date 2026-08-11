import type { SupportedLanguage } from '@aq/shared';

/** The languages we can actually produce copy in. `SupportedLanguage` adds 'auto', which is a
 *  request to work it out — never a value we render with. */
export type Lang = 'en' | 'hi';

const DEVANAGARI_RE = /[ऀ-ॿ]/;

/**
 * Romanized-Hindi marker words. Two rules govern this list, and breaking either one causes
 * silent misclassification of ordinary English messages:
 *
 * 1. FUNCTION WORDS ONLY (pronouns, question words, verbs, auxiliaries). Nouns in Hinglish are
 *    usually English anyway — "mera ORDER kahan hai" — so nouns carry no signal.
 * 2. NOTHING THAT IS ALSO AN ENGLISH WORD. This is the trap: Hindi "hi" (also), "to"/"toh",
 *    "me"/"mein" (in), "the" (they were) and "he" are all real Hindi words AND common English
 *    ones. Including them would classify "hi there" or "the order" as Hindi. They are
 *    deliberately absent — do not add them back.
 */
const HINDI_MARKERS = new Set([
  // pronouns / possessives
  'mera', 'meri', 'mere', 'mujhe', 'muje', 'mujhko', 'hamara', 'hamari', 'hamein',
  'aap', 'aapka', 'aapki', 'aapke', 'aapko', 'tumhara', 'tumhe', 'tumko',
  'iska', 'uska', 'iski', 'uski', 'isko', 'usko', 'yeh', 'woh', 'vah',
  // question words
  'kahan', 'kaha', 'kab', 'kyun', 'kyu', 'kya', 'kaise', 'kaisa', 'kaisi',
  'kitna', 'kitne', 'kitni', 'kaun', 'kaunsa', 'konsa',
  // verbs / auxiliaries
  'hai', 'hain', 'tha', 'thi', 'hoga', 'hogi', 'honge', 'hua', 'hui',
  'raha', 'rahi', 'rahe', 'gaya', 'gayi', 'gaye', 'karna', 'karo', 'kare', 'kiya',
  'kijiye', 'dijiye', 'dena', 'diya', 'liya', 'milega', 'milegi', 'mila', 'mili',
  'chahiye', 'sakta', 'sakti', 'sakte', 'bhej', 'bhejo', 'bhejiye',
  'bataye', 'bataiye', 'batao', 'karenge', 'karunga',
  // common adverbs / discourse
  'nahi', 'nahin', 'haan', 'accha', 'acha', 'theek', 'thik', 'bilkul', 'abhi',
  'jaldi', 'kripya', 'dhanyavaad', 'dhanyawad', 'shukriya', 'namaste', 'namaskar', 'alvida',
  'wapas', 'vapas', 'paisa', 'paise', 'samasya', 'madad', 'zaroor', 'phir',
]);

/**
 * Best-effort language guess for a customer message, used ONLY to pick which canned template
 * to render. Anything that reaches the LLM uses `languageInstruction('auto')` instead, which is
 * more accurate than this heuristic — so a wrong guess here degrades a template, never a real
 * AI answer. Defaults to English on no signal, which keeps every existing English message on
 * exactly the path it took before.
 */
export function detectLanguage(text: string): Lang {
  if (DEVANAGARI_RE.test(text)) return 'hi';
  const words = text.toLowerCase().split(/[^a-z]+/);
  return words.some((w) => HINDI_MARKERS.has(w)) ? 'hi' : 'en';
}

/** An explicit 'en'/'hi' from the caller always wins; 'auto' falls back to detection. */
export function resolveLanguage(language: SupportedLanguage, text: string): Lang {
  return language === 'auto' ? detectLanguage(text) : language;
}

/**
 * English + Hindi only for now (see docs/AstronomiQ-CX-Multilingual-Sarvam-Exotel-Plan.md).
 * 'auto' — the default whenever a caller doesn't pass an explicit language — asks the model to
 * mirror the customer's own language rather than forcing English. Preferred over
 * detectLanguage() wherever an LLM is already in the loop, since the model reads the message
 * far better than a word list can.
 */
const DEVANAGARI_RULE =
  'IMPORTANT: this means the Devanagari script (उदाहरण के लिए: "आपका ऑर्डर डिलीवर हो चुका है"), never Roman/Latin ' +
  "letters. This applies even though the customer's own message may itself be typed in Roman letters (Hinglish, " +
  'e.g. "mera order kahan hai") — match their language, not their script. Do not reply in romanized Hindi under any circumstances.';

export function languageInstruction(language: SupportedLanguage): string {
  return language === 'auto'
    ? "Reply in the same language the customer's message is written in — only English or Hindi are supported right now; if it's a mix of both (Hinglish), reply in whichever is more prominent. " +
        `When replying in Hindi, write it in Devanagari script. ${DEVANAGARI_RULE}`
    : `Reply in ${language === 'hi' ? `Hindi, written in Devanagari script. ${DEVANAGARI_RULE}` : 'English'}.`;
}
