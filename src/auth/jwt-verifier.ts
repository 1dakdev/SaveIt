import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../config/config';

/**
 * Verifies OIDC access tokens against the provider's published JWKS.
 *
 * The remote key set is fetched lazily and cached/rotated by `jose`, so this
 * works with any OIDC provider (Clerk, Auth0, Cognito, ...) by config alone.
 */
@Injectable()
export class JwtVerifier {
  private readonly logger = new Logger(JwtVerifier.name);
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  private keySet() {
    if (!this.jwks) {
      if (!config.auth.jwksUri) throw new Error('OIDC jwksUri not configured');
      this.jwks = createRemoteJWKSet(new URL(config.auth.jwksUri));
    }
    return this.jwks;
  }

  async verify(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.keySet(), {
        issuer: config.auth.issuer,
        audience: config.auth.audience, // undefined => not enforced
      });
      if (!payload.sub) throw new Error('token has no sub claim');
      return payload;
    } catch (err) {
      this.logger.debug(`token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
