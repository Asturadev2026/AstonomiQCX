import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/auth';
import { Login } from './pages/Login';
import { AppShell } from './layout/AppShell';
import { VIEWS } from './lib/views';
import { CommandCentre } from './modules/overview/CommandCentre';
import { AddCustomer } from './modules/customer/AddCustomer';
import { CustomerProfile } from './modules/customer/CustomerProfile';
import { CustomerJourney } from './modules/journey/CustomerJourney';
import { AiChatbot } from './modules/chatbot/AiChatbot';
import { WhatsappBot } from './modules/whatsapp/WhatsappBot';
import { VoiceAi } from './modules/voice/VoiceAi';
import { AgentBuilder } from './modules/builder/AgentBuilder';
import { Automations } from './modules/automations/Automations';
import { KnowledgeBase } from './modules/kb/KnowledgeBase';
import { Macros } from './modules/macros/Macros';
import { Sla } from './modules/sla/Sla';
import { Departments } from './modules/departments/Departments';
import { Workforce } from './modules/workforce/Workforce';
import { ContactCentre } from './modules/contact-centre/ContactCentre';
import { CloudTelephony } from './modules/telephony/CloudTelephony';
import { FieldService } from './modules/field-service/FieldService';
import { PriorityMatrix } from './modules/priority-matrix/PriorityMatrix';
import { SurveysVoc } from './modules/surveys/SurveysVoc';
import { Campaigns } from './modules/campaigns/Campaigns';
import { SelfServicePortal } from './modules/portal/SelfServicePortal';
import { AutoQA } from './modules/qa/AutoQA';
import { Analytics } from './modules/analytics/Analytics';
import { StubPage } from './components/StubPage';

/** Views with a finished port register here; everything else renders its stub. */
const PORTED: Record<string, () => JSX.Element | null> = {
  overview: CommandCentre,
  customer: CustomerProfile,
  journey: CustomerJourney,
  chatbot: AiChatbot,
  whatsapp: WhatsappBot,
  voice: VoiceAi,
  builder: AgentBuilder,
  automations: Automations,
  kb: KnowledgeBase,
  macros: Macros,
  sla: Sla,
  departments: Departments,
  workforce: Workforce,
  contactcentre: ContactCentre,
  telephony: CloudTelephony,
  fieldservice: FieldService,
  priomatrix: PriorityMatrix,
  surveys: SurveysVoc,
  campaigns: Campaigns,
  portal: SelfServicePortal,
  qa: AutoQA,
  analytics: Analytics,
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
