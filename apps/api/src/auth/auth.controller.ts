import { BadRequestException, Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { getPrisma, withTenant } from '@aq/db';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { env } from '../config/env';
import { verifyOidcToken, loadUser, loadDevUser } from './oidc';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

// Dev-only shared password for the seeded Admin/Manager/Agent demo logins (see
// packages/db/src/seed/index.ts's DEMO_LOGIN_PASSWORD). There is no per-user password
// storage (User.oidcSubject's doc comment: "no local passwords") — this is a placeholder
// login screen for RBAC testing until real Keycloak OIDC (PKCE) replaces it (Guide §7),
// at which point only this endpoint and apps/web's Login.tsx/state/auth.tsx change.
const DEMO_LOGIN_PASSWORD = 'Demo@123';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

/** Not guarded yet — same rationale as every other controller. Unlike them,
 * this one still tries a real token first (so it's forward-compatible once
 * Keycloak login lands), falling back to the dev stand-in so the Topbar
 * can show the real, tenant-switchable `tenantName` without one. */
@Controller()
export class AuthController {
  @Get('me')
  async me(@Req() req: TenantScopedRequest) {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    if (token) {
      try {
        const claims = await verifyOidcToken(token);
        const user = await loadUser(req.tenantId, claims.sub as string);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          initials: initials(user.name),
          title: user.title || '',
          role: user.role,
          permissions: user.permissions,
          departmentId: user.departmentId,
          tenantName: req.tenantName,
        };
      } catch {
        // Falls through to the dev fallback below.
      }
    }
    if (env.NODE_ENV !== 'production') {
      try {
        const devEmail = (req.headers['x-user-email'] as string) || undefined;
        const user = await loadDevUser(req.tenantId, devEmail);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          initials: initials(user.name),
          title: user.title || '',
          role: user.role,
          permissions: user.permissions,
          departmentId: user.departmentId,
          tenantName: req.tenantName,
        };
      } catch {
        // No matching dev user (e.g. stale x-user-email after a tenant switch) — fall
        // through to the generic placeholder below rather than 401ing the whole shell.
      }
    }
    return {
      id: null,
      name: 'Demo User',
      email: '',
      initials: 'DU',
      title: 'Workspace Member',
      role: null,
      permissions: [],
      departmentId: null,
      tenantName: req.tenantName,
    };
  }

  /**
   * Dev-only login — checks the email is a real user in this workspace and the password
   * against the single shared DEMO_LOGIN_PASSWORD (see its doc comment). Not a real
   * credential store; replaced by Keycloak PKCE redirect in the auth step (Guide §7).
   */
  @Post('auth/login')
  async login(@Req() req: TenantScopedRequest, @Body() dto: LoginDto) {
    if (env.NODE_ENV === 'production') {
      throw new BadRequestException('Password login is not available — use SSO');
    }
    if (dto.password !== DEMO_LOGIN_PASSWORD) {
      throw new UnauthorizedException('Incorrect email or password');
    }
    const user = await withTenant(getPrisma(), req.tenantId, (tx) =>
      tx.user.findFirst({ where: { email: dto.email } }),
    );
    if (!user) throw new UnauthorizedException('Incorrect email or password');

    const profile = await loadDevUser(req.tenantId, dto.email);
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      permissions: profile.permissions,
      departmentId: profile.departmentId,
    };
  }
}
