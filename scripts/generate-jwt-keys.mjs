#!/usr/bin/env node
/**
 * Prints a new Ed25519 private key (PKCS#8 PEM) for ms-identity.
 *
 *   node scripts/generate-jwt-keys.mjs > jwt-private.pem
 *   kubectl -n cka-lab create secret generic cka-lab-jwt --from-file=jwt-private.pem
 *   rm jwt-private.pem
 */
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ed25519');
process.stdout.write(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
