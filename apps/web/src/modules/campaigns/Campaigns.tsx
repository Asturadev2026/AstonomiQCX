import { useEffect, useState } from 'react';
import { useCampaigns, useSendCampaign } from '../../lib/api/hooks';
import { ErrorState, LoadingState } from '../../components/states';
import { useToast } from '../../components/Toast';
import type { CampaignAudience } from '../../lib/api/types';

/**
 * Campaigns — exact port of the prototype's #campaigns section.
 * Markup/classes verbatim, every value from useCampaigns(). (Plan §10.2 pattern)
 */

function renderPreview(message: string, sampleName: string): string {
  return message.replace(/\{name\}/g, sampleName);
}

export function Campaigns() {
  const { data, isLoading, error, refetch } = useCampaigns();
  const sendCampaign = useSendCampaign();
  const toast = useToast();

  const [audienceId, setAudienceId] = useState<CampaignAudience['id'] | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (data && audienceId === null) {
      setAudienceId(data.audiences[0]?.id ?? null);
      setMessage(data.audiences[0]?.defaultMessage ?? '');
    }
  }, [data, audienceId]);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  const selected = data.audiences.find((a) => a.id === audienceId) ?? data.audiences[0];

  function selectAudience(a: CampaignAudience) {
    setAudienceId(a.id);
    setMessage(a.defaultMessage);
  }

  function send() {
    if (!selected) return;
    sendCampaign.mutate(
      { audienceId: selected.id, message },
      {
        onSuccess: () => toast(`Broadcast scheduled to ${selected.count.toLocaleString()} customers ✓`),
        onError: (err) => toast(err instanceof Error ? err.message : 'Could not send campaign'),
      },
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Proactive campaigns</h3>
          <div className="cap" style={{ margin: '2px 0 0' }}>
            Reach customers on WhatsApp — offers, reminders, feedback requests
          </div>
        </div>
      </div>
      <div className="grid camp-grid">
        <div className="card">
          <h3>New WhatsApp broadcast</h3>
          <div className="cap">Pick an audience, write your message, then send</div>
          <div className="cop-block" style={{ marginTop: 4 }}>
            <div className="lbl">1 · Choose audience</div>
            {data.audiences.map((a) => (
              <div key={a.id} className={`seg ${a.id === selected?.id ? 'on' : ''}`} onClick={() => selectAudience(a)}>
                <span className={`sg-ic ${a.iconClass}`}>{a.icon}</span>
                <div>
                  <div className="sg-n">{a.label}</div>
                  <div className="sg-c">{a.description}</div>
                </div>
                <span className="sg-cnt">{a.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="cop-block">
            <div className="lbl">2 · Your message</div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--panel)',
                border: '1px solid var(--line2)',
                borderRadius: 9,
                padding: 11,
                fontSize: 13,
                height: 90,
                resize: 'none',
                outline: 'none',
                color: 'var(--text)',
              }}
            />
          </div>
          <button
            className="btn btn-g"
            onClick={send}
            disabled={sendCampaign.isPending || !selected}
            style={{ width: '100%', justifyContent: 'center', padding: 12 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            Send to <span>{(selected?.count ?? 0).toLocaleString()}</span> customers
          </button>
        </div>
        <div>
          <div className="card">
            <h3>Live preview</h3>
            <div className="cap">How it looks on WhatsApp</div>
            <div className="wa-preview">
              <div className="wa-m in" style={{ maxWidth: '100%' }}>
                {selected ? renderPreview(message, selected.sampleName) : message}
                <span className="tk">now</span>
              </div>
            </div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Recent campaigns</h3>
            <div className="cap">Last 30 days</div>
            {data.recent.map((c) => (
              <div className="infoline" key={c.id}>
                <span>{c.name}</span>
                <b style={{ color: 'var(--green)' }}>{c.metricLabel}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
