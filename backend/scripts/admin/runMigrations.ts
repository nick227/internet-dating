#!/usr/bin/env node
/**
 * Run Prisma migrations in production
 * Usage: tsx scripts/runMigrations.ts
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendRoot = join(__dirname, '..');

console.log('[migrations] Running Prisma migrations...');
console.log(`[migrations] Working directory: ${backendRoot}`);

try {
  execSync('pnpm prisma migrate deploy --schema prisma/schema', {
    cwd: backendRoot,
    stdio: 'inherit',
    env: process.env,
  });
  console.log('[migrations] ✓ Migrations completed successfully');
  process.exit(0);
} catch (error) {
  console.error('[migrations] ✗ Migration failed:', error);
  process.exit(1);
}
