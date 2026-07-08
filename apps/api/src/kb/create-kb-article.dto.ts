import { IsOptional, IsString } from 'class-validator';
import type { CreateKbArticleDto as CreateKbArticleDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's CreateKbArticleDto — Guide §8.2/§10. */
export class CreateKbArticleDto implements CreateKbArticleDtoShape {
  @IsString() title!: string;
  @IsString() body!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() language?: string;
}
