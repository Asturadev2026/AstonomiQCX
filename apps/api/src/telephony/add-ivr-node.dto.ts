import { IsIn, IsOptional, IsString } from 'class-validator';
import type { AddIvrNodeDto as AddIvrNodeDtoShape, IvrNodeType } from '@aq/shared';

const NODE_TYPES: IvrNodeType[] = ['play', 'menu', 'forward', 'voicemail', 'hangup'];

/** class-validator mirror of @aq/shared's AddIvrNodeDto — Guide §8.2/§10 pattern. */
export class AddIvrNodeDto implements AddIvrNodeDtoShape {
  @IsIn(NODE_TYPES) type!: IvrNodeType;
  @IsOptional() @IsString() afterNodeId!: string | null;
}
