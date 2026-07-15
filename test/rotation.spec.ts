import { ForbiddenException } from '@nestjs/common';
import { makeCircle, makeHarness, resetDb, type Harness } from './harness';

describe('Rotation & vote-to-lock', () => {
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

  it('assigns a 0-based order to every active member on propose', async () => {
    const { circle, organizer } = await makeCircle(h.prisma, h.circles, 3);
    await h.rotation.proposeOrder(circle.id, organizer.id, {});

    const members = await h.prisma.membership.findMany({
      where: { circleId: circle.id },
      orderBy: { order: 'asc' },
    });
    expect(members.map((m) => m.order)).toEqual([0, 1, 2]);
  });

  it('locks the cycle only when every active member approves', async () => {
    const { circle, users, organizer } = await makeCircle(h.prisma, h.circles, 3);
    const cycle = await h.rotation.proposeOrder(circle.id, organizer.id, {});

    const r1 = await h.rotation.vote(cycle!.id, users[0].id, 'approve' as never);
    const r2 = await h.rotation.vote(cycle!.id, users[1].id, 'approve' as never);
    expect(r1.locked).toBe(false);
    expect(r2.locked).toBe(false);

    const r3 = await h.rotation.vote(cycle!.id, users[2].id, 'approve' as never);
    expect(r3.locked).toBe(true);

    const locked = await h.prisma.cycle.findUnique({ where: { id: cycle!.id } });
    expect(locked!.status).toBe('active');
    expect(locked!.lockedAt).not.toBeNull();

    // One period per member is created on lock.
    const periods = await h.prisma.period.findMany({ where: { cycleId: cycle!.id } });
    expect(periods).toHaveLength(3);
  });

  it('a single decline blocks the lock even if others approve', async () => {
    const { circle, users, organizer } = await makeCircle(h.prisma, h.circles, 3);
    const cycle = await h.rotation.proposeOrder(circle.id, organizer.id, {});

    await h.rotation.vote(cycle!.id, users[0].id, 'approve' as never);
    await h.rotation.vote(cycle!.id, users[1].id, 'approve' as never);
    const declined = await h.rotation.vote(cycle!.id, users[2].id, 'decline' as never);

    expect(declined.locked).toBe(false);
    const c = await h.prisma.cycle.findUnique({ where: { id: cycle!.id } });
    expect(c!.status).toBe('proposed');
  });

  it('rejects a non-organizer proposing the order', async () => {
    const { circle, users } = await makeCircle(h.prisma, h.circles, 3);
    await expect(h.rotation.proposeOrder(circle.id, users[1].id, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
