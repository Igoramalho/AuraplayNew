import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../src/app.js';

const appPromise = buildApp({ staticAssets: false }).then(async app => {
  await app.ready();
  return app;
});

export function getServerlessApp() {
  return appPromise;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const app = await appPromise;
  app.server.emit('request', request, response);
}
