import { IsOptional, IsUUID } from 'class-validator';

/** Body for PATCH /tickets/:id/assign — Manager/Admin's ticket reassignment. */
export class AssignTicketDto {
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;
}
