import { PrismaClient } from '@prisma/client';

/**
 * Instance Prisma partagée (singleton) pour éviter d'épuiser le pool
 * de connexions lors du rechargement à chaud en développement.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
