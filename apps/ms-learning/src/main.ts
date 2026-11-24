import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { configureHttpApp, runMigrationsWithLock } from '@cka/service-kit';
import { AppModule } from './app.module';
import { Env } from './config/env';
import { LEARNING_MIGRATION_LOCK } from './database/typeorm-options';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const env = app.get(Env);

  configureHttpApp(app, {
    globalPrefix: 'api/learning',
    excludeFromPrefix: [
      { path: 'healthz', method: RequestMethod.GET },
      { path: 'readyz', method: RequestMethod.GET },
    ],
    trustProxyHops: env.TRUST_PROXY_HOPS,
    swagger: {
      enabled: env.SWAGGER_ENABLED,
      title: 'CKA Lab — learning',
      description: 'Curriculum, progress, labs, quizzes, mock exams. Cookie-authenticated via ms-identity tokens.',
    },
  });

  if (env.DATABASE_MIGRATIONS_RUN) {
    await runMigrationsWithLock(app.get(DataSource), LEARNING_MIGRATION_LOCK, msg => logger.log(msg, 'Migrations'));
  }

  await app.listen(env.PORT, '0.0.0.0');
  logger.log(`ms-learning listening on :${env.PORT}`, 'Bootstrap');
}

bootstrap().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
