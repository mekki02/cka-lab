import { generateKeyPair, SignJWT } from 'jose';
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from '@cka/contracts';
import { ACCESS_TOKEN_ALG, InvalidTokenError, TokenVerifier } from './token-verifier';
import { csrfTokensMatch, newCsrfToken } from './csrf';

const claims = { sid: 's-1', email: 'a@example.com', name: 'Ada', role: 'STUDENT' };

const sign = async (
  key: CryptoKey | Uint8Array | import('jose').KeyLike,
  overrides: { iss?: string; aud?: string; exp?: string; role?: string } = {},
) =>
  new SignJWT({ ...claims, role: overrides.role ?? claims.role })
    .setProtectedHeader({ alg: ACCESS_TOKEN_ALG })
    .setSubject('u-1')
    .setIssuer(overrides.iss ?? TOKEN_ISSUER)
    .setAudience(overrides.aud ?? TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? '5m')
    .sign(key);

describe('TokenVerifier', () => {
  it('accepts a token signed by the matching key and maps claims', async () => {
    const { privateKey, publicKey } = await generateKeyPair(ACCESS_TOKEN_ALG, { crv: 'Ed25519' });
    const user = await new TokenVerifier({ key: publicKey }).verify(await sign(privateKey));
    expect(user).toEqual({ id: 'u-1', sessionId: 's-1', email: 'a@example.com', name: 'Ada', role: 'STUDENT' });
  });

  it('rejects a token signed by another key', async () => {
    const signer = await generateKeyPair(ACCESS_TOKEN_ALG, { crv: 'Ed25519' });
    const other = await generateKeyPair(ACCESS_TOKEN_ALG, { crv: 'Ed25519' });
    await expect(new TokenVerifier({ key: other.publicKey }).verify(await sign(signer.privateKey))).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('rejects wrong issuer, wrong audience, expired token and unknown role', async () => {
    const { privateKey, publicKey } = await generateKeyPair(ACCESS_TOKEN_ALG, { crv: 'Ed25519' });
    const v = new TokenVerifier({ key: publicKey });
    for (const o of [{ iss: 'evil' }, { aud: 'other' }, { exp: '-1m' }, { role: 'ROOT' }]) {
      await expect(v.verify(await sign(privateKey, o))).rejects.toBeInstanceOf(InvalidTokenError);
    }
  });
});

describe('csrf', () => {
  it('matches only identical non-empty tokens', () => {
    const t = newCsrfToken();
    expect(csrfTokensMatch(t, t)).toBe(true);
    expect(csrfTokensMatch(t, newCsrfToken())).toBe(false);
    expect(csrfTokensMatch('', '')).toBe(false);
    expect(csrfTokensMatch(t, undefined)).toBe(false);
  });
});
