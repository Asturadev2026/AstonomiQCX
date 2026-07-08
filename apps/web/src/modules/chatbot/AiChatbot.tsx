import { useEffect, useRef, useState } from 'react';
import { useAskAstra } from '../../lib/api/hooks';
import { useToast } from '../../components/Toast';

/**
 * AI Chatbot — exact port of the prototype's #chatbot section (markup and
 * classes verbatim from docs/AstronomiQ-CX_1.html, styles from
 * styles/prototype.css). Unlike the prototype's canned cbReply(), messages
 * go through the real backend (useAskAstra → POST /ai/ask → Astra's RAG
 * pipeline), so answers reflect the actual KB + AI provider state.
 */
const QUICK_REPLIES = [
  { label: '📦 Track my order', q: 'Where is my order?' },
  { label: '💰 Refund status', q: 'I want a refund' },
  { label: '↩️ Return an item', q: 'How do I return an item?' },
  { label: '🇮🇳 Hindi me help', q: 'Mera order kahan hai?' },
];

interface ChatMessage {
  from: 'bot' | 'user';
  text: string;
}

const WELCOME =
  "Namaste! 🙏 I'm Astra, ShopNova's AI assistant. I can help with orders, refunds, delivery and returns — in English or Hindi. How can I help you today?";

export function AiChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([{ from: 'bot', text: WELCOME }]);
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
    setMessages((m) => [...m, { from: 'user', text: msg }]);
    setInput('');

    ask.mutate(
      { question: msg },
      {
        onSuccess: (res) => {
          const reply = !res.configured
            ? "I'm not connected to an AI provider yet — ask your developer to add an API key."
            : res.escalate
              ? `I'm not sure how to help with that — I've raised ticket ${res.ticketRef} and a human agent will take it from here.`
              : res.answer ?? '';
          setMessages((m) => [...m, { from: 'bot', text: reply }]);
          if (res.escalate) {
            setTimeout(() => toast(`Ticket ${res.ticketRef} raised — handing off to a human agent ✓`), 400);
          }
        },
      },
    );
  };

  return (
    <div className="chatbot-demo">
      <div className="cb-frame">
        <div className="cb-top">
          <div className="bavatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} width={22}>
              <path d="M12 2l2 5 5 .5-4 3.5 1 5-4-2.5L8 16l1-5-4-3.5 5-.5z" />
            </svg>
          </div>
          <div>
            <b>Astra</b>
            <small>
              <span className="dot" /> AI Assistant · replies instantly
            </small>
          </div>
        </div>

        <div className="cb-body" ref={bodyRef}>
          {messages.map((m, i) => (
            <div key={i} className={`cb-m ${m.from}`}>
              {m.text}
            </div>
          ))}
          {ask.isPending && (
            <div className="typing">
              <i /> <i /> <i />
            </div>
          )}
        </div>

        <div className="cb-quick">
          {QUICK_REPLIES.map((qr) => (
            <button key={qr.q} onClick={() => send(qr.q)}>
              {qr.label}
            </button>
          ))}
        </div>

        <div className="cb-input">
          <input
            placeholder="Type your message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="send" onClick={() => send()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
      <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, marginTop: 14 }}>
        Try the quick replies or type an order query — Astra answers with live data and escalates to a human when
        needed.
      </p>
    </div>
  );
}
