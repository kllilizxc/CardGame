import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = process.cwd();
const { createServer } = await import(pathToFileURL(resolve(root, 'node_modules/vite/dist/node/index.js')).href);
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1024 || !process.env.WORKA_SOURCE_REVISION) throw Error('Preview launch metadata missing');
const server = await createServer({
  root,
  configFile: resolve(root, 'vite/config.dev.mjs'),
  server: { host: '0.0.0.0', port, strictPort: true },
  plugins: [{ name: 'cardgame-workbench-identity', configureServer(server) {
    server.middlewares.use('/__cardgame_workbench', (_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({ revision: process.env.WORKA_SOURCE_REVISION, project: createHash('sha256').update(root).digest('hex') }));
    });
  } }],
});
await server.listen();
console.log('CardGame preview listening on ' + port);
let closing = false;
const stop = async () => { if (closing) return; closing = true; await server.close(); process.exit(0); };
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
