import { Module } from '@nestjs/common';
import { AiPersonaModule } from '../ai-persona/ai-persona.module';
import { KbModule } from '../kb/kb.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AgentFlowService } from './agent-flow.service';
import { FlowExecutionService } from './flow-execution.service';
import { AgentFlowController } from './agent-flow.controller';

@Module({
  imports: [KbModule, TicketsModule, AiPersonaModule],
  controllers: [AgentFlowController],
  providers: [AgentFlowService, FlowExecutionService],
  exports: [AgentFlowService, FlowExecutionService],
})
export class AgentBuilderModule {}
