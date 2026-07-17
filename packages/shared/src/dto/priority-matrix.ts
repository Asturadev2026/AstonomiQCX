/** Guide §8.3 — Priority matrix: urgency × impact sets ticket priority automatically. */

export interface PriorityMatrixCellDto {
  urgency: 'high' | 'medium' | 'low';
  impact: 'low' | 'medium' | 'high';
  priority: string;
  /** From the tenant's real SlaPolicy for this priority (same tie-break as SlaService.startTimers). '—' if none configured. */
  resolutionLabel: string;
}

export interface PriorityLevelInfoDto {
  priority: string;
  label: string;
  description: string;
  /** Real keywords from apps/api/src/tickets/priority.ts's classifier — not re-typed flavor text. */
  keywords: string[];
}

export interface PriorityMatrixDto {
  cells: PriorityMatrixCellDto[];
  levels: PriorityLevelInfoDto[];
  impactKeywords: string[];
  vipBumpNote: string;
}
