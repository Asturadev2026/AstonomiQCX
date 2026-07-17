import type { CallWorkflowStepDto } from '@aq/shared';

/**
 * The "end-to-end call workflow" reference diagram — static content, not
 * DB-persisted (same treatment as Contact Centre's IVR menu — descriptive,
 * no edit UI in the prototype). Describes what a fully-connected Exotel
 * setup would do; whether it's actually happening depends on real telephony
 * being connected (see TelephonyService.integrationStatus()).
 */
export const CALL_WORKFLOW_STEPS: CallWorkflowStepDto[] = [
  { step: 1, label: 'Carrier receives the call', detail: 'Customer dials the ExoPhone number; Exotel answers and starts the call leg.' },
  { step: 2, label: 'Webhook hits our API', detail: 'Exotel calls our inbound webhook with the caller’s number and call SID.' },
  { step: 3, label: 'IVR menu & language', detail: 'Caller hears the menu, picks an option or is auto-routed by detected language.' },
  { step: 4, label: 'Skills-based routing', detail: 'The call joins the right queue (Payments, Returns, ...) by skill and current wait time.' },
  { step: 5, label: 'Agent screen-pop', detail: 'The assigned agent’s softphone rings; the customer’s full profile appears instantly.' },
  { step: 6, label: 'Call ends → CDR + ticket', detail: 'The call leg is logged in the CDR with duration and disposition, and linked to a ticket if one was raised.' },
];
