import { Global, Module } from '@nestjs/common';
import { Env, validateEnv } from './env';

/**
 * Provides the validated `Env` instance. Inject it by class:
 *
 *   constructor(private readonly env: Env) {}
 *
 * Fully typed, validated once at startup, and trivial to replace in tests.
 */
@Global()
@Module({
  providers: [{ provide: Env, useFactory: () => validateEnv(process.env) }],
  exports: [Env],
})
export class EnvModule {}
