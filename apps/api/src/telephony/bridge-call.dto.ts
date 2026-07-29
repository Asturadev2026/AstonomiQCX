import { IsString } from 'class-validator';
import type { BridgeCallDto as BridgeCallDtoShape } from '@aq/shared';

export class BridgeCallDto implements BridgeCallDtoShape {
  @IsString() fromNumber!: string;
  @IsString() toNumber!: string;
}
