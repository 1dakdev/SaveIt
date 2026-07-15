import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { ChatModule } from './modules/chat/chat.module';
import { CirclesModule } from './modules/circles/circles.module';
import { CyclesModule } from './modules/cycles/cycles.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { EnforcementModule } from './modules/enforcement/enforcement.module';
import { IdentityModule } from './modules/identity/identity.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RotationModule } from './modules/rotation/rotation.module';

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'sankofa', phase: 1 };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    NotificationsModule,
    EnforcementModule,
    JobsModule,
    IdentityModule,
    CirclesModule,
    RotationModule,
    CyclesModule,
    DisputesModule,
    ChatModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
