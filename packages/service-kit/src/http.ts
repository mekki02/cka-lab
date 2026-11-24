import { ValidationPipe, type INestApplication, type RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

export interface HttpOptions {
  /** e.g. "api/identity" — what the Ingress routes to this service. */
  globalPrefix: string;
  /** Routes served outside the prefix: health probes, JWKS. Cluster-internal only. */
  excludeFromPrefix: { path: string; method: RequestMethod }[];
  trustProxyHops: number;
  swagger?: { enabled: boolean; title: string; description: string };
}

/**
 * The HTTP setup every service shares:
 *
 * - global prefix, so the Ingress can route by path and the probes stay
 *   unreachable from outside (they are not under the prefix);
 * - `trust proxy` so req.ip is the client, not the Ingress controller;
 * - security headers (helmet), cookie parsing;
 * - strict DTO validation: unknown properties are rejected, not ignored;
 * - shutdown hooks: on SIGTERM Nest stops accepting connections, finishes
 *   in-flight requests and closes the DB pool. Kubernetes sends SIGTERM
 *   before killing a pod, so this is what makes rolling updates lossless.
 */
export const configureHttpApp = (app: INestApplication, opts: HttpOptions): void => {
  app.setGlobalPrefix(opts.globalPrefix, { exclude: opts.excludeFromPrefix });

  const http = app.getHttpAdapter().getInstance() as { set?: (k: string, v: unknown) => void };
  http.set?.('trust proxy', opts.trustProxyHops);
  http.set?.('x-powered-by', false);

  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );
  app.enableShutdownHooks();

  if (opts.swagger?.enabled) {
    const config = new DocumentBuilder()
      .setTitle(opts.swagger.title)
      .setDescription(opts.swagger.description)
      .addCookieAuth('cka_at')
      .build();
    SwaggerModule.setup(`${opts.globalPrefix}/docs`, app, () => SwaggerModule.createDocument(app, config));
  }
};
