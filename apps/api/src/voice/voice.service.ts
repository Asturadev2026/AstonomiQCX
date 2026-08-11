import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

// Same script check ai/language.ts uses to detect a Devanagari reply — the chatbot already
// guarantees Hindi answers are written in Devanagari (see language.ts's languageInstruction()),
// so this is enough to pick the right Sarvam voice without re-detecting language from scratch.
const DEVANAGARI_RE = /[ऀ-ॿ]/;

/** Thrown when the requested piece (STT or TTS) has no API key configured. */
export class VoiceNotConfiguredError extends Error {}

export interface TranscribeResult {
  transcript: string;
  languageCode: string | null;
  configured: true;
}

/**
 * Real STT and TTS (both Sarvam) as standalone, independently testable
 * pieces — Guide §10.5/§10.6, scoped down from a live phone call: no Exotel
 * telephony/streaming yet, that's a separate, much bigger piece.
 *
 * TTS previously used ElevenLabs, but its free-plan API access is blocked for library voices
 * (402 paid_plan_required) and it had no reliable way to speak Devanagari. Sarvam's Bulbul
 * model natively supports the same Indic languages Saaras transcribes, under the one
 * SARVAM_API_KEY already in use for STT — no second provider/key to manage.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  isSttConfigured(): boolean {
    return Boolean(env.SARVAM_API_KEY);
  }

  isTtsConfigured(): boolean {
    return Boolean(env.SARVAM_API_KEY);
  }

  /** Sarvam's saaras:v3 model — verified current as of July 2026. */
  async transcribeAudio(buffer: Buffer, filename: string, mimeType: string): Promise<TranscribeResult> {
    if (!this.isSttConfigured()) {
      throw new VoiceNotConfiguredError('SARVAM_API_KEY is not configured');
    }

    const form = new FormData();
    form.append('model', 'saaras:v3');
    form.append('mode', 'transcribe');
    form.append('file', new Blob([buffer], { type: mimeType }), filename);

    const res = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: { 'api-subscription-key': env.SARVAM_API_KEY! },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`Sarvam STT failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { transcript: string; language_code?: string };
    return { transcript: data.transcript, languageCode: data.language_code ?? null, configured: true };
  }

  /**
   * Sarvam's Bulbul v3 text-to-speech model. Picks hi-IN/en-IN purely from the reply's own
   * script — the chatbot's answer is used verbatim (see ai/replies.ts and ai.service.ts),
   * never re-translated or regenerated here. Returns raw MP3 bytes (browser-playable directly).
   */
  async synthesizeSpeech(text: string): Promise<Buffer> {
    if (!this.isTtsConfigured()) {
      throw new VoiceNotConfiguredError('SARVAM_API_KEY is not configured');
    }

    const languageCode = DEVANAGARI_RE.test(text) ? 'hi-IN' : 'en-IN';
    const res = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: { 'api-subscription-key': env.SARVAM_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        language_code: languageCode,
        model: 'bulbul:v3',
        output_audio_codec: 'mp3',
      }),
    });
    if (!res.ok) {
      throw new Error(`Sarvam TTS failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { audios?: string[] };
    const audioBase64 = data.audios?.[0];
    if (!audioBase64) {
      throw new Error('Sarvam TTS returned no audio data');
    }
    return Buffer.from(audioBase64, 'base64');
  }
}
