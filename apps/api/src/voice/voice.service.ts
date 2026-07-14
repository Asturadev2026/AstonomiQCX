import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

// ElevenLabs' long-standing premade "Rachel" voice — stable fallback if unset.
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

/** Thrown when the requested piece (STT or TTS) has no API key configured. */
export class VoiceNotConfiguredError extends Error {}

export interface TranscribeResult {
  transcript: string;
  languageCode: string | null;
  configured: true;
}

/**
 * Real STT (Sarvam) and TTS (ElevenLabs) as standalone, independently
 * testable pieces — Guide §10.5/§10.6, scoped down from a live phone call:
 * no Exotel telephony/streaming yet, that's a separate, much bigger piece.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  isSttConfigured(): boolean {
    return Boolean(env.SARVAM_API_KEY);
  }

  isTtsConfigured(): boolean {
    return Boolean(env.ELEVENLABS_API_KEY);
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

  /** ElevenLabs' text-to-speech endpoint. Returns raw MP3 bytes. */
  async synthesizeSpeech(text: string): Promise<Buffer> {
    if (!this.isTtsConfigured()) {
      throw new VoiceNotConfiguredError('ELEVENLABS_API_KEY is not configured');
    }

    const voiceId = env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
    });
    if (!res.ok) {
      throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
