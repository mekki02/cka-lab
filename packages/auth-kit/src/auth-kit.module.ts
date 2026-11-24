import { Module, type DynamicModule, type FactoryProvider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard, CsrfGuard, RolesGuard, TOKEN_VERIFIER } from './guards';
import { TokenVerifier, type KeySource } from './token-verifier';

export interface AuthKitAsyncOptions {
  imports?: DynamicModule['imports'];
  inject?: FactoryProvider['inject'];
  useFactory: (...args: never[]) => KeySource | Promise<KeySource>;
}

/**
 * Import once in a service's AppModule. Registers, in this order, global
 * guards that run on every route:
 *
 *   CsrfGuard  -> AuthGuard -> RolesGuard
 *
 * so every endpoint is authenticated and CSRF-checked by default, and opting
 * out is explicit and greppable (@Public, @SkipCsrf).
 */
@Module({})
export class AuthKitModule {
  static forRootAsync(options: AuthKitAsyncOptions): DynamicModule {
    return {
      module: AuthKitModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: TOKEN_VERIFIER,
          inject: options.inject ?? [],
          useFactory: async (...args: never[]) => new TokenVerifier(await options.useFactory(...args)),
        },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
      exports: [TOKEN_VERIFIER],
    };
  }
}
