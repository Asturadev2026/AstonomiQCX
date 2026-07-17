import { IsString } from 'class-validator';
import type { ReplyMessageDto as ReplyMessageDtoShape } from '@aq/shared';

/** class-validator mirror of @aq/shared's ReplyMessageDto — Guide §8.2/§10. */
export class ReplyMessageDto implements ReplyMessageDtoShape {
  @IsString() text!: string;
}
