import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtGuard, type AuthenticatedRequest } from '../auth/jwt.guard';
import { PermissionsGuard, Perms } from '../auth/permissions.guard';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './create-ticket.dto';
import { MoveTicketDto } from './move-ticket.dto';

/**
 * Thin web layer — Guide §8.4. No business logic here, only routing + permissions.
 * Reads are unguarded (same rationale as Contacts/Journey/Conversations — no login
 * flow wired into apps/web yet, see pages/Login.tsx); the service defaults to
 * "view all" with no authenticated user. Writes stay behind JwtGuard+PermissionsGuard
 * since ticket.create/move need a real user for audit logging and assignment.
 */
@Controller('tickets')
export class TicketsController {
  constructor(private svc: TicketsService) {}

  @Get()
  list(@Req() req: TenantScopedRequest) {
    return this.svc.list(req.tenantId);
  }

  @Get(':id')
  getOne(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.getOne(req.tenantId, id);
  }

  @UseGuards(JwtGuard, PermissionsGuard)
  @Perms('ticket.create')
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTicketDto) {
    return this.svc.create(req.tenantId, req.user.id, dto);
  }

  @UseGuards(JwtGuard, PermissionsGuard)
  @Perms('ticket.move')
  @Patch(':id/move')
  move(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: MoveTicketDto) {
    return this.svc.move(req.tenantId, req.user.id, id, dto);
  }
}
