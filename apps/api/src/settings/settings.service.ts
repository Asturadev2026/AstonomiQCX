import { BadRequestException, Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import type { CreateInviteDto, IntegrationCard, InviteDto, SettingsPayload, SettingsToggles, TeamMemberRow } from '@aq/shared';

const DEFAULT_TOGGLES: SettingsToggles = {
  autoResolve: true,
  hindiSupport: true,
  sentimentRouting: true,
  autoQa: true,
  afterHoursVoice: false,
};

// Icon/color/display-name per Channel.type — same icon set as the prototype's
// integrations grid (Guide's Team & Settings view).
const CHANNEL_META: Record<string, { label: string; icon: string; color: string }> = {
  whatsapp: { label: 'WhatsApp Business', icon: '💬', color: '#25D366' },
  instagram: { label: 'Instagram', icon: '📸', color: '#DB2777' },
  email: { label: 'Gmail / Email', icon: '✉️', color: '#0EA5E9' },
  voice: { label: 'Exotel Voice', icon: '📞', color: '#E08A00' },
  shopify: { label: 'Shopify', icon: '🛍️', color: '#16A34A' },
  razorpay: { label: 'Razorpay', icon: '💳', color: '#2563EB' },
  salesforce: { label: 'Salesforce CRM', icon: '📊', color: '#4F46E5' },
};

const ROLE_LABEL: Record<string, string> = { TeamLead: 'Team Lead' };
const ROLE_CLASS: Record<string, string> = { Admin: 'admin', TeamLead: 'lead' };

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

@Injectable()
export class SettingsService {
  private prisma = getPrisma();

  async getSettings(tenantId: string): Promise<SettingsPayload> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const [users, pendingInvites, settings, channels] = await Promise.all([
        tx.user.findMany({ include: { role: true, team: true }, orderBy: { name: 'asc' } }),
        tx.invite.findMany({ where: { status: 'sent' }, include: { role: true }, orderBy: { createdAt: 'desc' } }),
        tx.tenantSettings.findUnique({ where: { tenantId } }),
        tx.channel.findMany({ where: { tenantId } }),
      ]);

      const team: TeamMemberRow[] = [
        ...users.map((u) => ({
          id: u.id,
          name: u.name,
          initials: initials(u.name),
          avatarColor: u.avatarColor,
          email: u.email,
          roleLabel: u.role ? (ROLE_LABEL[u.role.name] ?? u.role.name) : 'Agent',
          roleClass: u.role ? (ROLE_CLASS[u.role.name] ?? '') : '',
          teamName: u.team?.name ?? null,
          status: u.status === 'active' ? 'Active' : u.status,
        })),
        // Invited but not yet accepted — no User row exists yet, so these are
        // surfaced from Invite directly rather than left invisible after sending.
        ...pendingInvites.map((i) => ({
          id: i.id,
          name: i.email,
          initials: initials(i.email.split('@')[0]!.replace(/[._-]/g, ' ')),
          avatarColor: '#94A3B8',
          email: i.email,
          roleLabel: i.role ? (ROLE_LABEL[i.role.name] ?? i.role.name) : '—',
          roleClass: i.role ? (ROLE_CLASS[i.role.name] ?? '') : '',
          teamName: null,
          status: 'Pending',
        })),
      ];

      const integrations: IntegrationCard[] = channels.map((c) => {
        const meta = CHANNEL_META[c.type] ?? { label: c.type, icon: '🔌', color: '#94A3B8' };
        return {
          id: c.id,
          icon: meta.icon,
          label: meta.label,
          color: meta.color,
          status: c.status === 'connected' ? 'Connected' : c.status.charAt(0).toUpperCase() + c.status.slice(1),
        };
      });

      const toggles: SettingsToggles = { ...DEFAULT_TOGGLES, ...((settings?.toggles as Partial<SettingsToggles>) ?? {}) };

      return { team, toggles, integrations };
    });
  }

  async toggleSetting(tenantId: string, key: string): Promise<SettingsToggles> {
    if (!(key in DEFAULT_TOGGLES)) {
      throw new BadRequestException(`Unknown setting "${key}"`);
    }
    return withTenant(this.prisma, tenantId, async (tx) => {
      const existing = await tx.tenantSettings.findUnique({ where: { tenantId } });
      const current: SettingsToggles = { ...DEFAULT_TOGGLES, ...((existing?.toggles as Partial<SettingsToggles>) ?? {}) };
      const updated: SettingsToggles = { ...current, [key]: !current[key as keyof SettingsToggles] };
      await tx.tenantSettings.upsert({
        where: { tenantId },
        update: { toggles: updated as object },
        create: { tenantId, toggles: updated as object },
      });
      return updated;
    });
  }

  async createInvite(tenantId: string, dto: CreateInviteDto): Promise<InviteDto> {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const invite = await tx.invite.create({ data: { tenantId, email: dto.email } });
      return { id: invite.id, email: invite.email, status: invite.status };
    });
  }
}
