import { Module } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { VoiceController } from './voice.controller';

@Module({
  controllers: [VoiceController],
  providers: [VoiceService],
})
export class VoiceModule {}
