import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { verifyOidcToken, loadUser, loadDevUser } from './oidc';
import { env } from '../config/env';
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
    if (!token) {
      // Dev-only stand-in — see loadDevUser's doc comment. Gated on NODE_ENV so this
      // path is structurally unreachable in production regardless of any other bug.
      if (env.NODE_ENV === 'production') throw new UnauthorizedException('No login token');
      (req as AuthenticatedRequest).user = await loadDevUser(req.tenantId);
      return true;
    }

    try {
      const claims = await verifyOidcToken(token);
      (req as AuthenticatedRequest).user = await loadUser(req.tenantId, claims.sub as string);
    } catch {
      throw new UnauthorizedException('Invalid or expired login token');
    }
    return true;
  }
}
