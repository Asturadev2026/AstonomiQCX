import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { FlowNodeConfig, UpdateFlowNodeDto as UpdateFlowNodeDtoShape } from '@aq/shared';

class FlowNodeConfigInput implements FlowNodeConfig {
  @IsOptional() @IsArray() @IsString({ each: true }) intents?: string[];
  @IsOptional() @IsString() question?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() condition?: string;
}

/** class-validator mirror of @aq/shared's UpdateFlowNodeDto — Guide §8.2/§10 pattern. */
export class UpdateFlowNodeDto implements UpdateFlowNodeDtoShape {
  @ValidateNested() @Type(() => FlowNodeConfigInput) config!: FlowNodeConfig;
}
