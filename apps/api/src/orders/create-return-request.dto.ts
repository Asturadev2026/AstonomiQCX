import { IsString } from 'class-validator';

/** Public — Self-Service Portal's "Return / refund" form. No shared type: this
 * payload is local to the portal, same precedent as PortalPayload. */
export class CreateReturnRequestDto {
  @IsString() reason!: string;
}
