import { loadSecrets } from './config/load-secrets';

loadSecrets();

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cookie-based sessions (Section 2, docs/stages/01-auth-and-email-setup.md)
  // need the raw cookie readable on every request.
  app.use(cookieParser());

  // DTOs use class-validator decorators for request validation — see
  // CLAUDE.md's coding conventions.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // web and api are different origins in dev (and possibly in
  // production, depending on deployment topology) — cookies with
  // credentials need this to flow between them.
  app.enableCors({
    origin: process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = process.env.API_PORT ?? process.env.PORT ?? 4000;
  await app.listen(port);
}

void bootstrap();
