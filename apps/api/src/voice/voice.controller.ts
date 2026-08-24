import { BadRequestException, Body, Controller, Get, Logger, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { TranscribeResponseDto, VoiceStatusDto } from '@aq/shared';
import { STREAM_SAMPLE_RATE, VoiceNotConfiguredError, VoiceService } from './voice.service';

/**
 * Standalone, independently testable STT/TTS endpoints (Guide §10.5/§10.6) —
 * not guarded yet, same rationale as KbController/AiController.
 */
@Controller('voice')
export class VoiceController {
  private readonly logger = new Logger(VoiceController.name);

  constructor(private svc: VoiceService) {}

  /** Lets the frontend pick real Sarvam STT/TTS vs. the browser-speech fallback once per call. */
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

  /**
   * Returns raw audio/mpeg bytes on success — bypasses the {data:...} envelope via @Res().
   * On failure, returns a JSON body with a real reason (Sarvam auth/quota/request error, etc.)
   * instead of a bare 500, so the caller can show something more useful than "not connected".
   * Kept as a simple non-streaming fallback alongside /synthesize/stream below.
   */
  @Post('synthesize')
  async synthesize(@Body('text') text: string, @Res() res: Response): Promise<void> {
    if (!text?.trim()) throw new BadRequestException('text is required');
    try {
      const audio = await this.svc.synthesizeSpeech(text);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.send(audio);
    } catch (err) {
      if (err instanceof VoiceNotConfiguredError) {
        res.status(503).json({ data: { configured: false }, error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sarvam TTS failed: ${message}`);
      res.status(502).json({ data: { configured: true }, error: message });
    }
  }

  /**
   * Streams raw linear16 PCM chunks (see VoiceService.synthesizeSpeechStream) as
   * `application/octet-stream`, `X-Sample-Rate` telling the caller how to interpret the bytes.
   * The primary path for Voice AI — cuts time-to-first-audible-sound from several seconds to
   * roughly half a second by playing the first chunk while the rest is still generating,
   * instead of waiting for the complete file like /synthesize above.
   *
   * If Sarvam fails before any chunk was sent, this returns a normal JSON error response like
   * /synthesize. If it fails mid-stream (rare — after some audio already went out), headers are
   * already committed, so the response is just ended early; the client's reader sees a short
   * stream rather than a clean error, which is an acceptable degradation for a demo call.
   */
  @Post('synthesize/stream')
  async synthesizeStream(@Body('text') text: string, @Res() res: Response): Promise<void> {
    if (!text?.trim()) throw new BadRequestException('text is required');
    try {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('X-Sample-Rate', String(STREAM_SAMPLE_RATE));
      res.setHeader('Cache-Control', 'no-store');
      for await (const chunk of this.svc.synthesizeSpeechStream(text)) {
        res.write(chunk);
      }
      res.end();
    } catch (err) {
      if (err instanceof VoiceNotConfiguredError) {
        if (res.headersSent) {
          res.end();
          return;
        }
        res.status(503).json({ data: { configured: false }, error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sarvam TTS stream failed: ${message}`);
      if (res.headersSent) {
        res.end();
        return;
      }
      res.status(502).json({ data: { configured: true }, error: message });
    }
  }
}
