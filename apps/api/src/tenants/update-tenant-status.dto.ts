import { IsIn } from 'class-validator';
import { TENANT_STATUSES } from '@aq/shared';
import type { UpdateTenantStatusDto as UpdateTenantStatusDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's UpdateTenantStatusDto. */
export class UpdateTenantStatusDto implements UpdateTenantStatusDtoShape {
  @IsIn(TENANT_STATUSES) status!: UpdateTenantStatusDtoShape['status'];
}
