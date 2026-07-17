/** Guide §10.5/§10.6 — real STT/TTS as standalone pieces (no live call yet). */

export interface TranscribeResponseDto {
  transcript: string;
  languageCode: string | null;
  /** false when SARVAM_API_KEY isn't configured. */
  configured: boolean;
}
