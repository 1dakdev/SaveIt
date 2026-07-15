import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { CyclesService } from './cycles.service';

@Controller()
export class CyclesController {
  constructor(private readonly cycles: CyclesService) {}

  @Get('cycles/:id')
  get(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.cycles.getCycle(id, userId);
  }

  @Post('periods/:id/mark-paid')
  markPaid(@Param('id') periodId: string, @CurrentUser() userId: string) {
    return this.cycles.markPaid(periodId, userId);
  }

  // Organizer-only (enforced in the service). `force` applies the grace-window
  // close, marking unpaid members missed and docking their reputation.
  @Post('periods/:id/close')
  close(
    @Param('id') periodId: string,
    @CurrentUser() userId: string,
    @Query('force') force?: string,
  ) {
    return this.cycles.closePeriod(periodId, userId, force === 'true');
  }

  @Post('periods/:id/confirm-receipt')
  confirm(@Param('id') periodId: string, @CurrentUser() userId: string) {
    return this.cycles.confirmReceipt(periodId, userId);
  }
}
