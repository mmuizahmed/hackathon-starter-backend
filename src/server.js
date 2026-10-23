import 'dotenv/config';
import app from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';

await connectDb();

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
