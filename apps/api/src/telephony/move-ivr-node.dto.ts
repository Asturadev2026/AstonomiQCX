import { IsOptional, IsString } from 'class-validator';
import type { MoveIvrNodeDto as MoveIvrNodeDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's MoveIvrNodeDto — Guide §8.2/§10 pattern. */
export class MoveIvrNodeDto implements MoveIvrNodeDtoShape {
  @IsOptional() @IsString() afterNodeId!: string | null;
}
