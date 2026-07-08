import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { verifyOidcToken, loadUser } from './oidc';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  title: string | null;
  departmentId: string | null;
  permissions: string[];
}

export interface AuthenticatedRequest extends TenantScopedRequest {
  user: AuthenticatedUser;
}

/** Verifies the Keycloak token on every protected request and attaches the user. */
@Injectable()
export class JwtGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<TenantScopedRequest>();
    const header = req.headers['authorization'] || '';
    const token = header.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('No login token');

    try {
      const claims = await verifyOidcToken(token);
      (req as AuthenticatedRequest).user = await loadUser(req.tenantId, claims.sub as string);
    } catch {
      throw new UnauthorizedException('Invalid or expired login token');
    }
    return true;
  }
}
