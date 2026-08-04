import { IsIn } from 'class-validator';
import type { UpdateUserRoleDto as UpdateUserRoleDtoShape } from '@aq/shared';
import { UI_ROLES } from '@aq/shared';

/** class-validator mirror of @aq/shared's UpdateUserRoleDto. */
export class UpdateUserRoleDto implements UpdateUserRoleDtoShape {
  @IsIn(UI_ROLES)
  roleName!: 'Admin' | 'Manager' | 'Executive';
}
