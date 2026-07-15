import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { CirclesService } from './circles.service';
import { CreateCircleDto, InviteDto } from './dto';

@Controller('circles')
export class CirclesController {
  constructor(private readonly circles: CirclesService) {}

  @Post()
  create(@CurrentUser() userId: string, @Body() dto: CreateCircleDto) {
    return this.circles.create(userId, dto);
  }

  @Get()
  list(@CurrentUser() userId: string) {
    return this.circles.listForUser(userId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.circles.findOne(id, userId);
  }

  @Post(':id/invites')
  invite(@Param('id') id: string, @CurrentUser() userId: string, @Body() dto: InviteDto) {
    return this.circles.invite(id, userId, dto);
  }

  @Post(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.circles.acceptInvite(id, userId);
  }
}
