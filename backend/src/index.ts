import { createServer } from 'node:http';
import { createApp } from './app/createApp.js';
import { createWsServer } from './ws/index.js';

const app = createApp();

const port = Number(process.env.PORT ?? 4000);
const server = createServer(app);
createWsServer(server);
server.listen(port, () => {
  console.log(`API: http://localhost:${port}`);
});
