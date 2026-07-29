import { Module } from '@nestjs/common';
import { TelephonyService } from './telephony.service';
import { TelephonyController } from './telephony.controller';
import { IvrFlowService } from './ivr-flow.service';
import { IvrFlowController } from './ivr-flow.controller';
import { IvrFlowExecutionService } from './ivr-flow-execution.service';
import { ExotelWebhookService } from './exotel-webhook.service';
import { ExotelWebhookController } from './exotel-webhook.controller';

@Module({
  controllers: [TelephonyController, IvrFlowController, ExotelWebhookController],
  providers: [TelephonyService, IvrFlowService, IvrFlowExecutionService, ExotelWebhookService],
  exports: [TelephonyService, IvrFlowService],
})
export class TelephonyModule {}
