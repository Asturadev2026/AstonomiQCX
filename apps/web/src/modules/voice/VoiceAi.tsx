import { useRef, useState } from 'react';
import type { SupportedLanguage } from '@aq/shared';
import { useAskAstra } from '../../lib/api/hooks';
import { useTestContact } from '../../state/testContact';
import { getActiveTenant } from '../../state/auth';
import { CustomerTestPanel } from '../../components/CustomerTestPanel';

/**
 * Voice AI — exact port of the prototype's #voice section (markup/classes
 * verbatim from docs/AstronomiQ-CX_1.html, styles from styles/prototype.css).
 * Scoped to "real STT/TTS as testable pieces" (Guide §10.5/§10.6) rather than
 * a live phone call — there's no Exotel telephony/streaming yet. Instead:
 * the browser mic records a turn → real Sarvam Saaras transcription → the
 * same real Astra brain as Chatbot/WhatsApp → real Sarvam Bulbul speech
 * played back (same SARVAM_API_KEY drives both STT and TTS).
 *
 * Until SARVAM_API_KEY is configured, this falls back to the browser's own
 * SpeechRecognition (STT) and speechSynthesis (TTS) — free, no keys, works on
 * your laptop's mic/speakers for client demos. `GET /voice/status` is
 * checked once per call to pick real vs. fallback per piece, so it switches
 * to Sarvam automatically once the key lands, with no code change needed.
 *
 * The prototype's second button is a decorative, non-functional "mute" — repurposed
 * here as a real "End call" control, since the main button already carries the
 * record/send toggle while a call is active.
 */
type TurnState = 'idle' | 'recording' | 'processing' | 'speaking';

interface Line {
  who: 'ai' | 'cus';
  text: string;
}

interface VoiceStatus {
  sttConfigured: boolean;
  ttsConfigured: boolean;
}

function tenantHeaders() {
  return { 'x-tenant': getActiveTenant() };
}

