import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config/config'; // validated on import; fails fast on bad env

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(helmet()); // security headers
  // The web app normally talks same-origin via its Next rewrite, so CORS is off
  // by default; set CORS_ORIGIN to allow a browser origin to call the API direct.
  if (process.env.CORS_ORIGIN) {
    app.enableCors({ origin: process.env.CORS_ORIGIN.split(','), credentials: true });
  }
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks(); // flush Prisma / BullMQ on SIGTERM
  await app.listen(config.port);
  Logger.log(
    `SanKofa API on http://localhost:${config.port}/api (auth=${config.auth.mode}, env=${config.nodeEnv})`,
    'Bootstrap',
  );
}

void bootstrap();
