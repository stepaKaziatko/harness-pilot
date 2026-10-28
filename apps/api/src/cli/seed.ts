import { loadEnv, readConfig } from '../env.js';
import { createPool } from '../db/pool.js';
import { seed } from '../db/seed.js';

loadEnv();
const pool = createPool(readConfig().databaseUrl);
try {
  const counts = await seed(pool);
  console.log(`seeded ${JSON.stringify(counts)}`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
