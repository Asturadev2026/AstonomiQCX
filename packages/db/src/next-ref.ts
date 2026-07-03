import type { Tx } from './with-tenant';

/**
 * Human-friendly sequential IDs per tenant, e.g. AQ-T-4821 (Guide D.1).
 * Atomic upsert on ref_counters — no gaps, no races.
 * Must run inside withTenant() (RLS applies to ref_counters too).
 */
export async function nextRef(
  tx: Tx,
  tenantId: string,
  prefix: string,
): Promise<string> {
  const rows = await tx.$queryRawUnsafe<{ seq: bigint }[]>(
    `insert into ref_counters (tenant_id, prefix, seq) values ($1::uuid, $2, 1)
     on conflict (tenant_id, prefix) do update set seq = ref_counters.seq + 1
     returning seq`,
    tenantId,
    prefix,
  );
  return `${prefix}${rows[0]!.seq}`;
}
