import { createApp } from './app.js';
import { checkDb, createPool, pgUserStore } from './db/pool.js';
import { pgMarketStore, pgPortfolioStore } from './db/stores.js';
import { loadEnv, readConfig } from './env.js';
import { createHttpServer } from './http.js';

loadEnv();
const config = readConfig();
const pool = createPool(config.databaseUrl);
const app = createApp({
  checkDb: checkDb(pool),
  users: pgUserStore(pool),
  market: pgMarketStore(pool),
  portfolio: pgPortfolioStore(pool),
});
const server = createHttpServer(app);

server.listen(config.port, () => {
  console.log(`api listening on http://localhost:${config.port}`);
});

let closing = false;
function shutdown(): void {
  if (closing) return;
  closing = true;
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  server.closeAllConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
