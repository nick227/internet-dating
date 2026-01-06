// Defer PrismaClient import to avoid any initialization during module load
// This is critical for scripts like OpenAPI generation that don't need DB access
import type { PrismaClient } from '@prisma/client';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const getPrismaConfig = () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return {};
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
let _PrismaClientClass: typeof PrismaClient | null = null;

function getPrismaClientClass() {
  if (!_PrismaClientClass) {
    // Use createRequire for synchronous import in ES modules
    const prismaModule = require('@prisma/client');
    _PrismaClientClass = prismaModule.PrismaClient;
  }
  return _PrismaClientClass;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prisma) {
      const PrismaClientClass = getPrismaClientClass();
      _prisma = new PrismaClientClass(getPrismaConfig());
    }
    return (_prisma as any)[prop];
  }
});
