import { useContacts } from '../lib/api/hooks';
import { useTestContact } from '../state/testContact';

/**
 * "Test as this customer" — global picker in the Topbar. Lets the
 * Chatbot/WhatsApp/Voice AI demo widgets answer using a real contact's
 * orders/tickets instead of staying anonymous.
 */
export function ContactPicker() {
  const { contact, setContact } = useTestContact();
  const { data: contacts } = useContacts('');

  return (
    <select
      value={contact?.id ?? ''}
      onChange={(e) => setContact(contacts?.find((c) => c.id === e.target.value) ?? null)}
      title="Test the AI bots as this customer"
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        borderRadius: 10,
        color: 'var(--text)',
        padding: '9px 12px',
        fontSize: 13,
        maxWidth: 200,
      }}
    >
      <option value="">Test as: Anonymous</option>
      {contacts?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.phone ? ` (${c.phone})` : ''}
        </option>
      ))}
    </select>
  );
}
