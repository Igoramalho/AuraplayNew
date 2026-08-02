import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';
import { buildApp, sensitiveLogPaths } from '../src/app.js';
import { createCorsOptions } from '../src/config/cors.js';

test('importing the serverless handler does not listen', async () => {
  const { getServerlessApp } = await import('../api/index.js');
  const app = await getServerlessApp();
  assert.equal(app.server.listening, false);
  await app.close();
});

test('/health works through the serverless handler', async () => {
  const { default: handler } = await import('../api/index.js?health-test');
  const server = createServer((request, response) => void handler(request, response));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', redis: 'disabled' });
    const missing = await fetch(`http://127.0.0.1:${address.port}/missing`);
    assert.equal(missing.status, 404);
    const animePahe = await fetch(`http://127.0.0.1:${address.port}/api/animepahe/anime/search?q=test`);
    assert.equal(animePahe.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('buildApp does not listen and starts without Redis', async () => {
  const app = await buildApp({ connectRedis: false, logger: false });
  assert.equal(app.server.listening, false);
  await app.close();
});

test('health and not-found responses are offline', async () => {
  const app = await buildApp({ connectRedis: false, logger: false });
  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: 'ok', redis: 'disabled' });
  const missing = await app.inject({ method: 'GET', url: '/definitely-missing' });
  assert.equal(missing.statusCode, 404);
  assert.match(missing.headers['cache-control'] || '', /no-store/);
  await app.close();
});

test('CORS defaults to public requests without credentials', async () => {
  const options = createCorsOptions({});
  assert.equal(options.origin, '*');
  assert.equal(options.credentials, false);
  assert.throws(() => createCorsOptions({ ALLOWED_ORIGINS: '*', CORS_CREDENTIALS: 'true' }));
});

test('logger configuration redacts credentials and resolved sources', () => {
  for (const path of ['req.headers.authorization', 'req.headers.cookie', 'req.headers.x-api-key', '*.url', '*.sources']) {
    assert.ok(sensitiveLogPaths.includes(path));
  }
});

test('AnimePahe is absent and real providers remain registered', async () => {
  const app = await buildApp({ connectRedis: false, logger: false });
  await app.ready();
  assert.equal(app.hasRoute({ method: 'GET', url: '/api/animepahe/anime/search' }), false);
  assert.equal(app.hasRoute({ method: 'GET', url: '/api/anikoto/anime/search' }), true);
  assert.equal(app.hasRoute({ method: 'GET', url: '/api/anizone/anime/search' }), true);
  assert.equal(app.hasRoute({ method: 'GET', url: '/api/anidb/anime/search' }), true);
  assert.equal(app.hasRoute({ method: 'GET', url: '/api/anibd/anime/search' }), true);
  assert.equal(app.hasRoute({ method: 'GET', url: '/api/animeheaven/anime/search' }), true);
  await app.close();
});

test('the extension resolves to the hardened local checkout', async () => {
  const require = createRequire(import.meta.url);
  const projectPackage = JSON.parse(await readFile('package.json', 'utf8')) as { dependencies: Record<string, string> };
  assert.equal(projectPackage.dependencies['@middlegear/kenjitsu-extensions'], 'file:./vendor/kenjitsu-extensions');
  const lockfile = await readFile('pnpm-lock.yaml', 'utf8');
  assert.doesNotMatch(lockfile, /\.\.\/kenjitsu-extensions-main/);
  assert.match(lockfile, /file:\.\/vendor\/kenjitsu-extensions/);
  const installedPackage = require.resolve('@middlegear/kenjitsu-extensions/package.json');
  const installedMain = installedPackage.replace(/package\.json$/, 'dist/main.js');
  const [installed, local] = await Promise.all([
    readFile(installedMain),
    readFile('vendor/kenjitsu-extensions/dist/main.js'),
  ]);
  assert.deepEqual(installed, local);
});

test('public errors do not expose stack traces', async () => {
  const app = await buildApp({ connectRedis: false, logger: false });
  app.get('/test-error', async () => { throw new Error('private detail'); });
  const response = await app.inject('/test-error');
  assert.equal(response.statusCode, 500);
  assert.doesNotMatch(response.body, /private detail|at .*\(/);
  await app.close();
});
