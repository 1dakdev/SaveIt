import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { CreateUserDto } from './dto';
import { IdentityService } from './identity.service';

@Controller('users')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  // Public: sign-up. Real auth provider owns credentials; this creates the profile row.
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.identity.create(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() userId: string) {
    return this.identity.findOne(userId);
  }

  @Post(':id/verify-kyc')
  verifyKyc(@Param('id') id: string) {
    return this.identity.verifyKyc(id);
  }
}
