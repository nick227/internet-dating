// Defer PrismaClient import to avoid any initialization during module load
// This is critical for scripts like OpenAPI generation that don't need DB access
import type { Prisma, PrismaClient } from '@prisma/client';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const getPrismaConfig = (): Prisma.PrismaClientOptions | undefined => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return undefined;
  }
  
  // Add connect_timeout if not already present (MySQL connection timeout in seconds)
  if (dbUrl.includes('mysql://') && !dbUrl.includes('connect_timeout')) {
    const separator = dbUrl.includes('?') ? '&' : '?';
    return {
      datasources: {
        db: {
          url: `${dbUrl}${separator}connect_timeout=1`
        }
      }
    };
  }
  
  return {};
};

// Lazy initialization - only import and create client when first accessed
let _prisma: PrismaClient | null = null;
let _PrismaClientClass: typeof PrismaClient | undefined;

function getPrismaClientClass(): typeof PrismaClient {
  if (!_PrismaClientClass) {
    // Use createRequire for synchronous import in ES modules
    const prismaModule = require('@prisma/client') as { PrismaClient: typeof PrismaClient };
    _PrismaClientClass = prismaModule.PrismaClient;
  }
  return _PrismaClientClass;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prisma) {
      const PrismaClientClass = getPrismaClientClass();
      const prismaConfig = getPrismaConfig();
      _prisma = prismaConfig ? new PrismaClientClass(prismaConfig) : new PrismaClientClass();
    }
    return (_prisma as any)[prop];
  }
});
