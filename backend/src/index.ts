import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createApp } from './app/createApp.js';
import { createWsServer } from './ws/index.js';

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, valueRaw] = match;
      if (process.env[key] != null) continue;
      let value = valueRaw.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {}
}

loadEnv();

const app = createApp();

const port = Number(process.env.PORT ?? process.env.RAILWAY_PORT ?? 4000);
const server = createServer(app);
createWsServer(server);
server.listen(port, '0.0.0.0', () => {
  console.log(`API listening on 0.0.0.0:${port}`);
});
