import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CyclesService } from '../cycles/cycles.service';
import { ProposeOrderDto, SwapRequestDto, VoteValueDto } from './dto';

@Injectable()
export class RotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cycles: CyclesService,
  ) {}

  /**
   * Organizer proposes the payout order and opens voting by creating a
   * `proposed` cycle. Assigns each active member a 0-based `order`.
   */
  async proposeOrder(circleId: string, actorId: string, dto: ProposeOrderDto) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      include: { memberships: true, cycles: true },
    });
    if (!circle) throw new NotFoundException('Circle not found');

    const me = circle.memberships.find((m) => m.userId === actorId);
    if (!me || me.role !== 'organizer') {
      throw new ForbiddenException('Only the organizer can propose the order');
    }
    if (circle.status !== 'forming') {
      throw new BadRequestException('Order can only be proposed while forming');
    }

    const active = circle.memberships.filter((m) => m.state === 'active');
    if (active.length < 2) throw new BadRequestException('Need at least 2 active members');

    // Resolve ordering: explicit list, else by membership creation time.
    let ordered = active;
    if (dto.order && dto.order.length > 0) {
      const activeUserIds = new Set(active.map((m) => m.userId));
      const provided = new Set(dto.order);
      if (dto.order.length !== active.length || ![...activeUserIds].every((u) => provided.has(u))) {
        throw new BadRequestException('Order must list every active member exactly once');
      }
      ordered = dto.order.map((uid) => active.find((m) => m.userId === uid)!);
    } else {
      ordered = [...active].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    const nextIndex = circle.cycles.length;

    return this.prisma.$transaction(async (tx) => {
      await Promise.all(
        ordered.map((m, i) =>
          tx.membership.update({ where: { id: m.id }, data: { order: i } }),
        ),
      );
      const cycle = await tx.cycle.create({
        data: { circleId, index: nextIndex, status: 'proposed' },
      });
      await this.audit.record({
        actorId,
        action: 'rotation.proposed',
        target: cycle.id,
        metadata: { order: ordered.map((m) => m.userId) },
      });
      return tx.cycle.findUnique({
        where: { id: cycle.id },
        include: { circle: { include: { memberships: true } } },
      });
    });
  }

  /**
   * A member votes on the proposed order. A unanimous set of approvals from all
   * active members auto-locks the cycle. A decline blocks the lock.
   */
  async vote(cycleId: string, userId: string, value: VoteValueDto) {
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: cycleId },
      include: { circle: { include: { memberships: true } }, votes: true },
    });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (cycle.status !== 'proposed') {
      throw new BadRequestException('Voting is closed for this cycle');
    }

    const membership = cycle.circle.memberships.find(
      (m) => m.userId === userId && m.state === 'active',
    );
    if (!membership) throw new ForbiddenException('Not an active member of this circle');

    await this.prisma.vote.upsert({
      where: { membershipId_cycleId: { membershipId: membership.id, cycleId } },
      update: { value },
      create: { membershipId: membership.id, cycleId, userId, value },
    });
    await this.audit.record({
      actorId: userId,
      action: 'rotation.voted',
      target: cycleId,
      metadata: { value },
    });

    // Re-evaluate unanimity.
    const active = cycle.circle.memberships.filter((m) => m.state === 'active');
    const votes = await this.prisma.vote.findMany({ where: { cycleId } });
    const byMember = new Map(votes.map((v) => [v.membershipId, v.value]));
    const everyoneApproved =
      active.length >= 2 && active.every((m) => byMember.get(m.id) === 'approve');

    if (everyoneApproved) {
      const locked = await this.cycles.lock(cycleId);
      return { voted: value, locked: true, cycle: locked };
    }
    return { voted: value, locked: false };
  }

  /** Position swap — takes effect only when the counterparty accepts. */
  async requestSwap(circleId: string, fromUserId: string, dto: SwapRequestDto) {
    const from = await this.prisma.membership.findUnique({
      where: { userId_circleId: { userId: fromUserId, circleId } },
    });
    if (!from) throw new NotFoundException('You are not a member of this circle');
    const to = await this.prisma.membership.findUnique({ where: { id: dto.toMembershipId } });
    if (!to || to.circleId !== circleId) {
      throw new BadRequestException('Counterparty is not in this circle');
    }
    const swap = await this.prisma.swapRequest.create({
      data: { fromMember: from.id, toMember: to.id, status: 'requested' },
    });
    await this.audit.record({ actorId: fromUserId, action: 'swap.requested', target: swap.id });
    return swap;
  }

  async respondSwap(swapId: string, userId: string, accept: boolean) {
    const swap = await this.prisma.swapRequest.findUnique({ where: { id: swapId } });
    if (!swap) throw new NotFoundException('Swap not found');
    if (swap.status !== 'requested') throw new BadRequestException('Swap already resolved');

    const to = await this.prisma.membership.findUnique({ where: { id: swap.toMember } });
    if (!to || to.userId !== userId) {
      throw new ForbiddenException('Only the counterparty can respond');
    }

    if (!accept) {
      const declined = await this.prisma.swapRequest.update({
        where: { id: swapId },
        data: { status: 'declined' },
      });
      await this.audit.record({ actorId: userId, action: 'swap.declined', target: swapId });
      return declined;
    }

    const from = await this.prisma.membership.findUnique({ where: { id: swap.fromMember } });
    return this.prisma.$transaction(async (tx) => {
      // Trade the two rotation positions.
      await tx.membership.update({ where: { id: from!.id }, data: { order: to.order } });
      await tx.membership.update({ where: { id: to.id }, data: { order: from!.order } });
      const accepted = await tx.swapRequest.update({
        where: { id: swapId },
        data: { status: 'accepted' },
      });
      await this.audit.record({ actorId: userId, action: 'swap.accepted', target: swapId });
      return accepted;
    });
  }
}
