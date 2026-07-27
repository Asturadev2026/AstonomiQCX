import { IsOptional, IsString } from 'class-validator';
import type { MoveFlowNodeDto as MoveFlowNodeDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's MoveFlowNodeDto — Guide §8.2/§10 pattern. */
export class MoveFlowNodeDto implements MoveFlowNodeDtoShape {
  @IsOptional() @IsString() afterNodeId!: string | null;
}
