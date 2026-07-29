import { IsOptional, IsString } from 'class-validator';
import type { SetIvrNextDto as SetIvrNextDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's SetIvrNextDto — Guide §8.2/§10 pattern. */
export class SetIvrNextDto implements SetIvrNextDtoShape {
  @IsOptional() @IsString() nextId!: string | null;
}
