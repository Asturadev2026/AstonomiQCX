import { BadRequestException, Injectable } from '@nestjs/common';
import { getPrisma, withTenant } from '@aq/db';
import type { CreateInviteDto, IntegrationCard, InviteDto, SettingsPayload, SettingsToggles, TeamMemberRow, UpdateUserRoleDto } from '@aq/shared';
import { UI_ROLE_TO_DB } from '@aq/shared';

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

// Agent is displayed as "Executive" in the UI (three-role system).
const ROLE_LABEL: Record<string, string> = { Agent: 'Executive', TeamLead: 'Team Lead' };
const ROLE_CLASS: Record<string, string> = { Admin: 'admin', Manager: 'lead', TeamLead: 'lead' };

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
        tx.user.findMany({ include: { role: true, team: true, department: true }, orderBy: { name: 'asc' } }),
        tx.invite.findMany({ where: { status: 'sent' }, include: { role: true }, orderBy: { createdAt: 'desc' } }),
        tx.tenantSettings.findUnique({ where: { tenantId } }),
        tx.channel.findMany({ where: { tenantId } }),
      ]);

      const userEmails = new Set(users.map((u) => u.email.toLowerCase()));
      const unacceptedInvites = pendingInvites.filter((i) => !userEmails.has(i.email.toLowerCase()));

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
          departmentId: u.departmentId,
          departmentName: u.department?.name ?? null,
          status: u.status === 'active' ? 'Active' : u.status,
        })),
        ...unacceptedInvites.map((i) => ({
          id: i.id,
          name: i.email,
          initials: initials(i.email.split('@')[0]!.replace(/[._-]/g, ' ')),
          avatarColor: '#94A3B8',
          email: i.email,
          roleLabel: i.role ? (ROLE_LABEL[i.role.name] ?? i.role.name) : '—',
          roleClass: i.role ? (ROLE_CLASS[i.role.name] ?? '') : '',
          teamName: null,
          departmentId: i.departmentId,
          departmentName: null,
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
      const role =
        (await tx.role.findFirst({ where: { tenantId, name: 'Admin' } })) ??
        (await tx.role.findFirst({ where: { tenantId } }));

      const status = role ? 'accepted' : 'sent';
      const invite = await tx.invite.create({
        data: { tenantId, email: dto.email, roleId: role?.id, departmentId: dto.departmentId, status },
      });

      const existingUser = await tx.user.findFirst({ where: { tenantId, email: dto.email } });
      if (!existingUser && role) {
        await tx.user.create({
          data: {
            tenantId,
            name: dto.email.split('@')[0]!,
            email: dto.email,
            roleId: role.id,
            departmentId: dto.departmentId,
            status: 'active',
            avatarColor: '#2563EB',
          },
        });
      } else if (existingUser && dto.departmentId) {
        await tx.user.update({
          where: { id: existingUser.id },
          data: { departmentId: dto.departmentId },
        });
      }

      return { id: invite.id, email: invite.email, status: invite.status };
    });
  }

  async updateUserDepartment(tenantId: string, userId: string, departmentId: string | null) {
    return withTenant(this.prisma, tenantId, async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { departmentId },
      });
      return { success: true };
    });
  }

  async updateUserRole(tenantId: string, userId: string, dto: UpdateUserRoleDto) {
    return withTenant(this.prisma, tenantId, async (tx) => {
      const dbRoleName = UI_ROLE_TO_DB[dto.roleName];
      // Ensure the role exists in this tenant — seed it if missing.
      let role = await tx.role.findFirst({ where: { tenantId, name: dbRoleName } });
      if (!role) {
        const PERMS_BY_ROLE: Record<string, string[]> = {
          Admin: ['*'],
          Manager: ['ticket.view.all', 'ticket.create', 'ticket.move', 'ticket.assign', 'sla.view', 'refund.approve', 'analytics.view', 'audit.view'],
          Agent: ['ticket.view.assigned', 'ticket.move', 'conversation.view', 'conversation.reply'],
        };
        role = await tx.role.create({
          data: { tenantId, name: dbRoleName, permissions: PERMS_BY_ROLE[dbRoleName] ?? [] },
        });
      }
      await tx.user.update({ where: { id: userId }, data: { roleId: role.id } });
      return { success: true, role: dto.roleName };
    });
  }
}
