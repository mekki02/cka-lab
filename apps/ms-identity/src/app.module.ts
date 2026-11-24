import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthKitModule } from '@cka/auth-kit';
import { pinoHttpOptions } from '@cka/service-kit';
import { AuthModule } from './auth/auth.module';
import { KeysService } from './auth/keys.service';
import { Env } from './config/env';
import { EnvModule } from './config/env.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    EnvModule,
    LoggerModule.forRootAsync({
      inject: [Env],
      useFactory: (env: Env) =>
        pinoHttpOptions({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development', service: 'ms-identity' }),
    }),
    DatabaseModule,
    // Generous global limit; the auth endpoints set a much stricter one.
    // Counters live in process memory, so with N replicas the effective limit
    // is N× — acceptable for a small private platform (see docs/SECURITY.md).
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }] }),
    TerminusModule,
    AuthModule,
    UsersModule,
    // ms-identity verifies its own tokens with the in-memory public key; other
    // services use the same module with the JWKS URL instead.
    AuthKitModule.forRootAsync({
      imports: [AuthModule],
      inject: [KeysService],
      useFactory: (keys: KeysService) => ({ key: async () => keys.verificationKey }),
    }),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
