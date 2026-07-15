import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { config } from '../config/config';
import { AuthService } from './auth.service';
import { JwtVerifier } from './jwt-verifier';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Global authentication guard.
 *
 * - `oidc` mode (default in production): requires a valid Bearer JWT, verified
 *   against the provider JWKS, and resolves it to a local user id.
 * - `dev` mode (never allowed in production — enforced in config): trusts an
 *   `x-user-id` header so the API is exercisable without an IdP.
 *
 * Either way the resolved id lands on `req.userId` for `@CurrentUser()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { userId?: string }>();

    if (config.auth.mode === 'dev') {
      const userId = req.header('x-user-id');
      if (!userId) throw new UnauthorizedException('Missing x-user-id header (dev auth mode)');
      req.userId = userId;
      return true;
    }

    // oidc
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const claims = await this.verifier.verify(token);
    req.userId = await this.auth.resolveUserId(claims);
    return true;
  }
}
