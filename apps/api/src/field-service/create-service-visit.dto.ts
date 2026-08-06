import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import type { CreateServiceVisitDto as CreateServiceVisitDtoShape } from '@aq/shared';

const VISIT_KINDS = ['installation', 'repair', 'amc', 'pickup'];

/** class-validator mirror of @aq/shared's CreateServiceVisitDto — Guide §8.2/§10 pattern. */
export class CreateServiceVisitDto implements CreateServiceVisitDtoShape {
  @IsIn(VISIT_KINDS) kind!: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() address?: string;
  @IsISO8601() slot!: string;
  @IsOptional() @IsString() technician?: string;
}
