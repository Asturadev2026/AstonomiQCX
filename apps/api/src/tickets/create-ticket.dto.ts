import { IsIn, IsOptional, IsString } from 'class-validator';
import { PRIORITIES } from '@aq/shared';
import type { CreateTicketDto as CreateTicketDtoShape, Priority } from '@aq/shared';

/** class-validator mirror of @aq/shared's CreateTicketDto — Guide §8.2/§10. */
export class CreateTicketDto implements CreateTicketDtoShape {
  @IsString() subject!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() conversationId?: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() departmentId?: string;
}
