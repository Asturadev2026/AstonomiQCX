import { IsOptional, IsString } from 'class-validator';
import type { CreateMacroDto as CreateMacroDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's CreateMacroDto. */
export class CreateMacroDto implements CreateMacroDtoShape {
  @IsString() title!: string;
  @IsString() body!: string;
  @IsOptional() @IsString() category?: string;
}
