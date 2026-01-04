import { before, test } from 'node:test';
import assert from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SEARCH_SERVICES_DIR = join(__dirname, '..');

const FORBIDDEN_PATTERNS = [
  /profile\.findMany/,
  /user\.findMany/,
  /prisma\.profile\.findMany/,
  /prisma\.user\.findMany/,
];

test('search services must not import or use profile.findMany or user.findMany', async () => {
  const files = await getAllTypeScriptFiles(SEARCH_SERVICES_DIR);
  
  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const relativePath = file.replace(SEARCH_SERVICES_DIR + '\\', '');
    
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        // Check if it's in a comment or string literal
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (pattern.test(line)) {
            // Simple heuristic: if it's in a comment, string, or test context, it's OK
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || 
                trimmed.startsWith('*') ||
                trimmed.includes("'") && trimmed.includes("findMany") ||
                trimmed.includes('"') && trimmed.includes('findMany') ||
                file.includes('.test.') ||
                file.includes('__tests__')) {
              continue;
            }
            
            throw new Error(
              `ARCHITECTURE VIOLATION: Found ${pattern.source} in ${relativePath}:${i + 1}\n` +
              `Line: ${line.trim()}\n` +
              `Search services must use ProfileSearchIndex and materialized tables only.`
            );
          }
        }
      }
    }
  }
});

async function getAllTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') {
        continue;
      }
      const subFiles = await getAllTypeScriptFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}