import { useNavCounts, useSessionUser } from '../lib/api/hooks';
import { useToast } from '../components/Toast';

export function Topbar({ title, sub }: { title: string; sub: string }) {
  const { data: counts } = useNavCounts();
  const { data: user } = useSessionUser();
  const toast = useToast();
  const subText = sub.replace('{tenant}', user?.tenantName ?? '');

  return (
    <div className="topbar">
      <div>
        <div className="pt">{title}</div>
        <div className="sub">{subText}</div>
      </div>
      <div className="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
        <input placeholder="Search customers, orders, tickets…" />
      </div>
      <button
        className="tb-icon"
        onClick={() =>
          toast(`You have ${counts?.unreadNotifications ?? 0} new notifications`)
        }
      >
        {(counts?.unreadNotifications ?? 0) > 0 && <span className="nd" />}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      </button>
      <div className="tpill">
        <span className="dot live" /> {counts?.agentsLive ?? 0} agents live
      </div>
    </div>
  );
}
