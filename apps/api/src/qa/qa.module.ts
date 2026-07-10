import { Module } from '@nestjs/common';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';

@Module({
  controllers: [QaController],
  providers: [QaService],
})
export class QaModule {}
