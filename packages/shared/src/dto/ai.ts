/** Guide §10.3 — asking Astra a question and getting back an answer or an escalation. */

export interface AskAstraDto {
  question: string;
  language?: string;
  /** Lets the reply style adapt — voice replies are short/spoken, no markdown. Defaults to 'chat'. */
  channel?: 'chat' | 'whatsapp' | 'voice';
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
}

/** Astra's tone/style, shared by every channel (Chatbot, WhatsApp, Voice) regardless of which Agent Builder flow is published. */
export type AiPersonaTone = 'friendly' | 'formal' | 'concise' | 'empathetic' | 'playful';

export interface AiPersonaDto {
  tone: AiPersonaTone;
  description: string;
}

export interface UpdateAiPersonaDto {
  tone: AiPersonaTone;
  description: string;
}
