import { Injectable, Logger, Module } from '@nestjs/common';

/**
 * Payments — Phase 1 is coordination-only: the platform records intent and
 * outcome but never holds funds. Members settle directly (Venmo/Zelle/bank) and
 * mark-as-paid via the Cycles module (`POST /periods/:id/mark-paid`).
 *
 * This service is the seam for the optional Plaid balance signal (Phase 1) and
 * the BaaS ACH pull/push + double-entry ledger (Phase 2). All methods are STUBS.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  /**
   * Phase 1 (optional): confirm the sending account had sufficient balance via
   * Plaid before accepting a mark-as-paid. Returns true unconditionally here.
   */
  async checkBalanceSignal(userId: string, amount: number): Promise<boolean> {
    this.logger.log(`[plaid stub] balance ok for ${userId} (${amount})`);
    return true;
  }

  /** Phase 2: initiate an ACH pull for a contribution. Not implemented. */
  async initiateAchPull(): Promise<never> {
    throw new Error('Phase 2 custody not enabled: no BaaS provider configured');
  }
}

@Module({
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
