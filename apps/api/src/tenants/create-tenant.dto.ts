import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { TENANT_PLANS } from '@aq/shared';
import type { CreateTenantDto as CreateTenantDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's CreateTenantDto. */
export class CreateTenantDto implements CreateTenantDtoShape {
  @IsString() name!: string;
  @Matches(/^[a-z0-9-]+$/, { message: 'subdomain must be lowercase letters, numbers and hyphens only' })
  subdomain!: string;
  @IsOptional() @IsIn(TENANT_PLANS) plan?: CreateTenantDtoShape['plan'];
}
