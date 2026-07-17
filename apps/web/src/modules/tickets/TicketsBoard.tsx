import { useState } from 'react';
import { useCreateTicket, useMoveTicket, useTickets } from '../../lib/api/hooks';
import { useToast } from '../../components/Toast';
import { ErrorState, LoadingState } from '../../components/states';
import { initials } from '../../lib/format';
import type { TicketRow } from '../../lib/api/types';

/**
 * Tickets Board — exact port of the prototype's #tickets section (4-column
 * kanban). Backed by the pre-existing Tickets module (Guide §8.3's reference
 * pattern) — reads work unauthenticated like every other view; create/move
 * need a real login (JwtGuard) which isn't wired into apps/web yet.
 */

const STAGES: { status: TicketRow['status']; label: string; color: string }[] = [
  { status: 'new', label: 'New', color: '#2563EB' },
  { status: 'in_progress', label: 'In Progress', color: '#E08A00' },
  { status: 'waiting', label: 'Waiting on customer', color: '#0EA5E9' },
  { status: 'resolved', label: 'Resolved', color: '#16A34A' },
];
const NEXT_STATUS: Partial<Record<TicketRow['status'], TicketRow['status']>> = {
  new: 'in_progress',
  in_progress: 'waiting',
  waiting: 'resolved',
};
const PRIORITY_META: Record<TicketRow['priority'], { label: string; pill: string }> = {
  p1: { label: 'Urgent', pill: 'p-hi' },
  p2: { label: 'High', pill: 'p-hi' },
  p3: { label: 'Medium', pill: 'p-md' },
  p4: { label: 'Low', pill: 'p-lo' },
};

function ticketsForStage(tickets: TicketRow[], status: TicketRow['status']) {
  if (status === 'resolved') return tickets.filter((t) => t.status === 'resolved' || t.status === 'closed');
  return tickets.filter((t) => t.status === status);
}

export function TicketsBoard() {
  const { data: tickets, isLoading, error, refetch } = useTickets();
  const moveTicket = useMoveTicket();
  const createTicket = useCreateTicket();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');

  if (isLoading) return <LoadingState />;
  if (error || !tickets) return <ErrorState error={error} retry={() => void refetch()} />;

  const handleCreate = () => {
    const text = subject.trim();
    if (!text) return;
    createTicket.mutate(
      { subject: text },
      {
        onSuccess: () => {
          setSubject('');
          setCreating(false);
          toast('New ticket created ✓');
        },
        onError: () => toast('Could not create ticket — sign in required until auth is wired', 'error'),
      },
    );
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Support tickets</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            Click "Move forward" on any ticket to advance it through the workflow
          </div>
        </div>
        <button className="btn btn-g" style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New ticket
        </button>
      </div>

      {creating && (
        <div className="card" style={{ marginBottom: 14, padding: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            autoFocus
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setCreating(false);
            }}
            placeholder="What's the issue?"
            style={{ flex: 1, background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 9, padding: '9px 12px', fontSize: 13 }}
          />
          <button className="btn btn-g" onClick={handleCreate}>
            Create
          </button>
          <button className="btn btn-o" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </div>
      )}

      <div className="board">
        {STAGES.map((stage) => {
          const items = ticketsForStage(tickets, stage.status);
          return (
            <div className="col" key={stage.status}>
              <div className="col-h">
                <span className="cdot" style={{ background: stage.color }} />
                {stage.label}
                <span className="cnt">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted2)', fontSize: 12, padding: '20px 0' }}>No tickets</div>
              ) : (
                items.map((t) => {
                  const pri = PRIORITY_META[t.priority];
                  const next = NEXT_STATUS[t.status];
                  return (
                    <div className="tkt" key={t.id}>
                      <div className="tid">{t.extRef ?? t.id.slice(0, 8)}</div>
                      <div className="tt">{t.subject}</div>
                      <div className="tf">
                        <span className={`pill ${pri.pill}`}>{pri.label}</span>
                        {t.assignedUser ? (
                          <span className="tav" style={{ background: t.assignedUser.avatarColor ?? '#94A3B8' }}>
                            {initials(t.assignedUser.name)}
                          </span>
                        ) : (
                          <span className="tav" style={{ background: '#CBD5E1' }} title="Unassigned">
                            —
                          </span>
                        )}
                      </div>
                      {next ? (
                        <button
                          className="adv"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          onClick={() =>
                            moveTicket.mutate(
                              { id: t.id, status: next },
                              {
                                onSuccess: () => toast(`Ticket moved to ${STAGES.find((s) => s.status === next)?.label} ✓`),
                                onError: () => toast('Could not move ticket — sign in required until auth is wired', 'error'),
                              },
                            )
                          }
                        >
                          Move forward →
                        </button>
                      ) : (
                        <span className="adv" style={{ color: 'var(--green)' }}>
                          ✓ Closed
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
