import { Module } from '@nestjs/common';
import { FieldServiceService } from './field-service.service';
import { FieldServiceController } from './field-service.controller';

@Module({
  controllers: [FieldServiceController],
  providers: [FieldServiceService],
  exports: [FieldServiceService],
})
export class FieldServiceModule {}
