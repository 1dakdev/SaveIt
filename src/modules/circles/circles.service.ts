import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCircleDto, InviteDto } from './dto';

@Injectable()
export class CirclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: CreateCircleDto) {
    const creator = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!creator) throw new NotFoundException('User not found');
    if (creator.kycStatus !== 'verified') {
      // Unverified users are read-only (doc §6.1).
      throw new ForbiddenException('KYC verification required to create a circle');
    }

    const circle = await this.prisma.circle.create({
      data: {
        name: dto.name,
        amount: dto.amount,
        frequency: dto.frequency,
        creatorId: userId,
        memberships: {
          // Creator is the organizer and first active member.
          create: {
            userId,
            role: 'organizer',
            state: 'active',
            termsAcceptedAt: new Date(),
          },
        },
      },
      include: { memberships: true },
    });
    await this.audit.record({ actorId: userId, action: 'circle.created', target: circle.id });
    return circle;
  }

  async invite(circleId: string, actorId: string, dto: InviteDto) {
    const circle = await this.assertOrganizer(circleId, actorId);
    if (circle.status !== 'forming') {
      throw new BadRequestException('Can only invite while the circle is forming');
    }
    const invitee = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!invitee) throw new NotFoundException('Invitee not found');

    const membership = await this.prisma.membership.upsert({
      where: { userId_circleId: { userId: dto.userId, circleId } },
      update: {},
      create: { userId: dto.userId, circleId, role: 'member', state: 'invited' },
    });
    await this.audit.record({
      actorId,
      action: 'circle.invited',
      target: circleId,
      metadata: { userId: dto.userId },
    });
    return membership;
  }

  /** Invitee accepts terms and becomes an active member. */
  async acceptInvite(circleId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_circleId: { userId, circleId } },
    });
    if (!membership) throw new NotFoundException('No invite for this user');
    if (membership.state === 'active') return membership;
    if (membership.state !== 'invited') {
      throw new BadRequestException(`Cannot accept from state ${membership.state}`);
    }
    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { state: 'active', termsAcceptedAt: new Date() },
    });
    await this.audit.record({ actorId: userId, action: 'circle.joined', target: circleId });
    return updated;
  }

  async findOne(circleId: string, actorUserId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      include: {
        memberships: { include: { user: { select: { id: true, name: true } } } },
        cycles: { include: { periods: true } },
      },
    });
    if (!circle) throw new NotFoundException('Circle not found');
    // Only participants (invited or active) may view a circle's details.
    if (!circle.memberships.some((m) => m.userId === actorUserId && m.state !== 'left')) {
      throw new ForbiddenException('You do not have access to this circle');
    }
    return circle;
  }

  async listForUser(userId: string) {
    return this.prisma.circle.findMany({
      where: { memberships: { some: { userId } } },
      include: { memberships: true },
    });
  }

  private async assertOrganizer(circleId: string, userId: string) {
    const circle = await this.prisma.circle.findUnique({
      where: { id: circleId },
      include: { memberships: true },
    });
    if (!circle) throw new NotFoundException('Circle not found');
    const me = circle.memberships.find((m) => m.userId === userId);
    if (!me || me.role !== 'organizer') {
      throw new ForbiddenException('Only the organizer can do this');
    }
    return circle;
  }
}
