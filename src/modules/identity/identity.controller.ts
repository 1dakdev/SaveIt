import { Body, Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { config } from '../../config/config';
import { CurrentUser } from '../../common/current-user.decorator';
import { Public } from '../../auth/public.decorator';
import { IdentityService } from './identity.service';
import { CreateUserDto } from './dto';

@Controller('users')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  /**
   * DEV ONLY. Production provisions profiles from the IdP token on first
   * authenticated request (see AuthService), so there is no public signup.
   * In dev auth mode we expose it so the app is usable without an IdP.
   */
  @Public()
  @Post()
  create(@Body() dto: CreateUserDto) {
    if (config.auth.mode !== 'dev') {
      throw new ForbiddenException(
        'Public signup is disabled; users are provisioned by the identity provider',
      );
    }
    return this.identity.create(dto);
  }

  // Profile rows are provisioned automatically from the IdP token on first
  // authenticated request (see AuthService), so there is no public signup route.
  @Get('me')
  me(@CurrentUser() userId: string) {
    return this.identity.findOne(userId);
  }

  /**
   * DEV ONLY. Real KYC status is owned by the provider (Persona/Alloy) and
   * flipped via a signed webhook. Exposing a self-serve verify in production
   * would defeat the AML program, so it is refused outside dev auth mode.
   */
  @Post(':id/verify-kyc')
  verifyKyc(@Param('id') id: string) {
    if (config.auth.mode !== 'dev') {
      throw new ForbiddenException('KYC is managed by the identity provider webhook');
    }
    return this.identity.verifyKyc(id);
  }
}