function getSpeechRecognitionCtor(): any {
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

function formatTimer(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

// Short acknowledgements/closings a caller says after Astra asks "anything
// else?" — these should end the call, not get sent to the LLM as a question.
const CLOSING_PHRASES = new Set([
  'no', 'nope', 'nothing', 'no thanks', 'no thank you', 'thats all', 'that is all',
  'im good', 'im done', 'thats it', 'no im good', 'bye', 'goodbye', 'ok', 'okay',
  'ok thanks', 'okay thanks', 'thank you', 'thanks', 'no thats all', 'nothing else',
  'thats okay', 'thats ok', 'all good', 'im all set', 'no more questions', 'that will be all',
]);

function isClosingPhrase(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  return CLOSING_PHRASES.has(normalized);
}

/** Sarvam's STT returns e.g. 'hi-IN' / 'en-IN' — map to the two languages Astra supports;
 *  anything else (or null, e.g. STT not configured) falls back to 'auto' so the LLM still
 *  mirrors the transcript's language instead of assuming English. */
function sarvamLanguage(code: string | null): SupportedLanguage {
  if (!code) return 'auto';
  const prefix = code.toLowerCase().slice(0, 2);
  if (prefix === 'hi') return 'hi';
  if (prefix === 'en') return 'en';
  return 'auto';
}

export function VoiceAi() {
  const [callActive, setCallActive] = useState(false);
  const [turnState, setTurnState] = useState<TurnState>('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [turns, setTurns] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [ticketRefs, setTicketRefs] = useState<string[]>([]);
  const { contact } = useTestContact();
  const ask = useAskAstra();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const statusRef = useRef<VoiceStatus>({ sttConfigured: false, ttsConfigured: false });
  const awaitingFollowUpRef = useRef(false);
  const callActiveRef = useRef(false);
  const emptyRetriesRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const streamCtrlRef = useRef<{ cancelled: boolean; audioCtx: AudioContext; sources: AudioBufferSourceNode[] } | null>(null);

  const startTimer = () => {
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const fetchVoiceStatus = async (): Promise<VoiceStatus> => {
    try {
      const res = await fetch('/api/v1/voice/status', { headers: tenantHeaders() });
      const status = (await res.json()).data as VoiceStatus;
      return status;
    } catch {
      return { sttConfigured: false, ttsConfigured: false };
    }
  };

  // --- Voice activity detection (auto-stop-on-silence for the real Sarvam path) ---
  // MediaRecorder has no built-in endpointing (unlike SpeechRecognition, which the browser
  // fallback path already gets for free) — without this, a real phone call would need a manual
  // click after every single sentence to say "I'm done talking", which isn't how a call works.
  // Watches mic volume via Web Audio's AnalyserNode and auto-sends once the caller has spoken
  // and then gone quiet for SILENCE_HOLD_MS, with a hard MAX_RECORD_MS ceiling as a backstop.
  const SILENCE_THRESHOLD = 0.02;
  const SILENCE_HOLD_MS = 700;
  const MAX_RECORD_MS = 15_000;

  const stopVoiceActivityDetection = () => {
    if (vadRafRef.current !== null) cancelAnimationFrame(vadRafRef.current);
    vadRafRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  const startVoiceActivityDetection = (stream: MediaStream, onSilence: () => void) => {
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    let hasSpoken = false;
    let silenceStartedAt: number | null = null;
    const recordingStartedAt = Date.now();

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const v = ((data[i] ?? 128) - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / data.length);

      if (rms > SILENCE_THRESHOLD) {
        hasSpoken = true;
        silenceStartedAt = null;
      } else if (hasSpoken) {
        if (silenceStartedAt === null) silenceStartedAt = Date.now();
        else if (Date.now() - silenceStartedAt > SILENCE_HOLD_MS) {
          onSilence();
          return;
        }
      }

      if (Date.now() - recordingStartedAt > MAX_RECORD_MS) {
        onSilence();
        return;
      }

      vadRafRef.current = requestAnimationFrame(tick);
    };
    vadRafRef.current = requestAnimationFrame(tick);
  };

  // --- Real Sarvam STT path (used once SARVAM_API_KEY is configured) ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.start();
      mediaRecorderRef.current = mr;
      setTurnState('recording');
      startVoiceActivityDetection(stream, () => void finishRecording());
    } catch {
      setNotice("Couldn't access your microphone — check browser permissions.");
    }
  };

  // Stops listening (manual click, or auto-triggered by silence) and sends the turn for
  // transcription. Idempotent against double-firing (e.g. VAD and a manual click racing).
  const finishRecording = async () => {
    stopVoiceActivityDetection();
    if (mediaRecorderRef.current?.state !== 'recording') return;
    setTurnState('processing');
    await stopRecordingAndTranscribe();
  };

  const stopRecordingAndTranscribe = async () => {
    const mr = mediaRecorderRef.current;
    const audioBlob = await new Promise<Blob>((resolve) => {
      if (!mr) return resolve(new Blob());
      mr.onstop = () => resolve(new Blob(chunksRef.current, { type: mr.mimeType }));
      mr.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    });

    const form = new FormData();
    form.append('file', audioBlob, 'turn.webm');
    const res = await fetch('/api/v1/voice/transcribe', { method: 'POST', headers: tenantHeaders(), body: form });
    const transcribed = (await res.json()).data as { transcript: string; languageCode: string | null; configured: boolean };
    if (!transcribed.configured) {
      setNotice("Speech-to-text isn't connected yet — add SARVAM_API_KEY to enable real transcription.");
      setTurnState('idle');
      return;
    }
    await handleTranscript(transcribed.transcript, sarvamLanguage(transcribed.languageCode));
  };

  // --- Browser fallback STT path (no keys needed) ---
  const startBrowserListening = async () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setNotice("This browser doesn't support voice recognition — try Chrome or Edge, or add SARVAM_API_KEY.");
      setTurnState('idle');
      return;
    }

    // Request mic permission explicitly first, the same way startRecording()
    // does for the real-Sarvam path. SpeechRecognition's own permission
    // prompt is easy to miss, and recognition.start() can throw synchronously
    // (e.g. permission already blocked) — without this check, either case
    // leaves the call silently stuck with zero feedback.
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
    } catch {
      setNotice("Couldn't access your microphone — check browser and OS microphone permissions for this site.");
      setTurnState('idle');
      return;
    }

    const recognition = new Ctor();
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    // Listen for interim results too, but only ever DISPATCH once (on the
    // first final result). Short utterances sometimes never get a final
    // result at all before the browser gives up and ends the session — in
    // that case we fall back to the last interim snapshot instead of
    // silently dropping the turn (this is what happened with "no thank you").
    recognition.interimResults = true;
    let dispatched = false;
    let lastTranscript = '';

    const dispatch = (transcript: string) => {
      if (dispatched) return;
      dispatched = true;
      emptyRetriesRef.current = 0;
      // Browser fallback (recognition.lang = 'en-IN') can't recognize Hindi at all — its
      // result is always English, so pass that explicitly rather than 'auto'.
      void handleTranscript(transcript, 'en');
    };

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      lastTranscript = result[0].transcript;
      if (result.isFinal) {
        recognition.stop();
        dispatch(lastTranscript);
      }
    };
    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setNotice(`Mic error: ${event.error}`);
      }
    };
    recognition.onend = () => {
      if (dispatched) return;
      if (lastTranscript.trim()) {
        dispatch(lastTranscript);
        return;
      }
      // Nothing was captured at all — very short words sometimes produce zero
      // speech events before the browser gives up. Don't strand the call in
      // idle; just listen again rather than requiring a manual click.
      if (!callActiveRef.current) {
        setTurnState('idle');
        return;
      }
      emptyRetriesRef.current += 1;
      if (emptyRetriesRef.current <= 3) {
        void startListening();
      } else {
        emptyRetriesRef.current = 0;
        setNotice("Didn't catch that — press the call button to try again.");
        setTurnState('idle');
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setTurnState('recording');
    } catch (err) {
      setNotice(`Couldn't start voice recognition: ${err instanceof Error ? err.message : String(err)}`);
      setTurnState('idle');
    }
  };

  const startListening = async () => {
    if (statusRef.current.sttConfigured) {
      await startRecording();
    } else {
      await startBrowserListening();
    }
  };

  const handleTranscript = async (transcript: string, language: SupportedLanguage = 'auto') => {
    if (!transcript.trim()) {
      setTurnState('idle');
      return;
    }

    // If Astra just asked "anything else?" and the caller's answer is a
    // short acknowledgement, end the call instead of sending "okay" to the
    // LLM as if it were a real question.
    if (awaitingFollowUpRef.current && isClosingPhrase(transcript)) {
      setLines((l) => [...l, { who: 'cus', text: transcript }]);
      setTurns((t) => t + 1);
      const goodbye = "Alright, thanks for calling — have a great day!";
      setLines((l) => [...l, { who: 'ai', text: goodbye }]);
      setTurnState('speaking');
      await speakReply(goodbye);
      endCall();
      return;
    }

    setTurnState('processing');
    setLines((l) => [...l, { who: 'cus', text: transcript }]);
    setTurns((t) => t + 1);

    const answer = await ask.mutateAsync({ question: transcript, channel: 'voice', contactId: contact?.id, language });
    let replyText: string;
    let shouldEndCall = false;
    if (!answer.configured) {
      replyText = answer.answer ?? "We're having a temporary issue — please try again shortly.";
      awaitingFollowUpRef.current = false;
    } else if (answer.closing) {
      // Agent Builder's own thanks/farewell intents (see flow-execution.service.ts) already
      // classified this as a genuine closing — not just a pause — and returned a complete,
      // Devanagari-safe closing reply from replies.ts. Speak it as-is: no bolted-on "anything
      // else?" (which would be a non-sequitur after a goodbye), and end the call rather than
      // re-arming the mic, mirroring what awaitingFollowUpRef already does for the "no" case below.
      replyText = answer.answer ?? '';
      awaitingFollowUpRef.current = false;
      shouldEndCall = true;
    } else if (answer.escalate) {
      replyText = `${answer.answer ?? ''} Is there anything else I can help you with?`;
      awaitingFollowUpRef.current = true;
      if (answer.ticketRef) setTicketRefs((t) => [...t, answer.ticketRef!]);
    } else if (answer.clarifying) {
      // This is Astra asking a clarifying question, not a completed answer —
      // the caller's next turn should answer it, not be treated as "done."
      replyText = answer.answer ?? '';
      awaitingFollowUpRef.current = false;
    } else {
      replyText = `${answer.answer ?? ''} Is there anything else I can help you with?`;
      awaitingFollowUpRef.current = true;
    }
    setLines((l) => [...l, { who: 'ai', text: replyText }]);

    setTurnState('speaking');
    await speakReply(replyText);
    if (shouldEndCall) {
      endCall();
    } else if (callActiveRef.current) {
      await startListening();
    }
  };

  // Both HTMLMediaElement's `onended` and SpeechSynthesisUtterance's `onend` are known to
  // sometimes never fire (blocked autoplay, a stuck synthesis queue, platform bugs) — without a
  // hard ceiling, a misfire leaves the whole call frozen forever inside `await speakReply(...)`,
  // which never lets the mic re-arm for the next turn. Estimate speech duration from text length
  // (~14 chars/sec) with a floor and a generous cap, and resolve regardless once that's elapsed.
  const estimateSpeechMs = (text: string): number => Math.min(20_000, Math.max(3_000, text.length * 70 + 2_000));

  function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      promise.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // --- Real Sarvam Bulbul TTS path — streaming (primary) ---
  // Plays raw PCM chunks as they arrive over HTTP chunked transfer instead of waiting for the
  // whole reply to finish generating (confirmed ~650ms-1.2s to first sound vs. several seconds
  // end-to-end for the buffered /synthesize call below). Scheduled back-to-back via the Web
  // Audio API so chunks play gaplessly as one continuous utterance.
  const playBackendSpeechStream = async (text: string): Promise<string | null> => {
    let res: Response;
    try {
      res = await fetch('/api/v1/voice/synthesize/stream', {
        method: 'POST',
        headers: { ...tenantHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      return `Couldn't reach the voice API: ${err instanceof Error ? err.message : String(err)}`;
    }
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null);
      return body?.error ?? `Sarvam TTS stream failed (HTTP ${res.status})`;
    }
    const sampleRate = Number(res.headers.get('X-Sample-Rate')) || 22050;

    const AudioCtxCtor = window.AudioContext ?? (window as any).webkitAudioContext;
    const audioCtx: AudioContext = new AudioCtxCtor({ sampleRate });
    const session = { cancelled: false, audioCtx, sources: [] as AudioBufferSourceNode[] };
    streamCtrlRef.current = session;

    let nextStartTime = audioCtx.currentTime;
    let scheduledAny = false;
    let leftoverByte: Uint8Array | null = null; // PCM16 needs byte pairs; a chunk can split one
    let lastEnded: Promise<void> = Promise.resolve();
    let playbackError: string | null = null;

    try {
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (session.cancelled) break;
        if (done) break;
        if (!value?.length) continue;

        let bytes = value;
        if (leftoverByte) {
          const merged = new Uint8Array(leftoverByte.length + bytes.length);
          merged.set(leftoverByte);
          merged.set(bytes, leftoverByte.length);
          bytes = merged;
          leftoverByte = null;
        }
        if (bytes.length % 2 !== 0) {
          leftoverByte = bytes.slice(bytes.length - 1);
          bytes = bytes.slice(0, bytes.length - 1);
        }
        if (!bytes.length) continue;

        const sampleCount = bytes.length / 2;
        // Copy into a fresh, aligned buffer — `bytes` may be a view with a non-2-byte-aligned
        // offset into the original chunk, which Int16Array's constructor requires.
        const aligned = new Uint8Array(bytes);
        const samples = new Int16Array(aligned.buffer);
        const audioBuffer = audioCtx.createBuffer(1, sampleCount, sampleRate);
        const channel = audioBuffer.getChannelData(0);
        for (let i = 0; i < sampleCount; i++) channel[i] = samples[i]! / 32768;

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        const startAt = Math.max(nextStartTime, audioCtx.currentTime);
        source.start(startAt);
        nextStartTime = startAt + audioBuffer.duration;
        session.sources.push(source);
        scheduledAny = true;
        lastEnded = new Promise((resolve) => {
          source.onended = () => resolve();
        });
      }
    } catch (err) {
      playbackError = `Streaming playback failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    if (!scheduledAny && !playbackError) {
      playbackError = 'Sarvam TTS stream returned no audio';
    }

    // Wait for the actual last-scheduled chunk to finish playing, not just for the network
    // stream to end (those two moments are different — playback trails the download). A
    // bounded backstop still exists in case `onended` itself misfires, same as the non-streaming
    // path, but the real completion signal here is the scheduled audio, not a text-length guess.
    if (!session.cancelled && scheduledAny) {
      const remainingMs = Math.max(0, (nextStartTime - audioCtx.currentTime) * 1000);
      await withTimeout(lastEnded, remainingMs + 4_000);
    }

    await audioCtx.close().catch(() => {});
    if (streamCtrlRef.current === session) streamCtrlRef.current = null;
    return session.cancelled ? null : playbackError;
  };

  // --- Real Sarvam Bulbul TTS path — buffered (fallback if streaming itself fails) ---
  // Returns null on success, or an error string describing what actually went wrong (Sarvam
  // auth/quota/request failure, vs. a network error, vs. local playback failing) so the caller
  // can show something more useful than a generic "TTS unavailable".
  const playBackendSpeechBuffered = async (text: string): Promise<string | null> => {
    let res: Response;
    try {
      res = await fetch('/api/v1/voice/synthesize', {
        method: 'POST',
        headers: { ...tenantHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      return `Couldn't reach the voice API: ${err instanceof Error ? err.message : String(err)}`;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return body?.error ?? `Sarvam TTS request failed (HTTP ${res.status})`;
    }
    const audioBlob = await res.blob();
    if (!audioBlob.size) return 'Sarvam TTS returned an empty audio response';

    const audioUrl = URL.createObjectURL(audioBlob);
    let playbackError: string | null = null;
    await withTimeout(
      new Promise<void>((resolve) => {
        const audioEl = new Audio(audioUrl);
        audioElRef.current = audioEl;
        audioEl.onended = () => resolve();
        audioEl.onerror = () => {
          playbackError = 'Browser could not decode/play the Sarvam audio';
          resolve();
        };
        audioEl.play().catch((err) => {
          playbackError = `Browser blocked audio playback: ${err instanceof Error ? err.message : String(err)}`;
          resolve();
        });
      }),
      estimateSpeechMs(text),
    );
    audioElRef.current = null;
    URL.revokeObjectURL(audioUrl);
    return playbackError;
  };

  // Same script check the backend uses to detect Hindi (apps/api/src/ai/language.ts).
  const DEVANAGARI_RE = /[ऀ-ॿ]/;

  // --- Browser fallback TTS path (no keys needed) ---
  const playBrowserSpeech = (text: string): Promise<void> =>
    withTimeout(
      new Promise<void>((resolve) => {
        if (!('speechSynthesis' in window) || !text.trim()) return resolve();
        // Clears any stuck utterance from a previous turn that never reported onend —
        // otherwise speak() can silently no-op against a wedged synthesis queue.
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        // Without an explicit lang, the browser uses its default (English) voice for
        // everything — it doesn't auto-detect script, so a Hindi reply gets silently
        // slurred/skipped while any trailing English text still reads out fine (which is
        // exactly what looked like "the Hindi part wasn't read"). Match the reply's own script.
        utterance.lang = DEVANAGARI_RE.test(text) ? 'hi-IN' : 'en-IN';
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      }),
      estimateSpeechMs(text),
    );

  const speakReply = async (text: string) => {
    if (statusRef.current.ttsConfigured) {
      let error = await playBackendSpeechStream(text);
      if (error) {
        // Streaming itself failed (not just "sounded bad") — fall back to the simpler
        // buffered call once before giving up on Sarvam entirely for this turn.
        error = await playBackendSpeechBuffered(text);
      }
      if (error) {
        // SARVAM_API_KEY IS set here (that's what ttsConfigured means) — a failure at this
        // point is a runtime problem (auth/quota/request/playback), not a missing key, so
        // surface the real reason instead of telling the user to add a key they already added.
        setNotice(`Sarvam voice unavailable (${error}) — playing your browser's voice instead.`);
        await playBrowserSpeech(text);
      }
    } else {
      await playBrowserSpeech(text);
    }
  };

  const handleCall = async () => {
    if (!callActive) {
      setEnded(false);
      setLines([]);
      setTurns(0);
      setNotice(null);
      setTicketRefs([]);
      setCallActive(true);
      callActiveRef.current = true;
      awaitingFollowUpRef.current = false;
      emptyRetriesRef.current = 0;
      startTimer();
      statusRef.current = await fetchVoiceStatus();
      // STT and TTS are both gated on the same SARVAM_API_KEY now (Bulbul handles TTS), so
      // in practice they're always configured together — the split check is kept only as a
      // safe fallback message if that ever changes (e.g. the key gets revoked mid-call-setup).
      const { sttConfigured, ttsConfigured } = statusRef.current;
      if (!sttConfigured && !ttsConfigured) {
        setNotice("Demo mode: using your browser's built-in mic and speaker — no SARVAM_API_KEY configured yet.");
      } else if (!ttsConfigured) {
        setNotice("Sarvam speech-to-text is live (Hindi and English). Replies play through your browser's speaker instead of Sarvam's voice.");
      } else if (!sttConfigured) {
        setNotice("Sarvam voice replies are live. Transcription uses your browser's recognizer, which is English-only.");
      }
      await startListening();
      return;
    }

    if (turnState === 'recording') {
      // Manual override — VAD normally auto-sends on silence, but this lets the caller force
      // an early send (or serves as the only way to send if VAD's threshold never trips).
      if (statusRef.current.sttConfigured) {
        await finishRecording();
      } else {
        recognitionRef.current?.stop();
      }
      return;
    }

    if (turnState === 'idle') {
      await startListening();
    }
  };

  const endCall = () => {
    stopTimer();
    stopVoiceActivityDetection();
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
    // Stop any in-flight Sarvam audio too — otherwise a reply keeps playing out loud after
    // the user has already hung up.
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    if (streamCtrlRef.current) {
      const session = streamCtrlRef.current;
      session.cancelled = true;
      session.sources.forEach((s) => {
        try {
          s.stop();
        } catch {
          // Already finished/stopped — fine.
        }
      });
      void session.audioCtx.close().catch(() => {});
      streamCtrlRef.current = null;
    }
    callActiveRef.current = false;
    setCallActive(false);
    setTurnState('idle');
    setEnded(true);
  };

  const orbRinging = callActive && (turnState === 'recording' || turnState === 'speaking');

  return (
    <div className="grid voice-grid">
      <div className="call-stage">
        <div className={`orb ${orbRinging ? 'ring' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
          </svg>
        </div>
        <div className="call-meta">
          <b>{callActive ? 'Live caller' : 'Astra Voice AI'}</b>
          <small>
            {!callActive && 'Ready to take a call · real STT/TTS, no live phone line yet'}
            {callActive && turnState === 'recording' && '🎙️ Listening — speak, then pause (or click to send now)'}
            {callActive && turnState === 'processing' && 'Astra is thinking…'}
            {callActive && turnState === 'speaking' && 'Astra is replying…'}
          </small>
        </div>
        <div className="call-timer">{formatTimer(seconds)}</div>
        <div className="transcript">
          {lines.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', margin: 'auto' }}>
              Press the call button, allow microphone access, and speak — Astra transcribes, answers, and replies
              with real synthesized speech.
            </div>
          )}
          {lines.map((l, i) => (
            <div key={i} className="tline">
              <span className={`who ${l.who}`}>{l.who === 'ai' ? 'Astra AI' : 'You'}</span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
        {notice && <div style={{ color: 'var(--muted)', fontSize: 11.5, textAlign: 'center', marginTop: 8 }}>{notice}</div>}
        <div className="call-ctrls">
          <button className="cctl mute" title="End call" onClick={endCall} disabled={!callActive}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <button
            className="cctl"
            id="callBtn"
            style={{ background: callActive ? 'var(--red)' : 'var(--green)' }}
            title={!callActive ? 'Start call' : turnState === 'recording' ? 'Send' : 'Busy'}
            disabled={callActive && turnState !== 'recording' && turnState !== 'idle'}
            onClick={handleCall}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
              <path d="M4 4h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 0-2z" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CustomerTestPanel />
      <div className="card">
        <div className="cop-h">
          <span className="spark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2l2 5 5 .5-4 3.5 1 5-4-2.5L8 16l1-5-4-3.5 5-.5z" />
            </svg>
          </span>
          AI Call Insights
        </div>
        <div className="cap" style={{ marginTop: 6 }}>
          Generated live as the call runs
        </div>
        {!ended && !callActive && (
          <div
            style={{
              minHeight: 340,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
              fontSize: 12.5,
              textAlign: 'center',
            }}
          >
            Insights will appear here once a call begins.
          </div>
        )}
        {callActive && (
          <div style={{ minHeight: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12.5, textAlign: 'center', width: '100%' }}>
            🎙️ Listening &amp; transcribing…
          </div>
        )}
        {ended && (
          <div style={{ width: '100%', textAlign: 'left' }}>
            <div className="cop-block" style={{ marginTop: 0 }}>
              <div className="lbl">Call summary</div>
              <div className="infoline">
                <span>Duration</span>
                <b>{formatTimer(seconds)}</b>
              </div>
              <div className="infoline">
                <span>Turns</span>
                <b>{turns}</b>
              </div>
            </div>
            {lines.some((l) => l.who === 'cus') && (
              <div className="cop-block">
                <div className="lbl">Topics discussed</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                  {lines
                    .filter((l) => l.who === 'cus')
                    .map((l, i) => (
                      <li key={i}>{l.text}</li>
                    ))}
                </ul>
              </div>
            )}
            {ticketRefs.length > 0 && (
              <div className="cop-block">
                <div className="lbl">Tickets raised</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>{ticketRefs.join(', ')}</div>
              </div>
            )}
            <div className="cop-block" style={{ marginBottom: 0 }}>
              <div className="lbl">Note</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                AI-generated sentiment, intent detection and QA scoring aren't built yet (Guide §10.7 — needs the
                background workers app). Topics/tickets above are real, measured data from this call.
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
