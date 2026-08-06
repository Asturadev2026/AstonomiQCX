import { IsOptional, IsString } from 'class-validator';
import type { CreateDepartmentDto as CreateDepartmentDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's CreateDepartmentDto — Guide §8.2/§10 pattern. */
export class CreateDepartmentDto implements CreateDepartmentDtoShape {
  @IsString() name!: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsString() color?: string;
}
