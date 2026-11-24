import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { LoggerModule } from 'nestjs-pino';
import { AuthKitModule } from '@cka/auth-kit';
import { pinoHttpOptions } from '@cka/service-kit';
import { Env } from './config/env';
import { EnvModule } from './config/env.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { LearningModule } from './learning.module';

@Module({
  imports: [
    EnvModule,
    LoggerModule.forRootAsync({
      inject: [Env],
      useFactory: (env: Env) =>
        pinoHttpOptions({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development', service: 'ms-learning' }),
    }),
    DatabaseModule,
    TerminusModule,
    // Verifies ms-identity's tokens with the public keys from its JWKS
    // endpoint. This service holds no secret that could mint a session.
    AuthKitModule.forRootAsync({ inject: [Env], useFactory: (env: Env) => ({ jwksUrl: env.JWKS_URL }) }),
    LearningModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
