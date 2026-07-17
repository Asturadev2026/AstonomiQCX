import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { MentionsController } from './mentions.controller';
import { MentionsService } from './mentions.service';

@Module({
  imports: [TicketsModule],
  controllers: [MentionsController],
  providers: [MentionsService],
})
export class MentionsModule {}
