import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useConvHub, useCreateMentionTicket, useEscalateMention } from '../../lib/api/hooks';
import { useToast } from '../../components/Toast';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import type { MentionCard } from '../../lib/api/types';

/**
 * Conversation Hub — exact port of the prototype's #convhub section: social
 * mentions across Meta/LinkedIn/Google/X flowing through a detect → bot-reply
 * → escalate → ticket pipeline. The prototype fakes a new mention dropping in
 * every ~14s via setInterval — that's simulated liveness (Plan §10.3 rule 6),
 * so it's dropped; the 15s refetch on useConvHub is the real equivalent.
 */

type Group = 'all' | 'Meta' | 'LinkedIn' | 'Google' | 'X';

const FILTERS: { id: Group; label: string }[] = [
  { id: 'all', label: '🌐 All sources' },
  { id: 'Meta', label: '📘 Meta (FB / IG / WA)' },
  { id: 'LinkedIn', label: '💼 LinkedIn' },
  { id: 'Google', label: '🔍 Google' },
  { id: 'X', label: '✖️ X (Twitter)' },
];

const PLATFORM_META: Record<string, { label: string; color: string; icon: string }> = {
  facebook: { label: 'Facebook', color: '#1877F2', icon: '📘' },
  instagram: { label: 'Instagram', color: '#E1306C', icon: '📸' },
  whatsapp: { label: 'WhatsApp', color: '#25D366', icon: '💬' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2', icon: '💼' },
  google: { label: 'Google', color: '#EA4335', icon: '🔍' },
  x: { label: 'X', color: '#111827', icon: '✖️' },
};
const PIPE_LABELS: [string, string][] = [
  ['Detected', 'New mention'],
  ['Bot replied', 'Auto-response sent'],
  ['Escalated', 'To human agent'],
  ['Ticket raised', 'On the board'],
];
const STAGE_INDEX: Record<MentionCard['stage'], number> = { detected: 0, bot_replied: 1, escalated: 2, ticket: 3 };
const SENTIMENT_TAG_CLASS: Record<string, string> = { neg: 'esc', pos: 'res', neu: 'ai' };

function platMeta(source: string) {
  return PLATFORM_META[source] ?? { label: source, color: '#94A3B8', icon: '🌐' };
}

export function ConversationHub() {
  const [group, setGroup] = useState<Group>('all');
  const [openThreads, setOpenThreads] = useState<Set<string>>(new Set());
  const { data, isLoading, error, refetch } = useConvHub(group === 'all' ? undefined : group);
  const escalate = useEscalateMention();
  const createTicket = useCreateMentionTicket();
  const toast = useToast();

  const toggleThread = (id: string) =>
    setOpenThreads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  const { kpis, mentions } = data;

  return (
    <>
      <div className="grid kpis">
        <div className="card kpi">
          <div className="ic b-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 11h8M8 14h5" />
            </svg>
          </div>
          <div className="val">{kpis.mentionsThisWeek.toLocaleString('en-IN')}</div>
          <div className="lab">Mentions this week</div>
        </div>
        <div className="card kpi">
          <div className="ic b-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2 5 5 .5-4 3.5 1 5-4-2.5L8 16l1-5-4-3.5 5-.5z" />
            </svg>
          </div>
          <div className="val">{kpis.autoRepliedPct}%</div>
          <div className="lab">Auto-replied by bot</div>
        </div>
        <div className="card kpi">
          <div className="ic b-amber">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z" />
            </svg>
          </div>
          <div className="val">{kpis.escalatedCount}</div>
          <div className="lab">Escalated to agents</div>
        </div>
        <div className="card kpi">
          <div className="ic b-pink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="4" width="7" height="16" rx="1" />
              <rect x="14" y="4" width="7" height="10" rx="1" />
            </svg>
          </div>
          <div className="val">{kpis.ticketsCreatedCount}</div>
          <div className="lab">Tickets auto-created</div>
        </div>
      </div>

      <div style={{ margin: '18px 0 6px' }}>
        <h3 style={{ fontSize: 15 }}>Everything being said about your brand</h3>
        <div className="cap" style={{ margin: '2px 0 0' }}>
          Comments, reviews, DMs &amp; mentions from Meta, LinkedIn, Google, X — the bot replies, escalates tough
          ones, and raises a ticket.
        </div>
      </div>

      <div className="ch-filt">
        {FILTERS.map((f) => (
          <button key={f.id} className={group === f.id ? 'on' : ''} onClick={() => setGroup(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <div>
        {!mentions.length ? (
          <EmptyState label="No mentions on this source right now." />
        ) : (
          mentions.map((m) => {
            const meta = platMeta(m.source);
            const stageIndex = STAGE_INDEX[m.stage];
            return (
              <div className="conv-card" key={m.id}>
                <div className="cc-top">
                  <div className="cc-src" style={{ background: meta.color }}>
                    {meta.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="cc-name">{m.authorName}</span>
                      <span className="cc-plat" style={{ background: `${meta.color}18`, color: meta.color }}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="cc-handle">{m.authorHandle}</div>
                  </div>
                  <div className="cc-time">
                    {m.time} ago
                    <div style={{ marginTop: 4 }}>
                      {m.sentiment && <span className={`sent s-${m.sentiment}`} style={{ display: 'inline-block' }} />}
                    </div>
                  </div>
                </div>
                <div className="cc-body">{m.body}</div>
                {m.tags.length > 0 && (
                  <div className="cc-tags">
                    {m.tags.map((tag, i) => (
                      <span className={`tag ${m.sentiment ? SENTIMENT_TAG_CLASS[m.sentiment] : 'ai'}`} key={i}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="cc-pipe">
                  {PIPE_LABELS.map((p, i) => (
                    <div key={p[0]} style={{ display: 'flex', alignItems: 'center' }}>
                      {i > 0 && <span className="pipe-arrow">›</span>}
                      <div className={`pipe-step ${i < stageIndex ? 'done' : i === stageIndex ? 'active' : ''}`}>
                        {i < stageIndex ? '✓ ' : ''}
                        {p[0]}
                        <span className="pd">{p[1]}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {m.stage !== 'detected' && m.botReply && (
                  <div className="cc-reply">
                    <div className="rl">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13">
                        <path d="M12 2l2 5 5 .5-4 3.5 1 5-4-2.5L8 16l1-5-4-3.5 5-.5z" />
                      </svg>
                      Astra AI replied publicly
                    </div>
                    {m.botReply}
                  </div>
                )}
                <div className="cc-actions">
                  {stageIndex < 2 && (
                    <button
                      className="btn btn-o"
                      onClick={() =>
                        escalate.mutate(m.id, {
                          onSuccess: () => toast('Escalated to a human agent with full context ✓'),
                          onError: () => toast('Could not escalate this mention', 'error'),
                        })
                      }
                    >
                      ⚡ Escalate to agent
                    </button>
                  )}
                  {stageIndex < 3 && m.tough && (
                    <button
                      className="btn btn-g"
                      onClick={() =>
                        createTicket.mutate(m.id, {
                          onSuccess: (updated) => toast(`Ticket ${updated.ticketRef ?? ''} created & added to the board ✓`),
                          onError: () => toast('Could not create a ticket for this mention', 'error'),
                        })
                      }
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Create ticket
                    </button>
                  )}
                  {m.stage === 'ticket' && (
                    <span className="btn" style={{ background: 'var(--green-l)', color: 'var(--green)' }}>
                      ✓ Ticket {m.ticketRef} created
                    </span>
                  )}
                  <button className="btn btn-o" onClick={() => toggleThread(m.id)}>
                    {openThreads.has(m.id) ? 'Hide thread' : 'View thread'}
                  </button>
                </div>
                {openThreads.has(m.id) && (
                  <div className="msgs" style={{ marginTop: 12, padding: 16, background: 'var(--panel)', borderRadius: 12 }}>
                    <div className="m cust">
                      <span className="who">
                        {m.authorName} · {meta.label} · {m.time} ago
                      </span>
                      <div className="bub">{m.body}</div>
                    </div>
                    {m.botReply && (
                      <div className="m bot">
                        <span className="who">Astra AI · public reply</span>
                        <div className="bub">{m.botReply}</div>
                      </div>
                    )}
                    {stageIndex >= STAGE_INDEX.escalated && (
                      <div className="cap" style={{ textAlign: 'center' }}>
                        ⚡ Escalated to a human agent
                      </div>
                    )}
                    {m.stage === 'ticket' && (
                      <div className="cap" style={{ textAlign: 'center' }}>
                        🎫 Ticket {m.ticketRef} created — now on the{' '}
                        <Link to="/tickets" style={{ color: 'var(--blue)', fontWeight: 600 }}>
                          Tickets Board
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
