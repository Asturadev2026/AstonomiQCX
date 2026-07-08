import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtGuard, type AuthenticatedRequest } from '../auth/jwt.guard';
import { PermissionsGuard, Perms } from '../auth/permissions.guard';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './create-ticket.dto';
import { MoveTicketDto } from './move-ticket.dto';

/** Thin web layer — Guide §8.4. No business logic here, only routing + permissions. */
@Controller('tickets')
@UseGuards(JwtGuard, PermissionsGuard)
export class TicketsController {
  constructor(private svc: TicketsService) {}

  // No @Perms here — "view all" vs "view assigned" is a scoping business rule
  // the service applies from req.user.permissions, not a yes/no gate.
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.svc.list(req.tenantId, req.user);
  }

  @Get(':id')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.svc.getOne(req.tenantId, id, req.user);
  }

  @Perms('ticket.create')
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTicketDto) {
    return this.svc.create(req.tenantId, req.user.id, dto);
  }

  @Perms('ticket.move')
  @Patch(':id/move')
  move(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: MoveTicketDto) {
    return this.svc.move(req.tenantId, req.user.id, id, dto);
  }
}
