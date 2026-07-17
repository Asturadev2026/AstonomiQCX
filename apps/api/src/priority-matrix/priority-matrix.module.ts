import { Module } from '@nestjs/common';
import { PriorityMatrixService } from './priority-matrix.service';
import { PriorityMatrixController } from './priority-matrix.controller';

@Module({
  controllers: [PriorityMatrixController],
  providers: [PriorityMatrixService],
  exports: [PriorityMatrixService],
})
export class PriorityMatrixModule {}
