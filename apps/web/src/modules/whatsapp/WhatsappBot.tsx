import { useEffect, useRef, useState } from 'react';
import { useAskAstra } from '../../lib/api/hooks';
import { useToast } from '../../components/Toast';

/**
 * WhatsApp Bot — exact port of the prototype's #whatsapp section (markup and
 * classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). Like AiChatbot, replaces the prototype's canned
 * waReply()/waFlow() with the real backend (useAskAstra → POST /ai/ask —
 * the same Astra brain that answers on every channel, Guide §10.4). This
 * widget previews what a customer sees on their own phone; the real Meta
 * webhook integration (apps/api/src/whatsapp/) is a separate, independently
 * testable path — see the WhatsApp Bot testing guide.
 */
const QUICK_REPLIES = [
  { key: 'track', label: '1️⃣ Track my order', q: 'Where is my order?' },
  { key: 'refund', label: '2️⃣ Refund / return', q: 'I want a refund' },
  { key: 'talk', label: '3️⃣ Talk to an agent', q: 'I want to talk to a human agent' },
];

interface WaMessage {
  dir: 'in' | 'out';
  text: string;
  time: string;
}

function nowLabel(): string {
  const n = new Date();
  const h = n.getHours() % 12 || 12;
  const m = String(n.getMinutes()).padStart(2, '0');
  return `${h}:${m} ${n.getHours() < 12 ? 'AM' : 'PM'}`;
}

export function WhatsappBot() {
  const [messages, setMessages] = useState<WaMessage[]>([
    { dir: 'in', text: 'Namaste 👋 Welcome to ShopNova on WhatsApp! Reply with a number:', time: nowLabel() },
  ]);
  const [showFlow, setShowFlow] = useState(true);
  const [input, setInput] = useState('');
  const ask = useAskAstra();
  const toast = useToast();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, ask.isPending]);

  const send = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || ask.isPending) return;
    setMessages((m) => [...m, { dir: 'out', text: msg, time: nowLabel() }]);
    setInput('');
    setShowFlow(false);

    ask.mutate(
      { question: msg },
      {
        onSuccess: (res) => {
          const reply = !res.configured
            ? "We're having a temporary issue — please try again shortly."
            : res.escalate
              ? `Thanks — I've raised this with our team (ref ${res.ticketRef}). They'll follow up on WhatsApp shortly.`
              : res.answer ?? '';
          setMessages((m) => [...m, { dir: 'in', text: reply, time: nowLabel() }]);
          if (res.escalate) {
            setTimeout(() => toast(`Ticket ${res.ticketRef} raised — escalated to a human agent on WhatsApp ✓`), 400);
          }
        },
      },
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
      <div className="wa-frame">
        <div className="wa-top">
          <div className="wav">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} width={20}>
              <path d="M12 2l2 5 5 .5-4 3.5 1 5-4-2.5L8 16l1-5-4-3.5 5-.5z" />
            </svg>
          </div>
          <div>
            <b>ShopNova</b>
            <small>● Business · replies instantly</small>
          </div>
        </div>

        <div className="wa-body" ref={bodyRef}>
          {messages.map((m, i) => (
            <div key={i} className={`wa-m ${m.dir}`}>
              {m.text}
              {i === 0 && showFlow && (
                <div className="wa-flow">
                  {QUICK_REPLIES.map((qr) => (
                    <button key={qr.key} onClick={() => send(qr.q)}>
                      {qr.label}
                    </button>
                  ))}
                </div>
              )}
              <span className="tk">
                {m.time}
                {m.dir === 'out' && <span className="ck"> ✓✓</span>}
              </span>
            </div>
          ))}
          {ask.isPending && (
            <div className="typing">
              <i /> <i /> <i />
            </div>
          )}
        </div>

        <div className="wa-input">
          <input
            placeholder="Type a message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="snd" onClick={() => send()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={20}>
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Why WhatsApp first?</h3>
        <div className="cap">Built for the Indian market</div>
        <div className="infoline">
          <span>Daily WhatsApp users (India)</span>
          <b>500M+</b>
        </div>
        <div className="infoline">
          <span>ShopNova queries on WhatsApp</span>
          <b>46%</b>
        </div>
        <div className="infoline">
          <span>Auto-resolved without agent</span>
          <b style={{ color: 'var(--green)' }}>87%</b>
        </div>
        <div className="infoline">
          <span>Languages supported</span>
          <b>English, हिन्दी +9</b>
        </div>
        <div
          style={{
            marginTop: 14,
            padding: 12,
            background: 'var(--blue-l)',
            border: '1px solid var(--blue-t)',
            borderRadius: 11,
            fontSize: 12,
            lineHeight: 1.6,
            color: 'var(--muted)',
          }}
        >
          Astra handles tracking, refunds and returns end-to-end using WhatsApp Flows, and hands off to a human with
          full context when the customer types <b style={{ color: 'var(--text)' }}>3</b>.
        </div>
      </div>
    </div>
  );
}
