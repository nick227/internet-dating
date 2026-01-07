import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const backendDist = join(projectRoot, 'backend', 'dist', 'index.js');

if (!existsSync(backendDist)) {
  console.error(`ERROR: Build verification failed: ${backendDist} does not exist`);
  console.error('This means the build did not complete successfully.');
  process.exit(1);
}

console.log(`✓ Build verification passed: ${backendDist} exists`);
