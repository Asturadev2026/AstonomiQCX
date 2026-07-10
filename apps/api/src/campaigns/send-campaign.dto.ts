import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { AUDIENCE_IDS, type AudienceId } from './campaigns.service';

export class SendCampaignDto {
  @IsIn(AUDIENCE_IDS)
  audienceId!: AudienceId;

  @IsString()
  @IsNotEmpty()
  message!: string;
}
