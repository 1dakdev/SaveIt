import { ForbiddenException, Global, Injectable, Module, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Authorization primitives for circle-scoped actions. Every money- or
 * rule-relevant handler resolves the caller's membership here rather than
 * trusting a client-supplied id — the guard authenticates *who* you are; this
 * decides *what you may do* in a given circle.
 */
@Global()
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Caller must belong to the circle in some capacity (invited/active/
   * suspended) — used to gate reads so non-members can't see a circle's
   * financial state. Excludes members who have left.
   */
  async assertParticipant(circleId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_circleId: { userId, circleId } },
    });
    if (!membership || membership.state === 'left') {
      throw new ForbiddenException('You do not have access to this circle');
    }
    return membership;
  }

  /** Caller must be an active member of the circle. Returns the membership. */
  async assertActiveMember(circleId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_circleId: { userId, circleId } },
    });
    if (!membership || membership.state !== 'active') {
      throw new ForbiddenException('You are not an active member of this circle');
    }
    return membership;
  }

  /** Caller must be the organizer of the circle. Returns the membership. */
  async assertOrganizer(circleId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_circleId: { userId, circleId } },
    });
    if (!membership || membership.role !== 'organizer' || membership.state !== 'active') {
      throw new ForbiddenException('Only the circle organizer can do this');
    }
    return membership;
  }

  /** Resolve the owning circle id for a period (throws if the period is gone). */
  async circleIdForPeriod(periodId: string): Promise<string> {
    const period = await this.prisma.period.findUnique({
      where: { id: periodId },
      select: { cycle: { select: { circleId: true } } },
    });
    if (!period) throw new NotFoundException('Period not found');
    return period.cycle.circleId;
  }

  async assertOrganizerByPeriod(periodId: string, userId: string) {
    return this.assertOrganizer(await this.circleIdForPeriod(periodId), userId);
  }

  async assertMemberByPeriod(periodId: string, userId: string) {
    return this.assertActiveMember(await this.circleIdForPeriod(periodId), userId);
  }
}

@Global()
@Module({
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
