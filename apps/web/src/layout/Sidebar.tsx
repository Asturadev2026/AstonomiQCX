import { NavLink } from 'react-router-dom';
import { NAV_GROUPS, VIEWS } from '../lib/views';
import { NavIcon } from '../components/NavIcon';
import { useNavCounts, useSessionUser } from '../lib/api/hooks';
import { useAuth } from '../state/auth';

export function Sidebar() {
  const { data: counts } = useNavCounts();
  const { data: user } = useSessionUser();
  const { signOut } = useAuth();

  return (
    <aside className="side">
      <div className="brand">
        <div className="logo">
          <i />
        </div>
        <div>
          <b>AstronomiQ</b>
          <span>{user?.tenantName ?? ''}</span>
        </div>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group}>
          <div className="navlabel">{group}</div>
          {VIEWS.filter((v) => v.group === group).map((v) => (
            <NavLink
              key={v.id}
              to={`/${v.id}`}
              className={({ isActive }) => (isActive ? 'nav on' : 'nav')}
            >
              <NavIcon view={v.id} />
              {v.title}
              {v.badge && counts && counts[v.badge] > 0 && (
                <span className="badge">{counts[v.badge]}</span>
              )}
            </NavLink>
          ))}
        </div>
      ))}

      <div className="side-foot">
        <div className="ava">{user?.initials ?? ''}</div>
        <div>
          <b>{user?.name ?? ''}</b>
          <small>{user?.title ?? ''}</small>
        </div>
        <button className="out" title="Sign out" onClick={signOut}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
