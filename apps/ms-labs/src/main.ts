import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Server } from 'node:http';
import { Logger } from 'nestjs-pino';
import { configureHttpApp } from '@cka/service-kit';
import { AppModule } from './app.module';
import { Env } from './config/env';
import { TerminalServer } from './terminal/terminal.server';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const env = app.get(Env);

  configureHttpApp(app, {
    globalPrefix: 'api/labs',
    excludeFromPrefix: [
      { path: 'healthz', method: RequestMethod.GET },
      { path: 'readyz', method: RequestMethod.GET },
    ],
    trustProxyHops: env.TRUST_PROXY_HOPS,
    swagger: {
      enabled: env.SWAGGER_ENABLED,
      title: 'CKA Lab — labs',
      description: 'Per-student lab clusters, browser terminal (WebSocket), server-side checks.',
    },
  });

  // The terminal is a raw WebSocket on the same HTTP server and port.
  app.get(TerminalServer).attach(app.getHttpServer() as Server);

  await app.listen(env.PORT, '0.0.0.0');
  logger.log(`ms-labs listening on :${env.PORT}`, 'Bootstrap');
}

bootstrap().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
