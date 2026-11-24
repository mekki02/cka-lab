import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { runMigrationsWithLock } from '@cka/service-kit';
import { ROLES, type Role } from '@cka/contracts';
import { EnvModule } from './config/env.module';
import { DatabaseModule } from './database/database.module';
import { IDENTITY_MIGRATION_LOCK } from './database/typeorm-options';
import { UsersModule } from './users/users.module';
import { UsersService } from './users/users.service';

/**
 * Operator commands, run inside the container:
 *
 *   kubectl exec -it deploy/ms-identity -- node dist/cli.js create-admin --email you@example.com --name "You"
 *   docker compose exec ms-identity node dist/cli.js create-admin --email … --name …
 *
 * Commands print one-time links instead of taking passwords as arguments, so
 * no password ever lands in shell history or `ps` output.
 */
@Module({ imports: [EnvModule, DatabaseModule, UsersModule] })
class CliModule {}

const USAGE = `Usage:
  cli create-admin --email <email> --name <display name>
  cli invite       --email <email> --name <display name> [--role ADMIN|STUDENT]
  cli reset-link   --email <email>
  cli list-users`;

const parseArgs = (argv: string[]): { command?: string; flags: Record<string, string> } => {
  const [command, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (key?.startsWith('--')) flags[key.slice(2)] = rest[++i] ?? '';
  }
  return { command, flags };
};

const required = (flags: Record<string, string>, name: string): string => {
  const v = flags[name]?.trim();
  if (!v) throw new Error(`Missing --${name}\n\n${USAGE}`);
  return v;
};

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (!command || command === 'help' || command === '--help') {
    console.log(USAGE);
    return;
  }

  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
  try {
    await runMigrationsWithLock(app.get(DataSource), IDENTITY_MIGRATION_LOCK, () => undefined);
    const users = app.get(UsersService);

    switch (command) {
      case 'create-admin':
      case 'invite': {
        const role = (command === 'create-admin' ? 'ADMIN' : (flags.role ?? 'STUDENT').toUpperCase()) as Role;
        if (!ROLES.includes(role)) throw new Error(`--role must be one of ${ROLES.join(', ')}`);
        const res = await users.invite({ email: required(flags, 'email'), displayName: required(flags, 'name'), role }, null);
        console.log(`\nCreated ${res.user.email} (${role}). Send them this one-time link:\n\n  ${res.link}\n\nIt expires at ${res.expiresAt}.\n`);
        break;
      }
      case 'reset-link': {
        const user = await users.findByEmail(required(flags, 'email'));
        if (!user) throw new Error('No user with that email');
        const res = await users.issueResetLink(user.id, null);
        console.log(`\nPassword reset link for ${user.email}:\n\n  ${res.link}\n\nIt expires at ${res.expiresAt}.\n`);
        break;
      }
      case 'list-users': {
        for (const u of await users.list()) {
          console.log(`${u.status.padEnd(9)} ${u.role.padEnd(8)} ${u.email}  (${u.displayName})`);
        }
        break;
      }
      default:
        throw new Error(`Unknown command "${command}"\n\n${USAGE}`);
    }
  } finally {
    await app.close();
  }
}

main().catch(err => {
  new Logger('cli').error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
