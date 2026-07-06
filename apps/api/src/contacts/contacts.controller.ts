import { Body, Controller, Get, NotFoundException, Param, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './create-contact.dto';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly svc: ContactsService) {}

  @Post()
  create(@Req() req: TenantScopedRequest, @Body() dto: CreateContactDto) {
    return this.svc.create(req.tenantId, dto);
  }

  // Declared before ':id' — otherwise Nest would match "latest" as an :id param.
  @Get('latest')
  async latest(@Req() req: TenantScopedRequest) {
    const id = await this.svc.getLatestId(req.tenantId);
    if (!id) throw new NotFoundException('No customers yet — add one from Customer 360');
    return this.svc.getProfile(req.tenantId, id);
  }

  @Get(':id')
  profile(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.getProfile(req.tenantId, id);
  }

  @Get(':id/orders')
  orders(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.getOrders(req.tenantId, id);
  }

  @Get(':id/tickets')
  tickets(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.getTickets(req.tenantId, id);
  }

  @Get(':id/timeline')
  timeline(@Req() req: TenantScopedRequest, @Param('id') id: string) {
    return this.svc.getTimeline(req.tenantId, id);
  }
}
