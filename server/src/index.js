import { config } from './config.js';
import { connectDb } from './db.js';
import { createApp } from './app.js';

async function main() {
  await connectDb();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`PocketSmart AI listening on http://localhost:${config.port} (${config.env})`);
  });

  const stop = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
