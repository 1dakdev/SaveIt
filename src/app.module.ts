import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Public } from './auth/public.decorator';
import { AuthModule } from './auth/auth.module';
import { AccessModule } from './common/access.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { AuditModule } from './modules/audit/audit.module';
import { ChatModule } from './modules/chat/chat.module';
import { CirclesModule } from './modules/circles/circles.module';
import { CyclesModule } from './modules/cycles/cycles.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { EnforcementModule } from './modules/enforcement/enforcement.module';
import { IdentityModule } from './modules/identity/identity.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RotationModule } from './modules/rotation/rotation.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Liveness + DB readiness: a real dependency check, not just "process is up".
  @Public()
  @Get()
  async check() {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return { status: db === 'ok' ? 'ok' : 'degraded', service: 'sankofa', phase: 1, db };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Basic API rate limiting: 100 requests / minute / IP by default.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
    PrismaModule,
    AuthModule,
    AccessModule,
    AuditModule,
    NotificationsModule,
    EnforcementModule,
    IdentityModule,
    CirclesModule,
    RotationModule,
    CyclesModule,
    DisputesModule,
    ChatModule,
    PaymentsModule,
    SchedulerModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
