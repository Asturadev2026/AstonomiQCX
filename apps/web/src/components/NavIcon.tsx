/** Sidebar icons — inner SVG markup copied verbatim from the prototype nav buttons. */

const ICONS: Record<string, string> = {
  overview:
    '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  inbox: '<path d="M4 4h16v12H5.2L4 17.5V4z"/><path d="M8 9h8M8 12h5"/>',
  convhub:
    '<circle cx="12" cy="12" r="9"/><path d="M8 11h8M8 14h5M2 12a10 10 0 0 1 10-10"/>',
  tickets:
    '<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="10" rx="1"/>',
  chatbot:
    '<rect x="4" y="5" width="16" height="12" rx="3"/><circle cx="9" cy="11" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1.2" fill="currentColor" stroke="none"/><path d="M12 5V2M8 17l-2 4"/>',
  whatsapp:
    '<path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3z"/><path d="M8.5 8.5c0 4 3 7 7 7"/>',
  voice:
    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>',
  builder:
    '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/><path d="M7 10v4h10"/>',
  automations: '<path d="M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z"/>',
  kb: '<path d="M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 1-2-2V5z"/><path d="M20 5a2 2 0 0 0-2-2h-6v18h6a2 2 0 0 0 2-2V5z"/>',
  macros:
    '<path d="M4 7h16M4 12h10M4 17h7"/><rect x="16" y="14" width="5" height="5" rx="1"/>',
  sla: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M12 2v2M9 2h6"/>',
  departments:
    '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="15" width="6" height="5" rx="1"/><rect x="15" y="15" width="6" height="5" rx="1"/><path d="M12 8v3M6 15v-2h12v2"/>',
  workforce:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><circle cx="18" cy="8" r="2.2"/><path d="M16 20c0-2.5 1-4 4-4"/>',
  contactcentre:
    '<path d="M4 4h4l2 5-3 2a11 11 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 0-2z"/>',
  telephony:
    '<path d="M3 5c0 9 7 16 16 16l0-3.5-4-1.5-2 2a12 12 0 0 1-5-5l2-2L8.5 7 5 5H3z"/><path d="M15 3h6M18 3v6" stroke-width="1.6"/>',
  fieldservice:
    '<path d="M14 7l-1.5-1.5a3 3 0 0 0-4 4L4 13.5V20h6.5l4-4M14 7l3-3 3 3-3 3-3-3z"/>',
  priomatrix:
    '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  campaigns: '<path d="M3 11l18-7-7 18-3-8-8-3z"/>',
  surveys:
    '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  journey:
    '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h6a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8"/>',
  customer:
    '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/>',
  portal:
    '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 8h18M8 21h8"/>',
  qa: '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>',
  analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  audit:
    '<path d="M9 12l2 2 4-4"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/><path d="M15 3v4h4"/>',
  billing:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3.9a7 7 0 0 0-1.7-1L14.5 2h-4l-.4 2.5a7 7 0 0 0-1.7 1L6 4.6l-2 3.4L6 9.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.3.9 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/>',
};

export function NavIcon({ view }: { view: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      dangerouslySetInnerHTML={{ __html: ICONS[view] ?? '' }}
    />
  );
}
