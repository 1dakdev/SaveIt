import { lockCircle, makeHarness, resetDb, type Harness } from './harness';

const DAY_MS = 24 * 60 * 60 * 1000;
const AMOUNT = 5000;

describe('Scheduler sweep (tick)', () => {
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

  it('cleanly auto-closes a period once everyone has paid', async () => {
    const { users, periods } = await lockCircle(h, 3, AMOUNT);
    for (const u of users) await h.cycles.markPaid(periods[0].id, u.id);

    const res = await h.scheduler.tick(new Date());
    expect(res.closedClean).toBeGreaterThanOrEqual(1);

    const p0 = await h.prisma.period.findUnique({ where: { id: periods[0].id } });
    const p1 = await h.prisma.period.findUnique({ where: { id: periods[1].id } });
    expect(p0!.state).toBe('paid_out');
    expect(p1!.state).toBe('collecting');
  });

  it('grace-closes an overdue period and enforces the missed contribution', async () => {
    const { users, periods } = await lockCircle(h, 3, AMOUNT);
    await h.cycles.markPaid(periods[0].id, users[0].id);
    await h.cycles.markPaid(periods[0].id, users[1].id);
    const defaulter = users[2];

    // Advance the clock past the due date + grace window.
    const now = new Date(periods[0].dueDate.getTime() + 4 * DAY_MS);
    const res = await h.scheduler.tick(now);
    expect(res.closedGrace).toBeGreaterThanOrEqual(1);

    const missed = await h.prisma.contribution.findUnique({
      where: { periodId_memberId: { periodId: periods[0].id, memberId: defaulter.id } },
    });
    expect(missed!.status).toBe('missed');
    const user = await h.prisma.user.findUnique({ where: { id: defaulter.id } });
    expect(user!.reputation).toBe(80);
  });

  it('does not close a period that is neither fully paid nor overdue', async () => {
    const { users, periods } = await lockCircle(h, 3, AMOUNT);
    await h.cycles.markPaid(periods[0].id, users[0].id); // only 1 of 3

    const res = await h.scheduler.tick(new Date()); // within grace
    expect(res.closedClean).toBe(0);
    expect(res.closedGrace).toBe(0);
    const p0 = await h.prisma.period.findUnique({ where: { id: periods[0].id } });
    expect(p0!.state).toBe('collecting');
  });

  it('expires an open dispute whose 3-day window has elapsed', async () => {
    const { users, periods } = await lockCircle(h, 3, AMOUNT);
    const now = new Date();
    await h.prisma.dispute.create({
      data: {
        openedBy: users[1].id,
        periodId: periods[0].id,
        status: 'open',
        resolvesAt: new Date(now.getTime() - DAY_MS), // already elapsed
      },
    });

    const res = await h.scheduler.tick(now);
    expect(res.expiredDisputes).toBe(1);
    const disputes = await h.prisma.dispute.findMany({ where: { periodId: periods[0].id } });
    expect(disputes[0].status).toBe('expired');
  });

  it('reminds members with a pending contribution as the due date approaches', async () => {
    const { periods } = await lockCircle(h, 3, AMOUNT);
    const now = new Date();
    // Pull the due date into the reminder window.
    await h.prisma.period.update({
      where: { id: periods[0].id },
      data: { dueDate: new Date(now.getTime() + DAY_MS) },
    });

    const res = await h.scheduler.tick(now);
    expect(res.reminded).toBe(3); // all three still pending
    const p0 = await h.prisma.period.findUnique({ where: { id: periods[0].id } });
    expect(p0!.state).toBe('collecting'); // reminded, not closed
  });
});
