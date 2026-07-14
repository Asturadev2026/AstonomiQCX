import { Module } from '@nestjs/common';
import { MacrosService } from './macros.service';
import { MacrosController } from './macros.controller';

@Module({
  controllers: [MacrosController],
  providers: [MacrosService],
  exports: [MacrosService],
})
export class MacrosModule {}
