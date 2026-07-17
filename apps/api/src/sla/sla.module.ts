import { Global, Module } from '@nestjs/common';
import { SlaService } from './sla.service';
import { SlaController } from './sla.controller';

@Global()
@Module({
  controllers: [SlaController],
  providers: [SlaService],
  exports: [SlaService],
})
export class SlaModule {}
