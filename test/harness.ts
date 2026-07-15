import { Test, type TestingModule } from '@nestjs/testing';
import { AccessModule, AccessService } from '../src/common/access.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditModule } from '../src/modules/audit/audit.module';
import { EnforcementModule } from '../src/modules/enforcement/enforcement.module';
import { CirclesModule } from '../src/modules/circles/circles.module';
import { CirclesService } from '../src/modules/circles/circles.service';
import { CyclesModule } from '../src/modules/cycles/cycles.module';
import { CyclesService } from '../src/modules/cycles/cycles.service';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { IdentityService } from '../src/modules/identity/identity.service';
import { RotationModule } from '../src/modules/rotation/rotation.module';
import { RotationService } from '../src/modules/rotation/rotation.service';

export interface Harness {
  module: TestingModule;
  prisma: PrismaService;
  circles: CirclesService;
  rotation: RotationService;
  cycles: CyclesService;
  identity: IdentityService;
  access: AccessService;
  close: () => Promise<void>;
}

/** Boot a Nest context with the real money-path services against the test DB. */
export async function makeHarness(): Promise<Harness> {
  const module = await Test.createTestingModule({
    imports: [
      PrismaModule,
      AccessModule,
      AuditModule,
      EnforcementModule,
      CirclesModule,
      RotationModule,
      CyclesModule,
      IdentityModule,
    ],
  }).compile();
  await module.init();

  const prisma = module.get(PrismaService);
  return {
    module,
    prisma,
    circles: module.get(CirclesService),
    rotation: module.get(RotationService),
    cycles: module.get(CyclesService),
    identity: module.get(IdentityService),
    access: module.get(AccessService),
    close: async () => {
      await module.close();
    },
  };
}

/** Wipe every table between tests for full isolation. */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

let seq = 0;

/** Create a KYC-verified user with a unique email. */
export async function makeUser(prisma: PrismaService, name: string) {
  seq += 1;
  return prisma.user.create({
    data: { name, email: `${name.toLowerCase()}-${seq}@test.local`, kycStatus: 'verified' },
  });
}

/**
 * Build a forming circle with `n` verified active members. The first is the
 * organizer. Returns the circle and its member users in join order.
 */
export async function makeCircle(
  prisma: PrismaService,
  circles: CirclesService,
  n = 3,
  amount = 5000,
) {
  const names = ['Ama', 'Kofi', 'Esi', 'Yaa', 'Kwame'];
  const users = [];
  for (let i = 0; i < n; i += 1) users.push(await makeUser(prisma, names[i] ?? `M${i}`));

  const organizer = users[0];
  const circle = await circles.create(organizer.id, { name: 'Test Circle', amount, frequency: 'monthly' as never });

  for (let i = 1; i < n; i += 1) {
    await circles.invite(circle.id, organizer.id, { userId: users[i].id });
    await circles.acceptInvite(circle.id, users[i].id);
  }
  return { circle, users, organizer };
}
