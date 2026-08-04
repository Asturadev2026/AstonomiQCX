import { IsNumber, IsOptional, IsString } from 'class-validator';
import type { CreateSlaPolicyDto as CreateSlaPolicyDtoShape } from '@aq/shared';

export class CreateSlaPolicyDto implements CreateSlaPolicyDtoShape {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  priority?: string | null;

  @IsOptional()
  @IsString()
  channel?: string | null;

  @IsOptional()
  @IsString()
  segment?: string | null;

  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @IsNumber()
  firstResponseMins!: number;

  @IsNumber()
  resolutionMins!: number;
}
