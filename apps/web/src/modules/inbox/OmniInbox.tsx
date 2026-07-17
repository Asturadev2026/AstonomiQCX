import { useEffect, useState } from 'react';
import {
  useAssignToMe,
  useConversations,
  useConversationThread,
  useResolveConversation,
  useSendReply,
} from '../../lib/api/hooks';
import { useToast } from '../../components/Toast';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';

/**
 * Omni Inbox — exact port of the prototype's #inbox section (3-pane:
 * conversation list, thread, AI co-pilot). Plan §10.2 porting example.
 * "Next best action" is rule-based off real intent/sentiment/order data
 * (conversations.service.ts), not the prototype's fixed literal text.
 */

type ChannelFilter = 'all' | 'whatsapp' | 'chat' | 'email' | 'voice' | 'instagram';

const CHANNEL_META: Record<string, { label: string; color: string; icon: string }> = {
  whatsapp: { label: 'WhatsApp', color: '#25D366', icon: '💬' },
  chat: { label: 'Live Chat', color: '#2563EB', icon: '💭' },
  email: { label: 'Email', color: '#0EA5E9', icon: '✉️' },
  voice: { label: 'Voice', color: '#E08A00', icon: '📞' },
  instagram: { label: 'Instagram', color: '#DB2777', icon: '📸' },
  facebook: { label: 'Facebook', color: '#1877F2', icon: '📘' },
  x: { label: 'X', color: '#111827', icon: '✖️' },
};
const FILTERS: { id: ChannelFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'chat', label: 'Chat' },
  { id: 'email', label: 'Email' },
  { id: 'voice', label: 'Voice' },
  { id: 'instagram', label: 'Instagram' },
];
const SENTIMENT_LABEL: Record<string, string> = { pos: 'Positive', neu: 'Neutral', neg: 'Negative — needs care' };
const SENTIMENT_COLOR: Record<string, string> = { pos: 'var(--green)', neu: 'var(--amber)', neg: 'var(--pink)' };
const ROLE_NAME: Record<string, string> = { bot: 'Astra AI', agent: 'You' };

function chanMeta(channel: string) {
  return CHANNEL_META[channel] ?? { label: channel, color: '#94A3B8', icon: '💬' };
}

