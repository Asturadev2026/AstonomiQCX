import { IsArray, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import type { CreateRuleDto as CreateRuleDtoShape } from '@aq/shared';
import { TICKET_RULE_TRIGGERS } from './default-rules';

/** class-validator mirror of @aq/shared's CreateRuleDto — Guide §8.2/§12 pattern. */
export class CreateRuleDto implements CreateRuleDtoShape {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(TICKET_RULE_TRIGGERS) trigger!: string;
  @IsObject() conditions!: CreateRuleDtoShape['conditions'];
  @IsArray() actions!: CreateRuleDtoShape['actions'];
}
