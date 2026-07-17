/**
 * Voice replies are read aloud by TTS, not read on screen — the same
 * KB-grounded prompt used for Chatbot/WhatsApp produces markdown/bullet
 * answers that sound broken when spoken ("asterisk asterisk..."). This
 * gives the LLM a channel-specific style instruction and, as a safety net,
 * strips any markdown that slips through anyway before it's spoken.
 */
export const VOICE_STYLE_INSTRUCTION =
  'This is a live phone call — the customer hears your reply read aloud, they do not read it. ' +
  'Reply in at most 2-3 short, natural spoken sentences, the way a person would talk on a call. ' +
  'Never use markdown, asterisks, bullet points, numbered lists, or headings. If you need to give steps, ' +
  'say them as a spoken sequence ("First... then... finally...") instead of a list.';

export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
