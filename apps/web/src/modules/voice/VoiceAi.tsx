import { useRef, useState } from 'react';
import { useAskAstra } from '../../lib/api/hooks';

/**
 * Voice AI — exact port of the prototype's #voice section (markup/classes
 * verbatim from docs/AstronomiQ-CX_1.html, styles from styles/prototype.css).
 * Scoped to "real STT/TTS as testable pieces" (Guide §10.5/§10.6) rather than
 * a live phone call — there's no Exotel telephony/streaming yet. Instead:
 * the browser mic records a turn → real Sarvam transcription → the same
 * real Astra brain as Chatbot/WhatsApp → real ElevenLabs speech played back.
 *
 * Until SARVAM_API_KEY/ELEVENLABS_API_KEY are configured, this falls back to
 * the browser's own SpeechRecognition (STT) and speechSynthesis (TTS) — free,
 * no keys, works on your laptop's mic/speakers for client demos. `GET
 * /voice/status` is checked once per call to pick real vs. fallback per
 * piece, so it switches to Sarvam/ElevenLabs automatically once keys land,
 * with no code change needed.
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

const DEV_TENANT_HEADER = { 'x-tenant': 'shopnova' };

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

export function VoiceAi() {
  const [callActive, setCallActive] = useState(false);
  const [turnState, setTurnState] = useState<TurnState>('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [turns, setTurns] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [ticketRefs, setTicketRefs] = useState<string[]>([]);
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
      const res = await fetch('/api/v1/voice/status', { headers: DEV_TENANT_HEADER });
      const status = (await res.json()).data as VoiceStatus;
      return status;
    } catch {
      return { sttConfigured: false, ttsConfigured: false };
    }
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
    } catch {
      setNotice("Couldn't access your microphone — check browser permissions.");
    }
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
    const res = await fetch('/api/v1/voice/transcribe', { method: 'POST', headers: DEV_TENANT_HEADER, body: form });
    const transcribed = (await res.json()).data as { transcript: string; configured: boolean };
    if (!transcribed.configured) {
      setNotice("Speech-to-text isn't connected yet — add SARVAM_API_KEY to enable real transcription.");
      setTurnState('idle');
      return;
    }
    await handleTranscript(transcribed.transcript);
  };

  // --- Browser fallback STT path (no keys needed) ---
  const startBrowserListening = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setNotice("This browser doesn't support voice recognition — try Chrome or Edge, or add SARVAM_API_KEY.");
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
      void handleTranscript(transcript);
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
    recognition.start();
    setTurnState('recording');
  };

  const startListening = async () => {
    if (statusRef.current.sttConfigured) {
      await startRecording();
    } else {
      startBrowserListening();
    }
  };

  const handleTranscript = async (transcript: string) => {
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

    // Answering takes a couple of LLM round-trips (intent detection, then the
    // real reply) — speak a quick filler right away so the call doesn't just
    // go silent while that runs. Promise.all keeps them from talking over
    // each other: the real answer only gets spoken once the filler is done.
    const [, answer] = await Promise.all([
      speakReply('Let me check that for you.'),
      ask.mutateAsync({ question: transcript, channel: 'voice' }),
    ]);
    let replyText: string;
    if (!answer.configured) {
      replyText = "We're having a temporary issue — please try again shortly.";
      awaitingFollowUpRef.current = false;
    } else if (answer.escalate) {
      replyText = `I've raised this with our team (ref ${answer.ticketRef}). They'll follow up shortly. Is there anything else I can help you with?`;
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
    if (callActiveRef.current) await startListening();
  };

  // --- Real ElevenLabs TTS path ---
  const playBackendSpeech = async (text: string): Promise<boolean> => {
    const res = await fetch('/api/v1/voice/synthesize', {
      method: 'POST',
      headers: { ...DEV_TENANT_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return false;
    const audioUrl = URL.createObjectURL(await res.blob());
    await new Promise<void>((resolve) => {
      const audioEl = new Audio(audioUrl);
      audioEl.onended = () => resolve();
      void audioEl.play();
    });
    return true;
  };

  // --- Browser fallback TTS path (no keys needed) ---
  const playBrowserSpeech = (text: string): Promise<void> =>
    new Promise((resolve) => {
      if (!('speechSynthesis' in window) || !text.trim()) return resolve();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });

  const speakReply = async (text: string) => {
    if (statusRef.current.ttsConfigured) {
      const played = await playBackendSpeech(text);
      if (!played) {
        setNotice("Text-to-speech isn't connected yet — add ELEVENLABS_API_KEY to hear real replies.");
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
      if (!statusRef.current.sttConfigured || !statusRef.current.ttsConfigured) {
        setNotice('Demo mode: using your browser\'s built-in mic/speaker speech — no Sarvam/ElevenLabs key yet.');
      }
      await startListening();
      return;
    }

    if (turnState === 'recording') {
      if (statusRef.current.sttConfigured) {
        setTurnState('processing');
        await stopRecordingAndTranscribe();
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
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
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
            {callActive && turnState === 'recording' && '🎙️ Listening — click again to send'}
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
  );
}
