/** Guide's module tour — "Field Service": on-site visits, installs & warranty repairs. */

export interface FieldServiceKpis {
  scheduledToday: number;
  completedToday: number;
  inProgressToday: number;
  techniciansOnField: number;
}

export interface ServiceVisitDto {
  id: string;
  kind: string | null;
  contactName: string | null;
  address: string | null;
  slot: string | null;
  technician: string | null;
  status: string | null;
}

export interface CreateServiceVisitDto {
  kind: string;
  contactId?: string;
  address?: string;
  slot: string; // ISO datetime
  technician?: string;
}
