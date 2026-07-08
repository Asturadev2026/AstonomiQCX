import { Global, Module } from '@nestjs/common';
import { RtGateway } from './rt.gateway';

@Global()
@Module({
  providers: [RtGateway],
  exports: [RtGateway],
})
export class RealtimeModule {}
