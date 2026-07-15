import { Module } from '@nestjs/common';
import { CyclesModule } from '../cycles/cycles.module';
import { RotationController } from './rotation.controller';
import { RotationService } from './rotation.service';

@Module({
  imports: [CyclesModule],
  controllers: [RotationController],
  providers: [RotationService],
})
export class RotationModule {}
