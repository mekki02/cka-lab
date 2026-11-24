import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { configureHttpApp, runMigrationsWithLock } from '@cka/service-kit';
import { AppModule } from './app.module';
import { Env } from './config/env';
import { IDENTITY_MIGRATION_LOCK } from './database/typeorm-options';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const env = app.get(Env);

  configureHttpApp(app, {
    globalPrefix: 'api/identity',
    excludeFromPrefix: [
      { path: 'healthz', method: RequestMethod.GET },
      { path: 'readyz', method: RequestMethod.GET },
      { path: '.well-known/jwks.json', method: RequestMethod.GET },
    ],
    trustProxyHops: env.TRUST_PROXY_HOPS,
    swagger: {
      enabled: env.SWAGGER_ENABLED,
      title: 'CKA Lab — identity',
      description: 'Users, invitations, sessions. Cookie-authenticated; mutating calls need the x-csrf-token header.',
    },
  });

  if (env.DATABASE_MIGRATIONS_RUN) {
    await runMigrationsWithLock(app.get(DataSource), IDENTITY_MIGRATION_LOCK, msg => logger.log(msg, 'Migrations'));
  }

  await app.listen(env.PORT, '0.0.0.0');
  logger.log(`ms-identity listening on :${env.PORT} (public URL ${env.PUBLIC_URL})`, 'Bootstrap');
}

bootstrap().catch(err => {
  // Before the logger exists (e.g. invalid env) — print and exit non-zero so
  // the orchestrator shows the failure instead of a silently hung container.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
