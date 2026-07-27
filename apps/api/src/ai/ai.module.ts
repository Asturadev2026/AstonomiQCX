import { Module } from '@nestjs/common';
import { AgentBuilderModule } from '../agent-builder/agent-builder.module';
import { KbModule } from '../kb/kb.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  imports: [KbModule, TicketsModule, AgentBuilderModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
