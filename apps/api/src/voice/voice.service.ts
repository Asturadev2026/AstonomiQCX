import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

// Same script check ai/language.ts uses to detect a Devanagari reply — the chatbot already
// guarantees Hindi answers are written in Devanagari (see language.ts's languageInstruction()),
// so this is enough to pick the right Sarvam voice without re-detecting language from scratch.
const DEVANAGARI_RE = /[ऀ-ॿ]/;

// Raw PCM sample rate used for streaming TTS — one of Sarvam's supported rates (8000-48000),
// chosen as a reasonable balance of audio quality vs. chunk size for browser playback.
export const STREAM_SAMPLE_RATE = 22050;

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

  /**
   * Sarvam's saaras:v3 model — verified current as of July 2026. `language_code: 'unknown'`
   * makes Saaras run its own per-turn language identification (confirmed empirically: it
   * correctly told apart real English vs. Hindi test audio either way, with or without this
   * param — this just makes that auto-detect the explicit, documented behavior rather than
   * relying on an implicit default). This is what lets a caller switch between Hindi, English,
   * and Hinglish from one turn to the next without picking a language up front.
   */
  async transcribeAudio(buffer: Buffer, filename: string, mimeType: string): Promise<TranscribeResult> {
    if (!this.isSttConfigured()) {
      throw new VoiceNotConfiguredError('SARVAM_API_KEY is not configured');
    }

    const form = new FormData();
    form.append('model', 'saaras:v3');
    form.append('mode', 'transcribe');
    form.append('language_code', 'unknown');
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

  /**
   * Streaming variant over Sarvam's Bulbul WebSocket API — cuts "AI reply ready" → "first
   * audible sound" from several seconds (the full-file REST call above has to finish
   * synthesizing and transferring the *entire* reply before any of it can play) down to
   * roughly half a second (confirmed empirically: ~650ms to the first chunk in testing,
   * vs. several seconds end-to-end for the non-streaming path on the same text).
   *
   * Yields raw linear16 (16-bit signed PCM, mono, STREAM_SAMPLE_RATE) chunks as Sarvam
   * generates them, so the caller can start playing audio from the first chunk instead of
   * waiting for the whole reply. Bridges the WebSocket's callback-based events into an
   * async generator with a small pull queue, since Node's WebSocket isn't itself iterable.
   */
  async *synthesizeSpeechStream(text: string): AsyncGenerator<Buffer> {
    if (!this.isTtsConfigured()) {
      throw new VoiceNotConfiguredError('SARVAM_API_KEY is not configured');
    }

    const languageCode = DEVANAGARI_RE.test(text) ? 'hi-IN' : 'en-IN';
    const queue: Buffer[] = [];
    let waiter: (() => void) | null = null;
    let finished = false;
    let streamError: Error | null = null;

    const wake = () => {
      if (waiter) {
        const resolve = waiter;
        waiter = null;
        resolve();
      }
    };

    const ws = new WebSocket(
      `wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3&send_completion_event=true`,
      // Node's native WebSocket accepts a headers option here even though it's not part of
      // the WHATWG browser spec — confirmed empirically (the Api-Subscription-Key header is
      // genuinely required and does authenticate the connection).
      { headers: { 'Api-Subscription-Key': env.SARVAM_API_KEY! } } as ConstructorParameters<typeof WebSocket>[1],
    );

    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          type: 'config',
          data: {
            language_code: languageCode,
            model: 'bulbul:v3',
            output_audio_codec: 'linear16',
            speech_sample_rate: String(STREAM_SAMPLE_RATE),
          },
        }),
      );
      ws.send(JSON.stringify({ type: 'text', data: { text } }));
      ws.send(JSON.stringify({ type: 'flush' }));
    });

    ws.addEventListener('message', (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === 'audio') {
          queue.push(Buffer.from(msg.data.audio, 'base64'));
          wake();
        } else if (msg.type === 'event' && msg.data?.event_type === 'final') {
          finished = true;
          wake();
          ws.close();
        } else if (msg.type === 'error') {
          streamError = new Error(`Sarvam TTS stream error: ${msg.data?.message ?? 'unknown error'}`);
          finished = true;
          wake();
        }
      } catch {
        // Not a frame we understand — ignore rather than tear down the whole stream over it.
      }
    });

    ws.addEventListener('error', () => {
      streamError ??= new Error('Sarvam TTS WebSocket connection failed');
      finished = true;
      wake();
    });

    ws.addEventListener('close', () => {
      finished = true;
      wake();
    });

    try {
      while (true) {
        while (queue.length > 0) {
          yield queue.shift()!;
        }
        if (finished) break;
        await new Promise<void>((resolve) => {
          waiter = resolve;
        });
      }
    } finally {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }

    if (streamError) {
      throw streamError;
    }
  }
}
