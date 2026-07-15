import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config/config'; // validated on import; fails fast on bad env

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  await app.listen(config.port);
  Logger.log(
    `SanKofa API on http://localhost:${config.port}/api (auth=${config.auth.mode}, env=${config.nodeEnv})`,
    'Bootstrap',
  );
}

void bootstrap();
