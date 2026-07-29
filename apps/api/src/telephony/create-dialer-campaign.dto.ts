import { IsOptional, IsString } from 'class-validator';
import type { CreateDialerCampaignDto as CreateDialerCampaignDtoShape } from '@aq/shared';

export class CreateDialerCampaignDto implements CreateDialerCampaignDtoShape {
  @IsString() name!: string;
  @IsOptional() @IsString() segment?: string;
}
