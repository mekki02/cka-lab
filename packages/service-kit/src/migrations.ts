import type { DataSource } from 'typeorm';

/**
 * Runs pending TypeORM migrations while holding a Postgres advisory lock.
 *
 * Why the lock: during a rolling update Kubernetes starts several new pods at
 * once (replicas > 1, or maxSurge). Without coordination each would try to
 * apply the same migration concurrently. `pg_advisory_lock` makes the others
 * wait; when they get the lock the migrations table says there is nothing
 * left to do.
 *
 * The lock is session-scoped, so we pin one connection (QueryRunner) for the
 * lock and the unlock.
 */
export const runMigrationsWithLock = async (
  dataSource: DataSource,
  lockKey: number,
  log: (msg: string) => void = console.log,
): Promise<void> => {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    log(`Waiting for migration lock ${lockKey}…`);
    await runner.query('SELECT pg_advisory_lock($1)', [lockKey]);
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    log(
      applied.length === 0
        ? 'Database schema is up to date'
        : `Applied ${applied.length} migration(s): ${applied.map(m => m.name).join(', ')}`,
    );
  } finally {
    await runner.query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => undefined);
    await runner.release();
  }
};
