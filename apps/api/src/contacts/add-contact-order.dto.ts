import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ORDER_STATUSES } from '@aq/shared';
import type { AddContactOrderDto as AddContactOrderDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's AddContactOrderDto. */
export class AddContactOrderDto implements AddContactOrderDtoShape {
  @IsString() description!: string;
  @IsIn(ORDER_STATUSES) status!: AddContactOrderDtoShape['status'];
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsNumber() @Min(1) qty?: number;
}
