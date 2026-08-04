import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { OrdersService } from './orders.service';
import { CreateReturnRequestDto } from './create-return-request.dto';

/** Public — the Self-Service Portal is customer-facing and unauthenticated by design. */
@Controller('orders')
export class OrdersController {
  constructor(private svc: OrdersService) {}

  @Get(':extRef')
  findByRef(@Req() req: TenantScopedRequest, @Param('extRef') extRef: string) {
    return this.svc.findByRef(req.tenantId, extRef);
  }

  @Post(':extRef/return')
  requestReturn(@Req() req: TenantScopedRequest, @Param('extRef') extRef: string, @Body() dto: CreateReturnRequestDto) {
    return this.svc.requestReturn(req.tenantId, extRef, dto.reason);
  }
}
