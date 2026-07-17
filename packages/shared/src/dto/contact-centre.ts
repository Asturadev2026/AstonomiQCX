/** Guide's module tour — "Contact Centre": IVR, live call queue, supervisor monitoring. */

export interface ContactCentreKpis {
  /** Real, live — calls currently at status 'ringing'. Honestly 0 without a connected telephony integration. */
  callsInQueue: number;
  /** Real, live — from AgentStatusRow, same source as the Workforce board. */
  agentsOnCall: number;
  /** Real, historical — % of calls with status 'abandoned'. Null if no call history yet. */
  abandonRatePct: number | null;
}

export interface IvrMenuOptionDto {
  key: string;
  label: string;
  destination: string;
}
