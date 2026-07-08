import { Injectable } from '@nestjs/common';
import type { Tx } from '@aq/db';

/**
 * Records one action, e.g. log(tx, tenantId, userId, 'ticket.create', 'ticket', { id }).
 * Takes the caller's already-open tx (Guide §8.3 pattern) rather than opening
 * its own — callers always invoke this from inside their own withTenant(),
 * and a second nested transaction on the same pool connection deadlocks.
 */
@Injectable()
export class AuditService {
  async log(
    tx: Tx,
    tenantId: string,
    userId: string | null,
    action: string,
    entity: string,
    details: unknown = {},
  ) {
    await tx.auditLog.create({
      data: { tenantId, userId, action, entity, details: details as object },
    });
  }
}
