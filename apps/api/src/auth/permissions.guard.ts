import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './jwt.guard';

export const Perms = (...perms: string[]) => SetMetadata('perms', perms);

/** Checks the logged-in user's permissions against what an action requires. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const needed = this.reflector.get<string[]>('perms', ctx.getHandler()) || [];
    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    const has = user?.permissions || [];
    // '*' means "can do everything" (Admin)
    const allowed = has.includes('*') || needed.every((p) => has.includes(p));
    if (!allowed) throw new ForbiddenException('You do not have permission for this');
    return true;
  }
}
