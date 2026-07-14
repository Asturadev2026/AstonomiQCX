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
 * The prototype's second button is a decorative, non-functional "mute" — repurposed
 * here as a real "End call" control, since the main button already carries the
 * record/send toggle while a call is active.
 */
type TurnState = 'idle' | 'recording' | 'processing' | 'speaking';

interface Line {
  who: 'ai' | 'cus';
  text: string;
}

const DEV_TENANT_HEADER = { 'x-tenant': 'shopnova' };

function formatTimer(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

export function VoiceAi() {
  const [callActive, setCallActive] = useState(false);
  const [turnState, setTurnState] = useState<TurnState>('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [turns, setTurns] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const ask = useAskAstra();

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startTimer = () => {
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

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

  const stopRecording = (): Promise<Blob> =>
    new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr) return resolve(new Blob());
      mr.onstop = () => resolve(new Blob(chunksRef.current, { type: mr.mimeType }));
      mr.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    });

  const handleCall = async () => {
    if (!callActive) {
      setEnded(false);
      setLines([]);
      setTurns(0);
      setCallActive(true);
      startTimer();
      await startRecording();
      return;
    }

    if (turnState === 'recording') {
      setTurnState('processing');
      const audioBlob = await stopRecording();

      const form = new FormData();
      form.append('file', audioBlob, 'turn.webm');
      const transcribeRes = await fetch('/api/v1/voice/transcribe', {
        method: 'POST',
        headers: DEV_TENANT_HEADER,
        body: form,
      });
      const transcribed = (await transcribeRes.json()).data as {
        transcript: string;
        configured: boolean;
      };

      if (!transcribed.configured) {
        setNotice("Speech-to-text isn't connected yet — add SARVAM_API_KEY to enable real transcription.");
        setTurnState('idle');
        return;
      }
      if (!transcribed.transcript.trim()) {
        setTurnState('idle');
        return;
      }

      setLines((l) => [...l, { who: 'cus', text: transcribed.transcript }]);
      setTurns((t) => t + 1);

      const answer = await ask.mutateAsync({ question: transcribed.transcript });
      const replyText = !answer.configured
        ? "We're having a temporary issue — please try again shortly."
        : answer.escalate
          ? `I've raised this with our team (ref ${answer.ticketRef}). They'll follow up shortly.`
          : answer.answer ?? '';
      setLines((l) => [...l, { who: 'ai', text: replyText }]);

      setTurnState('speaking');
      const synthRes = await fetch('/api/v1/voice/synthesize', {
        method: 'POST',
        headers: { ...DEV_TENANT_HEADER, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText }),
      });
      if (synthRes.ok) {
        const audioUrl = URL.createObjectURL(await synthRes.blob());
        const audioEl = new Audio(audioUrl);
        audioEl.onended = () => void startRecording();
        await audioEl.play();
      } else {
        setNotice("Text-to-speech isn't connected yet — add ELEVENLABS_API_KEY to hear real replies.");
        await startRecording();
      }
      return;
    }
  };

  const endCall = () => {
    stopTimer();
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
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
            {callActive && turnState === 'processing' && 'Transcribing…'}
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
            <div className="cop-block" style={{ marginBottom: 0 }}>
              <div className="lbl">Note</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                AI-generated sentiment, intent detection and QA scoring aren't built yet (Guide §10.7 — needs the
                background workers app). This panel shows only real, measured data.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
