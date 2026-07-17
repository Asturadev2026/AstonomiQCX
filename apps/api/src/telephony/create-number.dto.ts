import { IsOptional, IsString } from 'class-validator';
import type { CreateNumberDidDto as CreateNumberDidDtoShape } from '@aq/shared';

export class CreateNumberDto implements CreateNumberDidDtoShape {
  @IsString() number!: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() mappedTo?: string;
}
