import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { makeCircle, makeHarness, resetDb, type Harness } from './harness';

const AMOUNT = 5000;

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

describe('Money correctness', () => {
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

  describe('idempotency & concurrency', () => {
    it('closing an already-closed period returns the same payout, does not double-advance', async () => {
      const { users, organizer, periods } = await lockedCircle(h);
      for (const u of users) await h.cycles.markPaid(periods[0].id, u.id);

      const first = await h.cycles.closePeriod(periods[0].id, organizer.id, false);
      const second = await h.cycles.closePeriod(periods[0].id, organizer.id, false);
      expect(second.id).toBe(first.id);

      const payouts = await h.prisma.payout.findMany({ where: { periodId: periods[0].id } });
      expect(payouts).toHaveLength(1);
      // Period 1 opened exactly once (3 contributions, not 6).
      const p1contribs = await h.prisma.contribution.count({ where: { periodId: periods[1].id } });
      expect(p1contribs).toBe(3);
    });

    it('concurrent closes release the pot exactly once', async () => {
      const { users, organizer, periods } = await lockedCircle(h);
      for (const u of users) await h.cycles.markPaid(periods[0].id, u.id);

      const results = await Promise.allSettled([
        h.cycles.closePeriod(periods[0].id, organizer.id, false),
        h.cycles.closePeriod(periods[0].id, organizer.id, false),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      const payouts = await h.prisma.payout.findMany({ where: { periodId: periods[0].id } });
      expect(payouts).toHaveLength(1);
    });

    it('rejects marking a contribution paid on a period that is not collecting', async () => {
      const { users, organizer, periods } = await lockedCircle(h);
      for (const u of users) await h.cycles.markPaid(periods[0].id, u.id);
      await h.cycles.closePeriod(periods[0].id, organizer.id, false);

      await expect(h.cycles.markPaid(periods[0].id, users[0].id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('marking paid twice is idempotent', async () => {
      const { users, periods } = await lockedCircle(h);
      const a = await h.cycles.markPaid(periods[0].id, users[0].id);
      const b = await h.cycles.markPaid(periods[0].id, users[0].id);
      expect(b.id).toBe(a.id);
      expect(b.status).toBe('paid');
    });
  });

  describe('arrears', () => {
    it('a missed contribution stays owed and shows up as the member arrears', async () => {
      const { users, organizer, periods } = await lockedCircle(h);
      await h.cycles.markPaid(periods[0].id, users[0].id);
      await h.cycles.markPaid(periods[0].id, users[1].id);
      const defaulter = users[2];

      await h.cycles.closePeriod(periods[0].id, organizer.id, true);

      const profile = await h.identity.findOne(defaulter.id);
      expect(profile.arrears).toBe(AMOUNT);
    });

    it('settleArrear clears the debt and records who it was owed to', async () => {
      const { users, organizer, periods } = await lockedCircle(h);
      await h.cycles.markPaid(periods[0].id, users[0].id);
      await h.cycles.markPaid(periods[0].id, users[1].id);
      const defaulter = users[2];
      await h.cycles.closePeriod(periods[0].id, organizer.id, true);

      const settled = await h.cycles.settleArrear(periods[0].id, defaulter.id);
      expect(settled.status).toBe('paid');

      const profile = await h.identity.findOne(defaulter.id);
      expect(profile.arrears).toBe(0);

      const audit = await h.prisma.auditLog.findFirst({
        where: { action: 'arrear.settled', actorId: defaulter.id },
      });
      expect(audit).not.toBeNull();
      expect(JSON.parse(audit!.metadata!).owedTo).toBe(users[0].id); // period-0 recipient
    });

    it('rejects settling when there is no outstanding arrear', async () => {
      const { users, periods } = await lockedCircle(h);
      await h.cycles.markPaid(periods[0].id, users[0].id); // paid, not missed
      await expect(h.cycles.settleArrear(periods[0].id, users[0].id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('defer', () => {
    it('swaps the current recipient with the next and moves them back a slot', async () => {
      const { circle, users, periods } = await lockedCircle(h);
      // period 0 recipient = users[0], period 1 recipient = users[1]
      await h.cycles.deferTurn(periods[0].id, users[0].id);

      const p0 = await h.prisma.period.findUnique({ where: { id: periods[0].id } });
      const p1 = await h.prisma.period.findUnique({ where: { id: periods[1].id } });
      const recip0 = await h.prisma.membership.findUnique({ where: { id: p0!.recipientId } });
      const recip1 = await h.prisma.membership.findUnique({ where: { id: p1!.recipientId } });
      // Recipients swapped between the two periods.
      expect(recip0!.userId).toBe(users[1].id);
      expect(recip1!.userId).toBe(users[0].id);

      // membership.order reflects the new receipt order: deferrer moved back to slot 1.
      const deferrer = await h.prisma.membership.findUnique({
        where: { userId_circleId: { userId: users[0].id, circleId: circle.id } },
      });
      const advanced = await h.prisma.membership.findUnique({
        where: { userId_circleId: { userId: users[1].id, circleId: circle.id } },
      });
      expect(deferrer!.order).toBe(1);
      expect(advanced!.order).toBe(0);
    });

    it('only the recipient can defer their own turn', async () => {
      const { users, periods } = await lockedCircle(h);
      await expect(h.cycles.deferTurn(periods[0].id, users[1].id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('cannot defer the final period (no later turn)', async () => {
      const { users, periods } = await lockedCircle(h);
      const last = periods[periods.length - 1];
      const recip = await h.prisma.membership.findUnique({ where: { id: last.recipientId } });
      await expect(h.cycles.deferTurn(last.id, recip!.userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('cannot defer a period that has already paid out', async () => {
      const { users, organizer, periods } = await lockedCircle(h);
      for (const u of users) await h.cycles.markPaid(periods[0].id, u.id);
      await h.cycles.closePeriod(periods[0].id, organizer.id, false);
      await expect(h.cycles.deferTurn(periods[0].id, users[0].id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
