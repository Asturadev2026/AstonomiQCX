/** Guide's Billing & Plans view: this cycle's usage, invoices and the plan catalog. */

export interface UsageMeter {
  label: string;
  usedLabel: string;
  limitLabel: string;
  pct: number;
  color: string;
}

export interface InvoiceRow {
  id: string;
  extRef: string | null;
  period: string;
  amountLabel: string;
  status: string;
}

export interface PlanCard {
  id: string;
  name: string;
  priceLabel: string;
  current: boolean;
  features: string[];
}

export interface BillingPayload {
  cycleLabel: string;
  usage: UsageMeter[];
  estimatedBillLabel: string;
  invoices: InvoiceRow[];
  plans: PlanCard[];
}
