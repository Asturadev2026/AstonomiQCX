import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { getPrisma } from '@aq/db';

export interface TenantScopedRequest extends Request {
  tenantId: string;
}

/**
 * TODO(Phase B — Guide §7/§8): resolve tenant from subdomain and verify the
 * Keycloak JWT (JwtGuard + PermissionsGuard per the Tickets pattern).
 * Neither exists yet — apps/web's Login page has no real auth flow either
 * (it opens the workspace without verification). Until then, this is a
 * single-tenant local-dev stand-in: every request is scoped to the one
 * seeded tenant (`pnpm --filter @aq/db seed`).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  async use(req: Request, _res: Response, next: NextFunction) {
    const tenant = await getPrisma().tenant.findFirst();
    if (!tenant) {
      throw new NotFoundException(
        'No tenant seeded — run `pnpm --filter @aq/db seed`',
      );
    }
    (req as TenantScopedRequest).tenantId = tenant.id;
    next();
  }
}
