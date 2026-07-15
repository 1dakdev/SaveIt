import { lockCircle, makeHarness, resetDb, type Harness } from './harness';

const AMOUNT = 5000;

/** Grace-close a collecting period after only some members pay. */
async function graceCloseWithMiss(h: Harness, periodId: string, payers: string[], organizer: string) {
  for (const u of payers) await h.cycles.markPaid(periodId, u);
  await h.cycles.closePeriod(periodId, organizer, true);
}

describe('Enforcement escalation (suspend after N)', () => {
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

  it('docks reputation on a single miss but does not yet suspend (threshold 2)', async () => {
    const { circle, users, organizer, periods } = await lockCircle(h, 3, AMOUNT);
    const defaulter = users[2];
    await graceCloseWithMiss(h, periods[0].id, [users[0].id, users[1].id], organizer.id);

    const user = await h.prisma.user.findUnique({ where: { id: defaulter.id } });
    expect(user!.reputation).toBe(80);
    const m = await h.prisma.membership.findUnique({
      where: { userId_circleId: { userId: defaulter.id, circleId: circle.id } },
    });
    expect(m!.state).toBe('active');
  });

  it('suspends the member once unsettled arrears reach the threshold', async () => {
    const { circle, users, organizer, periods } = await lockCircle(h, 3, AMOUNT);
    const defaulter = users[2];

    // Miss period 0 and period 1 -> 2 arrears -> suspended.
    await graceCloseWithMiss(h, periods[0].id, [users[0].id, users[1].id], organizer.id);
    await graceCloseWithMiss(h, periods[1].id, [users[0].id, users[1].id], organizer.id);

    const m = await h.prisma.membership.findUnique({
      where: { userId_circleId: { userId: defaulter.id, circleId: circle.id } },
    });
    expect(m!.state).toBe('suspended');

    const audit = await h.prisma.auditLog.findFirst({
      where: { action: 'enforcement.suspended', actorId: defaulter.id },
    });
    expect(audit).not.toBeNull();
  });

  it('reinstates the member when arrears drop back below the threshold', async () => {
    const { circle, users, organizer, periods } = await lockCircle(h, 3, AMOUNT);
    const defaulter = users[2];
    await graceCloseWithMiss(h, periods[0].id, [users[0].id, users[1].id], organizer.id);
    await graceCloseWithMiss(h, periods[1].id, [users[0].id, users[1].id], organizer.id);

    // Settle one arrear -> back to 1 (< 2) -> reinstated.
    await h.cycles.settleArrear(periods[0].id, defaulter.id);

    const m = await h.prisma.membership.findUnique({
      where: { userId_circleId: { userId: defaulter.id, circleId: circle.id } },
    });
    expect(m!.state).toBe('active');
    const audit = await h.prisma.auditLog.findFirst({
      where: { action: 'enforcement.reinstated', actorId: defaulter.id },
    });
    expect(audit).not.toBeNull();
  });
});
