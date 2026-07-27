import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './create-tenant.dto';
import { UpdateTenantStatusDto } from './update-tenant-status.dto';

/** Not guarded yet — same rationale as every other controller (no auth wired up yet). */
@Controller('tenants')
export class TenantsController {
  constructor(private readonly svc: TenantsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.svc.create(dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.svc.updateStatus(id, dto);
  }
}
