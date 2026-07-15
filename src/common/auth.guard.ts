import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * DEV AUTH STUB.
 *
 * Phase 1 real auth is a managed provider (Clerk/Auth0/Cognito) issuing a JWT
 * that this guard would verify. For the scaffold we trust an `x-user-id` header
 * so the full request flow is exercisable without standing up an IdP.
 *
 * SHORTCUT: replace with JWT verification before any real deployment.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { userId?: string }>();
    const userId = req.header('x-user-id');
    if (!userId) {
      throw new UnauthorizedException('Missing x-user-id header (dev auth stub)');
    }
    req.userId = userId;
    return true;
  }
}
