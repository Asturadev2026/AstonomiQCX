/** Guide §10.3 — asking Astra a question and getting back an answer or an escalation. */

export interface AskAstraDto {
  question: string;
  language?: string;
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
}
