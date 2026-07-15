import { Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { config } from '../../config/config';
import { CurrentUser } from '../../common/current-user.decorator';
import { IdentityService } from './identity.service';

@Controller('users')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

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
