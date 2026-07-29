import { IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { IvrNodeConfig, UpdateIvrNodeDto as UpdateIvrNodeDtoShape } from '@aq/shared';

class IvrNodeConfigInput implements IvrNodeConfig {
  @IsOptional() @IsString() message?: string;
  @IsOptional() @IsObject() branches?: Record<string, string>;
  @IsOptional() @IsString() forwardTo?: string;
}

/** class-validator mirror of @aq/shared's UpdateIvrNodeDto — Guide §8.2/§10 pattern. */
export class UpdateIvrNodeDto implements UpdateIvrNodeDtoShape {
  @ValidateNested() @Type(() => IvrNodeConfigInput) config!: IvrNodeConfig;
}
