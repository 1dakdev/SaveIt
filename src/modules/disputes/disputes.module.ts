import {
  BadRequestException,
  Body,
  Controller,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Module,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

const DISPUTE_WINDOW_DAYS = 3;

class OpenDisputeDto {
  @IsString()
  periodId!: string;

  @IsOptional()
  @IsString()
  txRef?: string; // reference to the off-platform payment the member claims to have made
}

@Injectable()
class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async open(userId: string, dto: OpenDisputeDto) {
    const period = await this.prisma.period.findUnique({ where: { id: dto.periodId } });
    if (!period) throw new NotFoundException('Period not found');

    const now = new Date();
    const resolvesAt = new Date(now.getTime() + DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const dispute = await this.prisma.dispute.create({
      data: {
        openedBy: userId,
        periodId: dto.periodId,
        txRef: dto.txRef,
        status: 'open',
        resolvesAt,
      },
    });
    await this.audit.record({ actorId: userId, action: 'dispute.opened', target: dispute.id });
    return dispute;
  }

  /**
   * Resolve a dispute. In Phase 1 an organizer/admin reviews records within the
   * 3-day window; Phase 2 can auto-check the ledger. `paid=true` flips the
   * disputed contribution back to paid.
   */
  async resolve(disputeId: string, actorId: string, paid: boolean) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status !== 'open') throw new BadRequestException('Dispute already resolved');

    if (paid) {
      await this.prisma.contribution.updateMany({
        where: { periodId: dispute.periodId, memberId: dispute.openedBy },
        data: { status: 'paid', paidAt: new Date() },
      });
    }
    const resolved = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: { status: paid ? 'resolved_paid' : 'resolved_unpaid', resolvedAt: new Date() },
    });
    await this.audit.record({
      actorId,
      action: 'dispute.resolved',
      target: disputeId,
      metadata: { paid },
    });
    return resolved;
  }
}

@Controller('disputes')
@UseGuards(AuthGuard)
class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  open(@CurrentUser() userId: string, @Body() dto: OpenDisputeDto) {
    return this.disputes.open(userId, dto);
  }

  @Post(':id/resolve-paid')
  resolvePaid(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.disputes.resolve(id, userId, true);
  }

  @Post(':id/resolve-unpaid')
  resolveUnpaid(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.disputes.resolve(id, userId, false);
  }
}

@Module({
  controllers: [DisputesController],
  providers: [DisputesService],
})
export class DisputesModule {}
