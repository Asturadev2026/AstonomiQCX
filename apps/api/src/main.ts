import { config } from 'dotenv';
import { resolve } from 'path';
// Monorepo root .env — apps/api has no .env of its own (Guide §5, Appendix A).
config({ path: resolve(__dirname, '../../../.env') });

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/response.interceptor';
// Imported after dotenv config() above so process.env is already populated when parsed.
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(env.API_PORT);
  // eslint-disable-next-line no-console
  console.log(`AstronomiQ API listening on :${env.API_PORT}`);
}

bootstrap();
