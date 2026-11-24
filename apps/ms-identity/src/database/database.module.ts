import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Env } from '../config/env';
import { typeOrmOptions } from './typeorm-options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [Env],
      // If Postgres is not up yet (typical on `docker compose up` or a fresh
      // cluster) keep retrying for ~30s before giving up and letting the
      // orchestrator restart the container.
      useFactory: (env: Env) => ({ ...typeOrmOptions(env), retryAttempts: 10, retryDelay: 3_000 }),
    }),
  ],
})
export class DatabaseModule {}
