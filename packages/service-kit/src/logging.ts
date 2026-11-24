/**
 * nestjs-pino options shared by services: JSON logs in production (what log
 * collectors want), pretty logs in development, and secrets redacted.
 *
 * Returned as a plain object to keep this package free of a pino dependency.
 */
export const pinoHttpOptions = (opts: { level: string; pretty: boolean; service: string }) => ({
  pinoHttp: {
    level: opts.level,
    base: { service: opts.service },
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'],
      censor: '[redacted]',
    },
    // One compact line per request: method, path, status, duration. Headers
    // are noise (and a leak risk) in request logs.
    serializers: {
      req: (req: { id?: unknown; method?: string; url?: string }) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
    // Probes hit every few seconds; logging them drowns everything else.
    autoLogging: {
      ignore: (req: { url?: string }) => req.url === '/healthz' || req.url === '/readyz',
    },
    transport: opts.pretty ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
  },
});
