import { IsString } from 'class-validator';
import type { SendTestCallDto as SendTestCallDtoShape } from '@aq/shared';

export class SendTestCallDto implements SendTestCallDtoShape {
  @IsString() toNumber!: string;
}
