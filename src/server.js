import 'dotenv/config';
import app from './app.js';
import { connectDb, getDbStatus } from './config/db.js';
import { env } from './config/env.js';
import { bootstrapFromEnv } from './services/setup.service.js';

await connectDb();

if (getDbStatus() === 'connected') {
  try {
    await bootstrapFromEnv();
  } catch (error) {
    console.error(`Setup: env bootstrap failed: ${error.message}`);
  }
}

const server = app.listen(env.port, '0.0.0.0', () => {
  console.log(`API listening on 0.0.0.0:${env.port} (${env.nodeEnv})`);
});

server.on('error', (error) => {
  console.error(`API failed to start: ${error.message}`);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`${signal} received. Shutting down.`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
