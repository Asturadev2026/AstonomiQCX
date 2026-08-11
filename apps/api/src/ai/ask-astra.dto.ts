import { IsIn, IsOptional, IsString } from 'class-validator';
import type { AskAstraDto as AskAstraDtoShape, SupportedLanguage } from '@aq/shared';

/** class-validator mirror of @aq/shared's AskAstraDto — Guide §8.2/§10. */
export class AskAstraDto implements AskAstraDtoShape {
  @IsString() question!: string;
  @IsOptional() @IsIn(['en', 'hi', 'auto']) language?: SupportedLanguage;
  @IsOptional() @IsIn(['chat', 'whatsapp', 'voice']) channel?: 'chat' | 'whatsapp' | 'voice';
  @IsOptional() @IsString() contactId?: string;
}
