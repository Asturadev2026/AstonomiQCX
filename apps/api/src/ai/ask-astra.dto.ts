import { IsIn, IsOptional, IsString } from 'class-validator';
import type { AskAstraDto as AskAstraDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's AskAstraDto — Guide §8.2/§10. */
export class AskAstraDto implements AskAstraDtoShape {
  @IsString() question!: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsIn(['chat', 'whatsapp', 'voice']) channel?: 'chat' | 'whatsapp' | 'voice';
}
