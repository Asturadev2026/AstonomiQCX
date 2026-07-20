import { Module } from '@nestjs/common';
import { AiPersonaService } from './ai-persona.service';
import { AiPersonaController } from './ai-persona.controller';

@Module({
  controllers: [AiPersonaController],
  providers: [AiPersonaService],
  exports: [AiPersonaService],
})
export class AiPersonaModule {}
