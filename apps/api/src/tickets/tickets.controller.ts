import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtGuard, type AuthenticatedRequest } from '../auth/jwt.guard';
import { PermissionsGuard, Perms } from '../auth/permissions.guard';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './create-ticket.dto';
import { MoveTicketDto } from './move-ticket.dto';
import { AssignTicketDto } from './assign-ticket.dto';

/**
 * Thin web layer — Guide §8.4. No business logic here, only routing + permissions.
 * Reads require a logged-in user (JwtGuard) so TicketsService.viewScope() can apply the
 * three-role scoping (Admin: all, Manager: their department, Agent: their own) — but no
 * specific @Perms, since "can I view at all" is itself role-dependent and enforced in the
 * service. by-ref stays fully public — it's the Self-Service Portal's ticket tracker.
 */
@Controller('tickets')
export class TicketsController {
  constructor(private svc: TicketsService) {}

  @UseGuards(JwtGuard)
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.svc.list(req.tenantId, req.user);
  }

  @Get('by-ref/:extRef')
  getByRef(@Req() req: TenantScopedRequest, @Param('extRef') extRef: string) {
    return this.svc.getByRef(req.tenantId, extRef);
  }

  @UseGuards(JwtGuard)
  @Get(':id')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getOne(req.tenantId, id, req.user);
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

  /** Manager/Admin's ticket reassignment (Team queue management). */
  @UseGuards(JwtGuard, PermissionsGuard)
  @Perms('ticket.assign')
  @Patch(':id/assign')
  assign(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: AssignTicketDto) {
    return this.svc.assign(req.tenantId, req.user.id, id, dto.assignedUserId ?? null);
  }

  /** Manager/Admin's refund/return approval workflow. */
  @UseGuards(JwtGuard, PermissionsGuard)
  @Perms('refund.approve')
  @Patch(':id/refund/approve')
  approveRefund(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.approveRefund(req.tenantId, req.user.id, id);
  }

  @UseGuards(JwtGuard, PermissionsGuard)
  @Perms('refund.approve')
  @Patch(':id/refund/reject')
  rejectRefund(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.rejectRefund(req.tenantId, req.user.id, id);
  }
}
