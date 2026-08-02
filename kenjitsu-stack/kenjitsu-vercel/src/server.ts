import 'dotenv/config';
import { buildApp } from './app.js';

async function start() {
  const app = await buildApp();
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  await app.listen({ host, port });
}

start().catch(error => {
  console.error('Server startup failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
