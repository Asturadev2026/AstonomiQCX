import { BadRequestException, Body, Controller, Get, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { TranscribeResponseDto, VoiceStatusDto } from '@aq/shared';
import { VoiceNotConfiguredError, VoiceService } from './voice.service';

/**
 * Standalone, independently testable STT/TTS endpoints (Guide §10.5/§10.6) —
 * not guarded yet, same rationale as KbController/AiController.
 */
@Controller('voice')
export class VoiceController {
  constructor(private svc: VoiceService) {}

  /** Lets the frontend pick real Sarvam/ElevenLabs vs. the browser-speech fallback once per call. */
  @Get('status')
  status(): VoiceStatusDto {
    return { sttConfigured: this.svc.isSttConfigured(), ttsConfigured: this.svc.isTtsConfigured() };
  }

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('file'))
  async transcribe(@UploadedFile() file: Express.Multer.File): Promise<TranscribeResponseDto> {
    if (!file) throw new BadRequestException('No audio file uploaded (multipart field name: "file")');
    try {
      return await this.svc.transcribeAudio(file.buffer, file.originalname, file.mimetype);
    } catch (err) {
      if (err instanceof VoiceNotConfiguredError) {
        return { transcript: '', languageCode: null, configured: false };
      }
      throw err;
    }
  }

  /** Returns raw audio/mpeg bytes — bypasses the {data:...} envelope via @Res(). */
  @Post('synthesize')
  async synthesize(@Body('text') text: string, @Res() res: Response): Promise<void> {
    if (!text?.trim()) throw new BadRequestException('text is required');
    try {
      const audio = await this.svc.synthesizeSpeech(text);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.send(audio);
    } catch (err) {
      if (err instanceof VoiceNotConfiguredError) {
        res.status(503).json({ data: { configured: false } });
        return;
      }
      throw err;
    }
  }
}
