/** Guide §10.3 — asking Astra a question and getting back an answer or an escalation. */

/** English + Hindi only for now (Multilingual/Sarvam/Exotel plan) — 'auto' (the default) asks
 *  the LLM to mirror whichever language the customer's message is written in; pass 'en'/'hi'
 *  explicitly when the caller already knows it for certain (e.g. Sarvam's STT language code
 *  for a voice turn). */
export type SupportedLanguage = 'en' | 'hi' | 'auto';

export interface AskAstraDto {
  question: string;
  language?: SupportedLanguage;
  /** Lets the reply style adapt — voice replies are short/spoken, no markdown. Defaults to 'chat'. */
  channel?: 'chat' | 'whatsapp' | 'voice';
  /** "Test as this customer" — lets a published flow's order lookup use their real data. */
  contactId?: string;
}

export interface AstraAnswerDto {
  answer: string | null;
  escalate: boolean;
  /** false when no AI provider key is configured — the UI shows a setup notice instead of chatting. */
  configured: boolean;
  /** titles of the KB articles Astra searched, so the UI can show what it looked at. */
  sources: string[];
  /** the human-friendly ticket number raised on escalation (Guide §10.4), null otherwise. */
  ticketRef: string | null;
  /** true when `answer` is Agent Builder's ask_question clarifying prompt, not a completed answer. */
  clarifying?: boolean;
  /** true when `answer` is a genuine closing reply (Agent Builder's thanks/farewell intents) — the
   *  customer is done, not just pausing. Voice can end the call instead of re-arming the mic;
   *  chat/WhatsApp can skip appending a further "anything else?" prompt. */
  closing?: boolean;
  /** IDs of the flow's nodes actually executed for this reply, in order — lets Agent Builder's Test panel highlight the real path on the canvas. Other callers can ignore it. */
  visitedNodeIds?: string[];
}
