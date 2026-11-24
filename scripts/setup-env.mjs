#!/usr/bin/env node
/**
 * Creates `.env` from `.env.example`, replacing every CHANGE_ME value with a
 * random secret and generating an Ed25519 token-signing key.
 *
 *   node scripts/setup-env.mjs          # refuses to overwrite an existing .env
 *   node scripts/setup-env.mjs --force  # regenerate (invalidates sessions and,
 *                                       # for an existing DB volume, breaks DB logins)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, '.env');
const force = process.argv.includes('--force');

if (existsSync(target) && !force) {
  console.error('.env already exists. Re-run with --force to regenerate it (see the warning in this script).');
  process.exit(1);
}

const secret = () => randomBytes(24).toString('base64url');
const { privateKey } = generateKeyPairSync('ed25519');
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trim().replace(/\n/g, '\\n');

const out = readFileSync(resolve(root, '.env.example'), 'utf8')
  .split('\n')
  .map(line => {
    if (/^[A-Z_]+=CHANGE_ME/.test(line)) return `${line.split('=')[0]}=${secret()}`;
    if (line.startsWith('JWT_PRIVATE_KEY=')) return `JWT_PRIVATE_KEY="${pem}"`;
    return line;
  })
  .join('\n');

writeFileSync(target, out, { mode: 0o600 });
console.log('Wrote .env with random database passwords and a new JWT signing key.');
