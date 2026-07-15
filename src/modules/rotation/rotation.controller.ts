import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { ProposeOrderDto, SwapRequestDto, VoteDto } from './dto';
import { RotationService } from './rotation.service';

@Controller()
export class RotationController {
  constructor(private readonly rotation: RotationService) {}

  @Post('circles/:id/propose-order')
  propose(
    @Param('id') circleId: string,
    @CurrentUser() userId: string,
    @Body() dto: ProposeOrderDto,
  ) {
    return this.rotation.proposeOrder(circleId, userId, dto);
  }

  @Post('cycles/:id/vote')
  vote(@Param('id') cycleId: string, @CurrentUser() userId: string, @Body() dto: VoteDto) {
    return this.rotation.vote(cycleId, userId, dto.value);
  }

  @Post('circles/:id/swaps')
  requestSwap(
    @Param('id') circleId: string,
    @CurrentUser() userId: string,
    @Body() dto: SwapRequestDto,
  ) {
    return this.rotation.requestSwap(circleId, userId, dto);
  }

  @Post('swaps/:id/accept')
  accept(@Param('id') swapId: string, @CurrentUser() userId: string) {
    return this.rotation.respondSwap(swapId, userId, true);
  }

  @Post('swaps/:id/decline')
  decline(@Param('id') swapId: string, @CurrentUser() userId: string) {
    return this.rotation.respondSwap(swapId, userId, false);
  }
}
