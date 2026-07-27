import type { TenantPlan, TenantStatus } from '../constants';

/** GET /tenants — workspace picker (login) and Tenants admin page. */
export interface TenantDto {
  id: string;
  name: string;
  subdomain: string;
  plan: TenantPlan;
  status: TenantStatus;
  createdAt: string;
}

/** POST /tenants */
export interface CreateTenantDto {
  name: string;
  subdomain: string;
  plan?: TenantPlan;
}

/** PATCH /tenants/:id/status */
export interface UpdateTenantStatusDto {
  status: TenantStatus;
}
