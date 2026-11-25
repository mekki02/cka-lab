import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuthKitModule } from '@cka/auth-kit';
import { pinoHttpOptions } from '@cka/service-kit';
import { ChecksService } from './checks/checks.service';
import { Env } from './config/env';
import { EnvModule } from './config/env.module';
import { HealthController } from './health/health.controller';
import { KubeService } from './kube/kube.service';
import { SessionsController } from './sessions/sessions.controller';
import { SessionsService } from './sessions/sessions.service';
import { TerminalServer } from './terminal/terminal.server';

@Module({
  imports: [
    EnvModule,
    LoggerModule.forRootAsync({
      inject: [Env],
      useFactory: (env: Env) => pinoHttpOptions({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development', service: 'ms-labs' }),
    }),
    // Same as every service: verifies ms-identity's tokens, cannot mint them.
    AuthKitModule.forRootAsync({ inject: [Env], useFactory: (env: Env) => ({ jwksUrl: env.JWKS_URL }) }),
  ],
  controllers: [HealthController, SessionsController],
  providers: [KubeService, SessionsService, ChecksService, TerminalServer],
})
export class AppModule {}
