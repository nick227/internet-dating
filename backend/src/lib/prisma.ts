import { PrismaClient } from '@prisma/client';

export const prisma =
  (global as any).prisma ??
  new PrismaClient({
    log: ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  (global as any).prisma = prisma;
}
