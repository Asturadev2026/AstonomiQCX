import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ContactOption } from '../lib/api/types';

/**
 * Global "test as this customer" selection, set from the Topbar picker and
 * read by the Chatbot/WhatsApp/Voice AI demo widgets so Astra can answer
 * using that contact's real orders/tickets instead of staying anonymous.
 */
interface TestContactState {
  contact: ContactOption | null;
  setContact: (c: ContactOption | null) => void;
}

const TestContactCtx = createContext<TestContactState>({
  contact: null,
  setContact: () => {},
});

export function useTestContact() {
  return useContext(TestContactCtx);
}

export function TestContactProvider({ children }: { children: ReactNode }) {
  const [contact, setContact] = useState<ContactOption | null>(null);
  return <TestContactCtx.Provider value={{ contact, setContact }}>{children}</TestContactCtx.Provider>;
}
