import { makeCircle, makeHarness, resetDb, type Harness } from './harness';

const AMOUNT = 5000;

/** Build a 3-member circle and lock its first cycle. */
async function lockedCircle(h: Harness) {
  const { circle, users, organizer } = await makeCircle(h.prisma, h.circles, 3, AMOUNT);
  const cycle = await h.rotation.proposeOrder(circle.id, organizer.id, {});
  for (const u of users) await h.rotation.vote(cycle!.id, u.id, 'approve' as never);
  const periods = await h.prisma.period.findMany({
    where: { cycleId: cycle!.id },
    orderBy: { index: 'asc' },
  });
  return { circle, users, organizer, cycleId: cycle!.id, periods };
}

describe('Cycle close & payout', () => {
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

  it('opens period 0 for collection and leaves the rest upcoming', async () => {
    const { periods } = await lockedCircle(h);
    expect(periods[0].state).toBe('collecting');
    expect(periods[1].state).toBe('upcoming');
    expect(periods[2].state).toBe('upcoming');

    const contribs = await h.prisma.contribution.findMany({ where: { periodId: periods[0].id } });
    expect(contribs).toHaveLength(3);
    expect(contribs.every((c) => c.status === 'pending' && c.amount === AMOUNT)).toBe(true);
  });

  it('refuses to close while contributions are pending', async () => {
    const { organizer, periods } = await lockedCircle(h);
    await expect(h.cycles.closePeriod(periods[0].id, organizer.id, false)).rejects.toThrow(
      /pending/,
    );
  });

  it('pays the full pot to the period recipient once everyone has paid', async () => {
    const { users, organizer, periods } = await lockedCircle(h);
    for (const u of users) await h.cycles.markPaid(periods[0].id, u.id);

    const payout = await h.cycles.closePeriod(periods[0].id, organizer.id, false);
    expect(payout.amount).toBe(AMOUNT * 3);
    expect(payout.recipientId).toBe(organizer.id); // order 0 = organizer
    expect(payout.status).toBe('released');

    const p0 = await h.prisma.period.findUnique({ where: { id: periods[0].id } });
    expect(p0!.state).toBe('paid_out');
  });

  it('advances: closing period 0 opens period 1 with fresh contributions', async () => {
    const { users, organizer, periods } = await lockedCircle(h);
    for (const u of users) await h.cycles.markPaid(periods[0].id, u.id);
    await h.cycles.closePeriod(periods[0].id, organizer.id, false);

    const p1 = await h.prisma.period.findUnique({ where: { id: periods[1].id } });
    expect(p1!.state).toBe('collecting');
    const contribs = await h.prisma.contribution.findMany({ where: { periodId: periods[1].id } });
    expect(contribs).toHaveLength(3);
  });

  it('grace close pays only the collected amount, marks missed, and docks reputation', async () => {
    const { users, organizer, periods } = await lockedCircle(h);
    // Two of three pay; the third (Esi) misses.
    await h.cycles.markPaid(periods[0].id, users[0].id);
    await h.cycles.markPaid(periods[0].id, users[1].id);
    const defaulter = users[2];

    const payout = await h.cycles.closePeriod(periods[0].id, organizer.id, true);
    expect(payout.amount).toBe(AMOUNT * 2);

    const missed = await h.prisma.contribution.findUnique({
      where: { periodId_memberId: { periodId: periods[0].id, memberId: defaulter.id } },
    });
    expect(missed!.status).toBe('missed');

    const after = await h.prisma.user.findUnique({ where: { id: defaulter.id } });
    expect(after!.reputation).toBe(80); // 100 - 20

    const others = await h.prisma.user.findMany({
      where: { id: { in: [users[0].id, users[1].id] } },
    });
    expect(others.every((u) => u.reputation === 100)).toBe(true);
  });

  it('completes the cycle and circle after the final period closes', async () => {
    const { circle, users, organizer, cycleId, periods } = await lockedCircle(h);
    for (const p of periods) {
      for (const u of users) await h.cycles.markPaid(p.id, u.id);
      await h.cycles.closePeriod(p.id, organizer.id, false);
    }
    const cycle = await h.prisma.cycle.findUnique({ where: { id: cycleId } });
    const c = await h.prisma.circle.findUnique({ where: { id: circle.id } });
    expect(cycle!.status).toBe('complete');
    expect(c!.status).toBe('complete');
  });
});
