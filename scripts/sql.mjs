/**
 * Ad-hoc SQL against the dev database, over the proxy-friendly WebSocket
 * driver. `prisma studio` and `psql` can't reach Neon from inside the
 * sandbox, so this is the escape hatch.
 *
 *   node scripts/sql.mjs "select count(*) from \"Radar\""
 */
import "dotenv/config";
import { connect } from "./neon-driver.mjs";

const query = process.argv.slice(2).join(" ");
if (!query) {
  console.error('usage: node scripts/sql.mjs "<sql>"');
  process.exit(1);
}

const { pool, client } = await connect();
try {
  const res = await client.query(query);
  if (Array.isArray(res)) {
    for (const r of res) console.table(r.rows);
  } else if (res.rows?.length) {
    console.table(res.rows);
  } else {
    console.log(`${res.command} ok (${res.rowCount ?? 0} rows)`);
  }
} catch (err) {
  console.error("SQL error:", err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
