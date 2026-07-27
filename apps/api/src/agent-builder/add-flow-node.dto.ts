import { IsIn, IsOptional, IsString } from 'class-validator';
import type { AddFlowNodeDto as AddFlowNodeDtoShape, FlowNodeType } from '@aq/shared';

const NODE_TYPES: FlowNodeType[] = ['trigger', 'detect_intent', 'fetch_data', 'ask_question', 'send_reply', 'human_handoff'];

/** class-validator mirror of @aq/shared's AddFlowNodeDto — Guide §8.2/§10 pattern. */
export class AddFlowNodeDto implements AddFlowNodeDtoShape {
  @IsIn(NODE_TYPES) type!: FlowNodeType;
  @IsOptional() @IsString() afterNodeId!: string | null;
}
