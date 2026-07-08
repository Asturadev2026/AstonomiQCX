import { Module } from '@nestjs/common';
import { KbModule } from '../kb/kb.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  imports: [KbModule, TicketsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
