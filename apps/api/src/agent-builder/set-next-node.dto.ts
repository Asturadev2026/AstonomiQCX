import { IsOptional, IsString } from 'class-validator';
import type { SetNextNodeDto as SetNextNodeDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's SetNextNodeDto — Guide §8.2/§10 pattern. */
export class SetNextNodeDto implements SetNextNodeDtoShape {
  @IsOptional() @IsString() nextId!: string | null;
}
