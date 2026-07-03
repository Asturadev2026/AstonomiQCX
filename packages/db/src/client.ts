import { PrismaClient } from '@prisma/client';

/** Singleton PrismaClient — one pool per process (api / workers / gateways). */
let prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }
  return prisma;
}
