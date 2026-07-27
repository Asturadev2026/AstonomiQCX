import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { verifyOidcToken, loadUser } from './oidc';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** Not guarded yet — same rationale as every other controller. Unlike them,
 * this one still tries a real token first (so it's forward-compatible once
 * Keycloak login lands), falling back to a generic dev user so the Topbar
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
        return { name: user.name, initials: initials(user.name), title: user.title || '', tenantName: req.tenantName };
      } catch {
        // Falls through to the dev fallback below.
      }
    }
    return { name: 'Demo User', initials: 'DU', title: 'Workspace Member', tenantName: req.tenantName };
  }
}
