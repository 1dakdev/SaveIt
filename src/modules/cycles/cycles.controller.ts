import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { CyclesService } from './cycles.service';

@Controller()
@UseGuards(AuthGuard)
export class CyclesController {
  constructor(private readonly cycles: CyclesService) {}

  @Get('cycles/:id')
  get(@Param('id') id: string) {
    return this.cycles.getCycle(id);
  }

  @Post('periods/:id/mark-paid')
  markPaid(@Param('id') periodId: string, @CurrentUser() userId: string) {
    return this.cycles.markPaid(periodId, userId);
  }

  // SHORTCUT: any authed member can trigger close; real rule is organizer-only
  // or a scheduled job. `force` applies the grace-window close.
  @Post('periods/:id/close')
  close(@Param('id') periodId: string, @Query('force') force?: string) {
    return this.cycles.closePeriod(periodId, force === 'true');
  }

  @Post('periods/:id/confirm-receipt')
  confirm(@Param('id') periodId: string, @CurrentUser() userId: string) {
    return this.cycles.confirmReceipt(periodId, userId);
  }
}
