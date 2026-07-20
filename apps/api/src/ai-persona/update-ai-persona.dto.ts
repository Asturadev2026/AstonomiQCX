import { IsIn, IsString } from 'class-validator';
import type { AiPersonaTone, UpdateAiPersonaDto as UpdateAiPersonaDtoShape } from '@aq/shared';

const TONES: AiPersonaTone[] = ['friendly', 'formal', 'concise', 'empathetic', 'playful'];

/** class-validator mirror of @aq/shared's UpdateAiPersonaDto — Guide §8.2/§10 pattern. */
export class UpdateAiPersonaDto implements UpdateAiPersonaDtoShape {
  @IsIn(TONES) tone!: AiPersonaTone;
  @IsString() description!: string;
}
