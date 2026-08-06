import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './create-department.dto';

/** Not guarded yet, same rationale as the other AI Studio/Service Ops controllers. */
@Controller('departments')
export class DepartmentsController {
  constructor(private svc: DepartmentsService) {}

  @Get()
  list(@Req() req: TenantScopedRequest) {
    return this.svc.list(req.tenantId);
  }

  @Post()
  create(@Req() req: TenantScopedRequest, @Body() dto: CreateDepartmentDto) {
    return this.svc.create(req.tenantId, dto);
  }
}
