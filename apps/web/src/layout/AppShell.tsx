import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { viewById } from '../lib/views';

export function AppShell() {
  const { pathname } = useLocation();
  const view = viewById(pathname.replace(/^\//, '')) ?? viewById('overview')!;

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Topbar title={view.title} sub={view.sub} />
        <div className="scroll">
          {/* key remounts the section so the prototype's .view fade-in replays per navigation */}
          <section className="view on" key={view.id}>
            <Outlet />
          </section>
        </div>
      </main>
    </div>
  );
}
