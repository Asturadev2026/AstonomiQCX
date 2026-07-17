/** Guide §13.4/Appendix E — Cloud Telephony: Exotel integration, numbers, CDR. */

export interface TelephonyKpis {
  /** Real — count of today's Call rows. */
  callsToday: number;
  /** No real data source (no carrier monitoring integration) — always null. */
  carrierUptimePct: number | null;
  /** No real field to compute from (Call has no wait-before-answer timestamp) — always null. */
  avgWaitSecs: number | null;
  /** No real billing/rate data — always null. */
  avgCostPerCall: number | null;
}

export interface TelephonyIntegrationStatus {
  configured: boolean;
  maskedSid: string | null;
  maskedToken: string | null;
  webhookUrl: string;
  subdomain: string;
}

export interface SendTestCallDto {
  toNumber: string;
}

export interface TestCallResultDto {
  configured: boolean;
  callSid?: string;
  status?: string;
}

export interface NumberDidDto {
  id: string;
  number: string;
  type: string | null;
  mappedTo: string | null;
  status: string;
}

export interface CreateNumberDidDto {
  number: string;
  type?: string;
  mappedTo?: string;
}

export interface CdrRowDto {
  id: string;
  createdAt: string;
  direction: string | null;
  fromNum: string | null;
  toNum: string | null;
  virtualNum: string | null;
  agentName: string | null;
  durationS: number | null;
  disposition: string;
  recordingUrl: string | null;
}

export interface CallWorkflowStepDto {
  step: number;
  label: string;
  detail: string;
}
