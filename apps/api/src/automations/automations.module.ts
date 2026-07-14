import { Module } from '@nestjs/common';
import { RulesService } from './rules.service';
import { RuleEngineService } from './rule-engine.service';
import { RulesController } from './rules.controller';

@Module({
  controllers: [RulesController],
  providers: [RulesService, RuleEngineService],
  exports: [RulesService, RuleEngineService],
})
export class AutomationsModule {}
