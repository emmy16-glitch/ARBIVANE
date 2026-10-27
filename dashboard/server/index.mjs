import {randomBytes, timingSafeEqual} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AutomationManager} from './automation.mjs';
import {DashboardStore, ENVIRONMENTS} from './store.mjs';
import {environmentReadiness} from './readiness.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const dataRoot = resolve(process.env.ARBIVANE_DASHBOARD_DATA_DIR ?? join(root, '.arbivane-dashboard'));
const webRoot = resolve(root, 'dashboard/web/dist');
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
const configuredToken = process.env.ARBIVANE_DASHBOARD_TOKEN ?? '';
const configuredOrigin = process.env.ARBIVANE_DASHBOARD_ORIGIN ?? '';
const sessions = new Map();
const listeners = new Map(ENVIRONMENTS.map((value) => [value, new Set()]));
const store = new DashboardStore(dataRoot);
await store.init();

const publish = (event) => {
  for (const response of listeners.get(event.environment) ?? [])
    response.write(`id: ${event.sequence}\nevent: operation\ndata: ${JSON.stringify(event)}\n\n`);
};
const automation = new AutomationManager({store, repoRoot: root, publish});

function json(response, status, value, headers = {}) {
  response.writeHead(status, {'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', ...headers});
  response.end(JSON.stringify(value));
}
async function readBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length; if (size > 32_768) throw new Error('REQUEST_TOO_LARGE'); chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}
function cookies(request) {
  return Object.fromEntries((request.headers.cookie ?? '').split(';')
    .map((part) => part.trim().split('=').map(decodeURIComponent)).filter((pair) => pair.length === 2));
}
function tokenMatches(supplied) {
  return Boolean(configuredToken && supplied.length === configuredToken.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(configuredToken)));
}
function authorized(request) {
  const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  if (tokenMatches(bearer)) return true;
  const id = cookies(request).arbivane_session;
  return Boolean(id && sessions.has(id));
}
function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (configuredOrigin && origin === configuredOrigin) return true;
  if (origin === `http://${request.headers.host}` || origin === `https://${request.headers.host}`) return true;
  const originHost = new URL(origin).hostname;
  const requestHost = (request.headers.host ?? '').replace(/^\[/, '').replace(/\].*$/, '').split(':')[0];
  return ['127.0.0.1', 'localhost', '::1'].includes(originHost) &&
    ['127.0.0.1', 'localhost', '::1'].includes(requestHost);
}
function message(error) { return error instanceof Error ? error.message : 'UNKNOWN_ERROR'; }

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname === '/api/health')
      return json(response, 200, {status: 'ok', mainnetExecutionEnabled: false});
    if (url.pathname === '/api/auth/session' && request.method === 'POST') {
      if (!sameOrigin(request)) return json(response, 403, {error: 'ORIGIN_REJECTED'});
      const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
      const local = ['127.0.0.1', '::1'].includes(request.socket.remoteAddress ?? '');
      if (configuredToken && !tokenMatches(supplied)) return json(response, 401, {error: 'INVALID_TOKEN'});
      if (!configuredToken && !local) return json(response, 503, {error: 'AUTH_NOT_CONFIGURED'});
      const id = randomBytes(24).toString('base64url'); sessions.set(id, Date.now());
      return json(response, 201, {authenticated: true}, {'set-cookie':
        `arbivane_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${request.socket.encrypted ? '; Secure' : ''}`});
    }
    if (url.pathname.startsWith('/api/') && !authorized(request))
      return json(response, 401, {error: 'AUTH_REQUIRED'});
    const match = url.pathname.match(/^\/api\/environments\/(sandbox|testnet|mainnet)(?:\/(.*))?$/);
    if (match) {
      const environment = match[1]; const action = match[2] ?? '';
      if (request.method === 'GET' && !action)
        return json(response, 200, {state: await store.state(environment), events: await store.events(environment, 0, 100),
          readiness: await environmentReadiness(environment)});
      if (request.method === 'GET' && action === 'events') {
        const after = Number(request.headers['last-event-id'] ?? url.searchParams.get('after') ?? 0);
        response.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive', 'x-accel-buffering': 'no'});
        for (const event of await store.events(environment, after, 500))
          response.write(`id: ${event.sequence}\nevent: operation\ndata: ${JSON.stringify(event)}\n\n`);
        listeners.get(environment).add(response);
        const keepAlive = setInterval(() => response.write(': keep-alive\n\n'), 15_000);
        request.on('close', () => { clearInterval(keepAlive); listeners.get(environment).delete(response); });
        return;
      }
      if (request.method === 'POST' && ['start', 'pause', 'resume', 'stop'].includes(action)) {
        if (!sameOrigin(request)) return json(response, 403, {error: 'ORIGIN_REJECTED'});
        const payload = await readBody(request);
        const result = action === 'start' ? await automation.start(environment, payload.settings)
          : await automation[action](environment);
        return json(response, 202, {session: result});
      }
    }
    if (url.pathname.startsWith('/api/')) return json(response, 404, {error: 'NOT_FOUND'});
    let path = url.pathname === '/' ? join(webRoot, 'index.html') : join(webRoot, url.pathname);
    if (!path.startsWith(webRoot)) return json(response, 403, {error: 'PATH_REJECTED'});
    try { if ((await stat(path)).isDirectory()) path = join(path, 'index.html'); }
    catch { path = join(webRoot, 'index.html'); }
    const content = await readFile(path);
    const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
      '.css':'text/css; charset=utf-8','.png':'image/png','.woff2':'font/woff2'};
    response.writeHead(200, {'content-type': types[extname(path)] ?? 'application/octet-stream',
      'x-content-type-options':'nosniff', 'referrer-policy':'same-origin',
      'content-security-policy':"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'"});
    response.end(content);
  } catch (error) { json(response, 400, {error: message(error)}); }
});

server.listen(port, host, () => console.log(`ARBIVANE dashboard listening on http://${host}:${port}`));
