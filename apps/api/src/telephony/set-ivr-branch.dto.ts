import { IsIn, IsOptional, IsString } from 'class-validator';
import type { SetIvrBranchDto as SetIvrBranchDtoShape } from '@aq/shared';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#'];

/** class-validator mirror of @aq/shared's SetIvrBranchDto — Guide §8.2/§10 pattern. */
export class SetIvrBranchDto implements SetIvrBranchDtoShape {
  @IsIn(DIGITS) digit!: string;
  @IsOptional() @IsString() nextId!: string | null;
}
