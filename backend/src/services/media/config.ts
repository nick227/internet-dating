import path from 'path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const envDir = process.env.MEDIA_UPLOAD_DIR;
export const MEDIA_UPLOAD_ROOT = envDir
  ? (() => {
      // Use absolute path as-is (for Railway volumes like /data/uploads/media)
      const resolved = path.resolve(envDir);
      process.stdout.write(`[media] Config: MEDIA_UPLOAD_DIR env var set to: ${envDir}\n`);
      process.stdout.write(`[media] Config: Resolved MEDIA_UPLOAD_ROOT to: ${resolved}\n`);
      // Verify directory exists or can be created
      try {
        if (!existsSync(resolved)) {
          process.stdout.write(`[media] Config: Directory does not exist, will be created on first write\n`);
        } else {
          process.stdout.write(`[media] Config: Directory exists ✓\n`);
        }
      } catch (err) {
        process.stderr.write(`[media] Config: Error checking directory: ${String(err)}\n`);
      }
      return resolved;
    })()
  : (() => {
      // Resolve relative to this file's location (backend/src/services/media)
      // This ensures it works whether running from project root or backend directory
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const backendRoot = path.resolve(__dirname, '../../../');
      const candidates = [
        path.join(backendRoot, 'uploads', 'media'), // backend/uploads/media
        path.join(process.cwd(), 'backend', 'uploads', 'media'), // project root -> backend/uploads/media
        path.join(process.cwd(), 'uploads', 'media'), // project root -> uploads/media (fallback)
      ];
      // Return first candidate that exists, or default to backend/uploads/media
      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          process.stdout.write(`[media] Using upload directory: ${candidate}\n`);
          return candidate;
        }
      }
      const defaultPath = candidates[0];
      process.stdout.write(`[media] Upload directory not found, using default: ${defaultPath}\n`);
      return defaultPath; // Default to backend/uploads/media
    })();

// MEDIA_BASE_URL is used to construct full media URLs
// buildUrl() already adds '/media' prefix, so:
// - For same-domain (production): use empty string → results in '/media/key'
// - For different domain (dev): use full URL → results in 'http://localhost:4000/media/key'
// Default to empty string (relative URLs) for same-domain serving
// Only set MEDIA_BASE_URL if you need cross-domain media serving
const rawMediaBase = process.env.MEDIA_BASE_URL;
// Normalize: if it's '/media' or not set, use empty string (same-domain serving)
// If explicitly set to a full URL, use it (for cross-domain scenarios)
export const MEDIA_BASE_URL = !rawMediaBase || rawMediaBase === '/media' 
  ? '' 
  : rawMediaBase.replace(/\/$/, '');
