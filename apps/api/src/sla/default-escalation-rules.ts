/**
 * The prototype's L1→L4 escalation matrix — Guide §11.5. Seeded as real
 * reference data (EscalationRule rows) so the matrix on screen is real, not
 * a client-side array. The background sweep that would actually WALK this
 * matrix automatically (Guide §11.4) is out of scope for this pass — see the
 * "real data, current clock" scoping note in repo memory.
 */
export const DEFAULT_ESCALATION_RULES: Array<{
  level: number;
  triggerAfterMins: number;
  escalateToRole: string | null;
  who: string;
  role: string;
  timing: string;
}> = [
  { level: 1, triggerAfterMins: 0, escalateToRole: null, who: 'Assigned executive', role: 'Frontline agent · functional', timing: 'On assignment' },
  { level: 2, triggerAfterMins: 30, escalateToRole: 'TeamLead', who: 'Reporting manager', role: 'Team lead · same department', timing: '+30 min if unresolved' },
  { level: 3, triggerAfterMins: 90, escalateToRole: 'Manager', who: 'Department head', role: 'Functional / departmental', timing: '+1 hr if still open' },
  { level: 4, triggerAfterMins: 210, escalateToRole: 'Admin', who: 'Escalations desk + Regional lead', role: 'Hierarchical · senior', timing: '+2 hrs or on SLA breach' },
];
