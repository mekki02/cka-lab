import { normalizeEmail, randomSecret, sha256 } from './crypto.util';
import { PasswordService } from './password.service';
import { SessionsService } from './sessions.service';
import type { Env } from '../config/env';
import type { Session } from './session.entity';

describe('crypto utils', () => {
  it('generates 256-bit url-safe secrets', () => {
    const s = randomSecret();
    expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomSecret()).not.toBe(s);
  });
  it('hashes deterministically and normalizes emails', () => {
    expect(sha256('a')).toHaveLength(64);
    expect(sha256('a')).toBe(sha256('a'));
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });
});

describe('PasswordService', () => {
  const svc = new PasswordService();
  it('verifies only the right password and never succeeds without a hash', async () => {
    const hash = await svc.hash('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(svc.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(svc.verify(hash, 'wrong')).resolves.toBe(false);
    await expect(svc.verify(null, 'anything')).resolves.toBe(false);
  });
});

/** Minimal in-memory stand-in for the TypeORM repository the service uses. */
const fakeRepo = () => {
  const rows = new Map<string, Session>();
  let n = 0;
  return {
    rows,
    create: (s: Partial<Session>) => s as Session,
    save: async (s: Session) => {
      if (!s.id) s.id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      rows.set(s.id, { ...s });
      return s;
    },
    findOne: async ({ where: { id } }: { where: { id: string } }) => {
      const r = rows.get(id);
      return r ? { ...r, user: { id: r.userId, status: 'ACTIVE' } } : null;
    },
    update: async (where: { id?: string }, patch: Partial<Session>) => {
      const r = where.id ? rows.get(where.id) : undefined;
      if (r) Object.assign(r, patch);
      return { affected: r ? 1 : 0 };
    },
  };
};

describe('SessionsService refresh rotation', () => {
  const env = { REFRESH_TOKEN_TTL_DAYS: 14 } as Env;
  const user = { id: 'u1' } as never;

  it('rotates on every refresh and rejects garbage', async () => {
    const repo = fakeRepo();
    const svc = new SessionsService(repo as never, env);
    const { refreshToken } = await svc.create(user, {});
    const r1 = await svc.refresh(refreshToken);
    expect(r1.kind).toBe('rotated');
    expect(r1.kind === 'rotated' && r1.refreshToken).not.toBe(refreshToken);
    expect((await svc.refresh('not-a-token')).kind).toBe('invalid');
  });

  it('tolerates the previous token briefly (parallel tabs), then treats reuse as theft', async () => {
    const repo = fakeRepo();
    const svc = new SessionsService(repo as never, env);
    const { refreshToken: t0, session } = await svc.create(user, {});
    const r1 = await svc.refresh(t0);
    expect((await svc.refresh(t0)).kind).toBe('concurrent');

    // Age the rotation beyond the grace period: reusing t0 now revokes the session.
    repo.rows.get(session.id)!.rotatedAt = new Date(Date.now() - 5 * 60_000);
    expect((await svc.refresh(t0)).kind).toBe('invalid');
    expect(repo.rows.get(session.id)!.revokedAt).toBeInstanceOf(Date);
    // …and the legitimate, newer token no longer works either.
    expect(r1.kind === 'rotated' && (await svc.refresh(r1.refreshToken)).kind).toBe('invalid');
  });
});
