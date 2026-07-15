import { Injectable } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolves an IdP token into a local User id, provisioning the profile row on
 * first sight. KYC is NOT granted here — a new user is `unverified` and
 * read-only until the KYC provider (Persona/Alloy) flips their status.
 */
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveUserId(claims: JWTPayload): Promise<string> {
    const sub = claims.sub as string;

    const bySub = await this.prisma.user.findUnique({ where: { authSubject: sub } });
    if (bySub) return bySub.id;

    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : undefined;
    const name =
      (typeof claims.name === 'string' && claims.name) ||
      (typeof claims.email === 'string' && claims.email) ||
      'Member';

    // Link a pre-existing profile with the same email (e.g. seeded) to this sub.
    if (email) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        const linked = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { authSubject: sub },
        });
        return linked.id;
      }
    }

    const created = await this.prisma.user.create({
      data: {
        authSubject: sub,
        email: email ?? `${sub}@users.noreply.sankofa`,
        name,
      },
    });
    return created.id;
  }
}
