import { execFile } from 'node:child_process';
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = process.cwd();
const port = Number(process.env.PORT);
const dist = process.env.WORKA_DIST_DIR;
const viteEntry = join(root, 'node_modules/vite/dist/node/index.js');
if (!Number.isInteger(port) || port < 1024 || !dist || !existsSync(viteEntry)) throw Error('Static preview launch metadata missing');

// The bundle is cached per candidate commit; only a version change rebuilds.
if (!existsSync(join(dist, 'index.html'))) {
  console.log('Building static preview into ' + dist);
  const tmp = dist + '.tmp-' + process.pid;
  rmSync(tmp, { recursive: true, force: true });
  await exec(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite/config.prod.mjs', '--outDir', tmp, '--emptyOutDir'],
    { cwd: root, timeout: 900_000, maxBuffer: 4 * 1024 * 1024 });
  if (!existsSync(join(tmp, 'index.html'))) throw Error('构建未产出 index.html');
  rmSync(dist, { recursive: true, force: true });
  renameSync(tmp, dist);
}
for (const entry of readdirSync(dirname(dist))) {
  if (entry.startsWith('build-') && entry !== basename(dist)) rmSync(join(dirname(dist), entry), { recursive: true, force: true });
}

const { preview } = await import(pathToFileURL(viteEntry).href);
const server = await preview({
  root,
  configFile: resolve(root, 'vite/config.prod.mjs'),
  build: { outDir: dist },
  preview: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'warn',
  plugins: [{
    name: 'cardgame-static-cache',
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        // 哈希产物内容寻址，可永久缓存；index.html 和 public 素材仍走 ETag 协商。
        // Vite 预览统一覆盖 Cache-Control 为 no-cache（经 writeHead 直写），只能在出口拦截。
        if (/^\/assets\/.+-[A-Za-z0-9_-]{8,}\./.test(request.url ?? '')) {
          const immutable = 'public, max-age=31536000, immutable';
          const setHeader = response.setHeader.bind(response);
          response.setHeader = (name, value) => setHeader(name, String(name).toLowerCase() === 'cache-control' ? immutable : value);
          const writeHead = response.writeHead.bind(response);
          response.writeHead = (status, ...args) => {
            const headers = args.at(-1);
            if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
              for (const key of Object.keys(headers)) if (key.toLowerCase() === 'cache-control') headers[key] = immutable;
            }
            return writeHead(status, ...args);
          };
        }
        next();
      });
    },
  }],
});
console.log('CardGame static preview listening on ' + port);
let closing = false;
const stop = async () => { if (closing) return; closing = true; server.httpServer?.close(); process.exit(0); };
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
