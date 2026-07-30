import { IsOptional, IsString } from 'class-validator';
import type { UpdateKbArticleDto as UpdateKbArticleDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's UpdateKbArticleDto — Guide §8.2/§10. */
export class UpdateKbArticleDto implements UpdateKbArticleDtoShape {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() language?: string;
}
