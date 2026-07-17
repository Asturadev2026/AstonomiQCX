import { Controller, Get, Req } from '@nestjs/common';
import type { TenantScopedRequest } from '../tenancy/tenant.middleware';
import { ContactCentreService } from './contact-centre.service';

/** Not guarded yet, same rationale as the other AI Studio/Service Ops controllers. */
@Controller('contact-centre')
export class ContactCentreController {
  constructor(private svc: ContactCentreService) {}

  @Get('kpis')
  kpis(@Req() req: TenantScopedRequest) {
    return this.svc.kpis(req.tenantId);
  }

  @Get('ivr-menu')
  ivrMenu() {
    return this.svc.ivrMenu();
  }
}
