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
}

export interface InviteDto {
  id: string;
  email: string;
  status: string;
}
