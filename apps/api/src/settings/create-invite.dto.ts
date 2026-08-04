import { IsEmail, IsOptional, IsString } from 'class-validator';
import type { CreateInviteDto as CreateInviteDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's CreateInviteDto. */
export class CreateInviteDto implements CreateInviteDtoShape {
  @IsEmail() email!: string;
  @IsOptional() @IsString() departmentId?: string;
}
