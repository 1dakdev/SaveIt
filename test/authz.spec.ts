import { ForbiddenException } from '@nestjs/common';
import { makeCircle, makeHarness, makeUser, resetDb, type Harness } from './harness';

/** Lock a 3-member circle and return its first period + a non-member outsider. */
async function setup(h: Harness) {
  const { circle, users, organizer } = await makeCircle(h.prisma, h.circles, 3);
  const cycle = await h.rotation.proposeOrder(circle.id, organizer.id, {});
  for (const u of users) await h.rotation.vote(cycle!.id, u.id, 'approve' as never);
  const [period0] = await h.prisma.period.findMany({
    where: { cycleId: cycle!.id },
    orderBy: { index: 'asc' },
    take: 1,
  });
  const outsider = await makeUser(h.prisma, 'Yaw');
  return { circle, users, organizer, cycleId: cycle!.id, period0, outsider };
}

describe('Authorization', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await makeHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await resetDb(h.prisma);
  });

  it('KYC-unverified users cannot create a circle', async () => {
    const u = await h.prisma.user.create({
      data: { name: 'New', email: 'new@test.local' }, // unverified by default
    });
    await expect(
      h.circles.create(u.id, { name: 'X', amount: 1000, frequency: 'weekly' as never }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a non-member cannot view a circle', async () => {
    const { circle, outsider } = await setup(h);
    await expect(h.circles.findOne(circle.id, outsider.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a non-member cannot view a cycle', async () => {
    const { cycleId, outsider } = await setup(h);
    await expect(h.cycles.getCycle(cycleId, outsider.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a non-member cannot mark a contribution paid', async () => {
    const { period0, outsider } = await setup(h);
    await expect(h.cycles.markPaid(period0.id, outsider.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a non-organizer member cannot close a period', async () => {
    const { period0, users } = await setup(h);
    // users[1] is a member but not the organizer.
    await expect(h.cycles.closePeriod(period0.id, users[1].id, false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('a non-organizer cannot invite members', async () => {
    const { circle, users, outsider } = await setup(h);
    await expect(
      h.circles.invite(circle.id, users[1].id, { userId: outsider.id }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the organizer can perform organizer-only actions', async () => {
    const { period0, users, organizer } = await setup(h);
    for (const u of users) await h.cycles.markPaid(period0.id, u.id);
    const payout = await h.cycles.closePeriod(period0.id, organizer.id, false);
    expect(payout.status).toBe('released');
  });
});
