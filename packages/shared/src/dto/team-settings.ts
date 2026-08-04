/** Guide's Team & Settings view: workspace members, feature toggles and connected integrations. */

export interface TeamMemberRow {
  id: string;
  name: string;
  initials: string;
  avatarColor: string | null;
  email: string;
  roleLabel: string;
  roleClass: string; // '' | 'admin' | 'lead' — matches the .role CSS variants
  teamName: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  status: string;
}

export interface IntegrationCard {
  id: string;
  icon: string;
  label: string;
  status: string;
  color: string;
}

// Fixed key set (Guide's 5 platform toggles) — the frontend owns the title/description copy.
export interface SettingsToggles {
  autoResolve: boolean;
  hindiSupport: boolean;
  sentimentRouting: boolean;
  autoQa: boolean;
  afterHoursVoice: boolean;
}

export interface SettingsPayload {
  team: TeamMemberRow[];
  toggles: SettingsToggles;
  integrations: IntegrationCard[];
}

export interface CreateInviteDto {
  email: string;
  departmentId?: string;
}

export interface InviteDto {
  id: string;
  email: string;
  status: string;
}

/** The three UI-facing roles the Team Settings dropdown exposes. */
export const UI_ROLES = ['Admin', 'Manager', 'Executive'] as const;
export type UiRoleName = (typeof UI_ROLES)[number];

/** Maps the UI label to the internal DB role name. */
export const UI_ROLE_TO_DB: Record<UiRoleName, string> = {
  Admin: 'Admin',
  Manager: 'Manager',
  Executive: 'Agent',
};

export interface UpdateUserRoleDto {
  roleName: UiRoleName;
}
