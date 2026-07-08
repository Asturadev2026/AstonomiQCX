import type { Prisma, PrismaClient } from '@prisma/client';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Tx = Prisma.TransactionClient;

/**
 * THE ONLY way services touch tenant data (Guide §7).
 * Wraps work in a transaction with `SET LOCAL app.tenant = <id>`, which the
 * RLS policies read. Because tables use FORCE ROW LEVEL SECURITY, any query
 * outside withTenant() sees zero rows — a loud failure instead of a leak.
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    // guards the raw SQL below against injection and catches bad callers early
    throw new Error(`withTenant: invalid tenant id "${tenantId}"`);
  }
  return prisma.$transaction(
    async (tx: Tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant = '${tenantId}'`);
      return fn(tx);
    },
    { timeout: 60_000 },
  );
}
