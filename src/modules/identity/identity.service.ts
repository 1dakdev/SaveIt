import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto';

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUserDto) {
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, phone: dto.phone },
    });
    await this.audit.record({ actorId: user.id, action: 'user.created', target: user.id });
    return user;
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * KYC STUB. Real Phase 1 runs Persona/Alloy (ID + selfie, sanctions/PEP) and
   * flips kycStatus via webhook. Here we mark verified directly for the demo.
   */
  async verifyKyc(id: string) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { kycStatus: 'verified' },
    });
    await this.audit.record({ actorId: id, action: 'user.kyc_verified', target: id });
    return user;
  }
}
