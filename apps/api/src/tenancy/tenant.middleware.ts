import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { getPrisma } from '@aq/db';

export interface TenantScopedRequest extends Request {
  tenantId: string;
  tenantName: string;
}

/**
 * Finds the company for a request (Guide §6.2) — from the subdomain in
 * production (e.g. shopnova.app.astronomiq.in), or from an `x-tenant` header
 * for local dev, where the Vite proxy strips the browser's real Host before
 * forwarding to the API (changeOrigin: true in apps/web/vite.config.ts).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  async use(req: Request, _res: Response, next: NextFunction) {
    // Channel webhooks (Guide §13) come from Meta, not a browser — there's no
    // subdomain/x-tenant to resolve from. Those routes resolve their own
    // tenant from the channel's identity (e.g. WhatsApp's phone_number_id).
    // req.path is relative to Nest's internal router mount (always "/" here,
    // regardless of the real endpoint) — req.originalUrl preserves the full
    // requested path, which is what we actually need to match on.
    if (req.originalUrl.includes('/webhooks/')) {
      return next();
    }

    const subdomain =
      (req.headers['x-tenant'] as string) ||
      ((req.headers['x-forwarded-host'] as string) || req.hostname).split('.')[0];

    const tenant = await getPrisma().tenant.findUnique({ where: { subdomain } });
    if (!tenant || tenant.status !== 'active') {
      throw new NotFoundException('Workspace not found');
    }
    (req as TenantScopedRequest).tenantId = tenant.id;
    (req as TenantScopedRequest).tenantName = tenant.name;
    next();
  }
}
