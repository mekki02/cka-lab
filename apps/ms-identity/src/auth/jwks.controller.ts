import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@cka/auth-kit';
import { KeysService } from './keys.service';

/**
 * Public signing keys, in the standard JWKS format, for other services.
 *
 * Served outside the /api/identity prefix, so the Ingress never exposes it:
 * only pods inside the cluster (http://ms-identity:3001/.well-known/jwks.json)
 * can reach it. Exposing it would be harmless — it is a public key — but
 * there is no reason to.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('.well-known')
export class JwksController {
  constructor(private readonly keys: KeysService) {}

  @Public()
  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=300')
  jwks() {
    return this.keys.jwks;
  }
}
