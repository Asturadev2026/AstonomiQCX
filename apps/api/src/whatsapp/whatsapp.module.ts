import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';

@Module({
  imports: [AiModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
})
export class WhatsappModule {}
