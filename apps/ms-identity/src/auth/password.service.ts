import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Argon2id with OWASP-recommended parameters (19 MiB, 2 iterations). The
 * parameters are stored inside each hash, so raising them later only affects
 * new hashes — `needsRehash` lets login upgrade old ones transparently.
 */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService {
  /** Precomputed so a login for an unknown email costs the same as a real one. */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    // Always run a verification, even without a hash, so response time does
    // not reveal whether the account exists.
    this.dummyHash ??= argon2.hash('timing-equalizer-not-a-password', OPTIONS);
    const target = hash ?? (await this.dummyHash);
    try {
      const ok = await argon2.verify(target, password);
      return ok && !!hash;
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, OPTIONS);
  }
}
