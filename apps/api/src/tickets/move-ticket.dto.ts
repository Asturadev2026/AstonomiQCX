import { IsIn } from 'class-validator';
import { TICKET_STATUSES } from '@aq/shared';
import type { MoveTicketDto as MoveTicketDtoShape, TicketStatus } from '@aq/shared';

/** class-validator mirror of @aq/shared's MoveTicketDto — Guide §8.2/§10. */
export class MoveTicketDto implements MoveTicketDtoShape {
  @IsIn(TICKET_STATUSES) status!: TicketStatus;
}