export function OmniInbox() {
  const [filter, setFilter] = useState<ChannelFilter>('all');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [replyText, setReplyText] = useState('');
  const toast = useToast();

  const { data: conversations, isLoading, error, refetch } = useConversations(filter === 'all' ? undefined : filter);
  const { data: thread, isLoading: threadLoading } = useConversationThread(selectedId);
  const sendReply = useSendReply(selectedId ?? '');
  const assignToMe = useAssignToMe(selectedId ?? '');
  const resolve = useResolveConversation(selectedId ?? '');

  // Mirrors the prototype's `openConv(1)` — default to the first thread in the list.
  useEffect(() => {
    if (!conversations?.length) return;
    if (selectedId && conversations.some((c) => c.id === selectedId)) return;
    setSelectedId(conversations[0]!.id);
  }, [conversations, selectedId]);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} retry={() => void refetch()} />;

  const handleSend = () => {
    const text = replyText.trim();
    if (!text || !selectedId) return;
    sendReply.mutate(text, {
      onSuccess: () => {
        setReplyText('');
        toast('Reply sent ✓');
      },
      onError: () => toast('Could not send reply — sign in required until auth is wired', 'error'),
    });
  };

  return (
    <div className="inbox">
      <div className="conv-list">
        <div className="filt">
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div>
          {!conversations?.length ? (
            <EmptyState label="No open conversations right now." />
          ) : (
            conversations.map((c) => {
              const meta = chanMeta(c.channel);
              return (
                <div
                  key={c.id}
                  className={`conv ${selectedId === c.id ? 'on' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="cav" style={{ background: c.avatarColor }}>
                    {c.initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="top">
                      <span className="nm">{c.contactName}</span>
                      <span className="tm">{c.time}</span>
                    </div>
                    <div className="pv">{c.preview}</div>
                    <div className="meta">
                      <span className="chan-badge" style={{ background: `${meta.color}22`, color: meta.color }}>
                        {meta.icon} {meta.label}
                      </span>
                      {c.sentiment && <span className={`sent s-${c.sentiment}`} />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="thread">
        {!selectedId || threadLoading ? (
          <LoadingState />
        ) : !thread ? (
          <EmptyState label="Select a conversation to view the thread." />
        ) : (
          <>
            <div className="thread-head">
              <div
                className="cav"
                style={{ background: thread.avatarColor, width: 40, height: 40, borderRadius: 11, display: 'grid', placeItems: 'center', fontWeight: 700, color: '#fff' }}
              >
                {thread.initials}
              </div>
              <div>
                <div className="nm">{thread.contactName}</div>
                <div className="st">
                  <span className="chan-badge" style={{ background: `${chanMeta(thread.channel).color}22`, color: chanMeta(thread.channel).color }}>
                    {chanMeta(thread.channel).icon} {chanMeta(thread.channel).label}
                  </span>{' '}
                  · {thread.location ?? 'Location unknown'} · {thread.phone ?? 'No phone on file'}
                </div>
              </div>
              <div className="th-actions">
                <button
                  className="btn btn-o"
                  onClick={() =>
                    assignToMe.mutate(undefined, {
                      onSuccess: () => toast('Conversation assigned to you ✓'),
                      onError: () => toast('Could not assign — sign in required until auth is wired', 'error'),
                    })
                  }
                >
                  Assign to me
                </button>
                <button
                  className="btn btn-g"
                  onClick={() =>
                    resolve.mutate(undefined, {
                      onSuccess: () => toast('Marked as resolved ✓'),
                      onError: () => toast('Could not resolve — sign in required until auth is wired', 'error'),
                    })
                  }
                >
                  Resolve
                </button>
              </div>
            </div>
            <div className="msgs">
              {thread.messages.map((m, i) => (
                <div className={`m ${m.role}`} key={i}>
                  <span className="who">{m.role === 'cust' ? thread.contactName : ROLE_NAME[m.role]}</span>
                  <div className="bub" style={{ whiteSpace: 'pre-line' }}>
                    {m.text}
                  </div>
                  <span className="mt">{m.time}</span>
                </div>
              ))}
            </div>
            <div className="composer">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a reply, or click a Co-pilot suggestion →"
              />
              <button className="send" onClick={handleSend}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      <div className="copilot">
        {thread && (
          <>
            <div className="cop-h">
              <span className="spark">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l2 5 5 .5-4 3.5 1 5-4-2.5L8 16l1-5-4-3.5 5-.5z" />
                </svg>
              </span>{' '}
              Agent Co-pilot
            </div>
            <div className="cop-block">
              <div className="lbl">Live sentiment</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 600, color: thread.copilot.sentiment ? SENTIMENT_COLOR[thread.copilot.sentiment] : 'var(--muted)' }}>
                {thread.copilot.sentiment && <span className={`sent s-${thread.copilot.sentiment}`} style={{ width: 10, height: 10 }} />}
                {thread.copilot.sentiment ? SENTIMENT_LABEL[thread.copilot.sentiment] : 'Not yet analysed'}
              </div>
            </div>
            <div className="cop-block">
              <div className="lbl">Suggested replies · click to use</div>
              {thread.copilot.suggestions.length === 0 ? (
                <div className="cap">
                  {thread.copilot.configured
                    ? 'No suggestions available right now.'
                    : 'AI suggestions need an LLM provider key configured on the API.'}
                </div>
              ) : (
                thread.copilot.suggestions.map((s, i) => (
                  <div className="sugg" key={i} onClick={() => setReplyText(s)}>
                    {s}
                    <span className="use">↳ Insert into reply</span>
                  </div>
                ))
              )}
            </div>
            {thread.copilot.kbArticles.length > 0 && (
              <div className="cop-block">
                <div className="lbl">Knowledge base</div>
                {thread.copilot.kbArticles.map((title, i) => (
                  <div className="kbrow" key={i}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 5h16v14H4z" />
                      <path d="M4 9h16" />
                    </svg>
                    {title}
                  </div>
                ))}
              </div>
            )}
            {thread.copilot.nextBestActions.length > 0 && (
              <div className="cop-block">
                <div className="lbl">Next best action</div>
                {thread.copilot.nextBestActions.map((action, i) => (
                  <div className="nba" key={i}>
                    <span className="n">{i + 1}</span> {action}
                  </div>
                ))}
              </div>
            )}
            <div className="cop-block">
              <div className="lbl">Customer snapshot</div>
              <div className="infoline">
                <span>Location</span>
                <b>{thread.location ?? '—'}</b>
              </div>
              <div className="infoline">
                <span>Channel</span>
                <b>{chanMeta(thread.channel).label}</b>
              </div>
              <div className="infoline">
                <span>Linked order</span>
                <b>{thread.linkedOrderRef ?? '—'}</b>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
