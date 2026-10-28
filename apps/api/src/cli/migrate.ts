import { loadEnv, readConfig } from '../env.js';
import { createPool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';

loadEnv();
const pool = createPool(readConfig().databaseUrl);
try {
  const applied = await migrate(pool);
  console.log(applied.length > 0 ? `applied: ${applied.join(', ')}` : 'nothing to apply');
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
