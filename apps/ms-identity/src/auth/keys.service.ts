import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { exportJWK, SignJWT, type JWK } from 'jose';
import { ACCESS_TOKEN_ALG } from '@cka/auth-kit';
import { readSecret } from '@cka/service-kit';
import { TOKEN_AUDIENCE, TOKEN_ISSUER, type AccessTokenClaims } from '@cka/contracts';
import { Env } from '../config/env';

/**
 * Owns the token-signing key. This is the only place in the whole system that
 * can mint an access token; every other service only gets the *public* half
 * through GET /.well-known/jwks.json.
 */
@Injectable()
export class KeysService implements OnModuleInit {
  private readonly logger = new Logger(KeysService.name);
  private privateKey!: KeyObject;
  private publicKey!: KeyObject;
  private jwk!: JWK;

  constructor(private readonly env: Env) {}

  async onModuleInit(): Promise<void> {
    const pem = readSecret(this.env.JWT_PRIVATE_KEY, this.env.JWT_PRIVATE_KEY_FILE);
    if (pem) {
      this.privateKey = createPrivateKey(pem.replace(/\\n/g, '\n'));
      if (this.privateKey.asymmetricKeyType !== 'ed25519') {
        throw new Error(`JWT private key must be Ed25519, got ${this.privateKey.asymmetricKeyType}`);
      }
    } else {
      // Only reachable outside production (env validation enforces it).
      this.logger.warn('No JWT_PRIVATE_KEY configured: using an ephemeral key. Sessions will not survive a restart.');
      this.privateKey = generateKeyPairSync('ed25519').privateKey;
    }
    this.publicKey = createPublicKey(this.privateKey);
    this.jwk = {
      ...(await exportJWK(this.publicKey)),
      kid: this.env.JWT_KEY_ID,
      alg: ACCESS_TOKEN_ALG,
      use: 'sig',
    };
  }

  /** The public key, for ms-identity's own AuthGuard. */
  get verificationKey(): KeyObject {
    return this.publicKey;
  }

  get jwks(): { keys: JWK[] } {
    return { keys: [this.jwk] };
  }

  signAccessToken(claims: AccessTokenClaims): Promise<string> {
    const { sub, ...rest } = claims;
    return new SignJWT({ ...rest })
      .setProtectedHeader({ alg: ACCESS_TOKEN_ALG, kid: this.jwk.kid, typ: 'JWT' })
      .setSubject(sub)
      .setIssuer(TOKEN_ISSUER)
      .setAudience(TOKEN_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.env.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.privateKey);
  }
}
