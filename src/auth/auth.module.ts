import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { JwtVerifier } from './jwt-verifier';

/**
 * Registers AuthGuard as a global guard — every route is authenticated unless
 * explicitly marked `@Public()`. This is fail-closed: a new controller is
 * protected by default rather than accidentally left open.
 */
@Global()
@Module({
  providers: [
    JwtVerifier,
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
