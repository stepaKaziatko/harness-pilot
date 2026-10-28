import { loadEnv, readConfig } from '../env.js';
import { createPool } from '../db/pool.js';
import { seed } from '../db/seed.js';

loadEnv();
const pool = createPool(readConfig().databaseUrl);
try {
  console.log(`seeded ${await seed(pool)} users`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
