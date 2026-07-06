import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/auth';
import { Login } from './pages/Login';
import { AppShell } from './layout/AppShell';
import { VIEWS } from './lib/views';
import { CommandCentre } from './modules/overview/CommandCentre';
import { AddCustomer } from './modules/customer/AddCustomer';
import { CustomerProfile } from './modules/customer/CustomerProfile';
import { StubPage } from './components/StubPage';

/** Views with a finished port register here; everything else renders its stub. */
const PORTED: Record<string, () => JSX.Element | null> = {
  overview: CommandCentre,
  customer: CustomerProfile,
};

export function App() {
  const { authed } = useAuth();

  if (!authed) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        {VIEWS.map((v) => {
          const Page = PORTED[v.id] ?? (() => <StubPage viewId={v.id} />);
          return <Route key={v.id} path={`/${v.id}`} element={<Page />} />;
        })}
        <Route path="/customer/add" element={<AddCustomer />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  );
}
