/**
 * Migration runner.
 *
 * `prisma migrate deploy` speaks raw TCP 5432 from its Rust schema engine,
 * which the corp proxy does not tunnel. This applies the very same
 * prisma/migrations/<name>/migration.sql files over Neon's WebSocket driver
 * on 443, and records them in Prisma's own `_prisma_migrations` table with
 * Prisma's checksum format — so a later `prisma migrate deploy` from an
 * unrestricted network (Vercel) sees this history as already applied and
 * picks up cleanly from here.
 *
 *   node scripts/migrate.mjs          apply pending migrations
 *   node scripts/migrate.mjs --status list applied / pending
 *   node scripts/migrate.mjs --reset  drop the public schema, then apply all
 */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./neon-driver.mjs";

const MIGRATIONS_DIR = "prisma/migrations";

const PRISMA_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  id                  VARCHAR(36) PRIMARY KEY NOT NULL,
  checksum            VARCHAR(64) NOT NULL,
  finished_at         TIMESTAMPTZ,
  migration_name      VARCHAR(255) NOT NULL,
  logs                TEXT,
  rolled_back_at      TIMESTAMPTZ,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_steps_count INTEGER NOT NULL DEFAULT 0
)`;

function localMigrations() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    });
}

const args = process.argv.slice(2);
const { pool, client } = await connect();

try {
  if (args.includes("--reset")) {
    console.log("! dropping schema public");
    await client.query('DROP SCHEMA IF EXISTS "public" CASCADE');
    await client.query('CREATE SCHEMA "public"');
  }

  await client.query(PRISMA_MIGRATIONS_TABLE);

  const { rows: applied } = await client.query(
    'SELECT migration_name, checksum, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at',
  );
  const appliedByName = new Map(applied.map((r) => [r.migration_name, r]));
  const local = localMigrations();

  if (args.includes("--status")) {
    for (const m of local) {
      const row = appliedByName.get(m.name);
      const state = !row
        ? "pending"
        : row.rolled_back_at
          ? "rolled back"
          : row.checksum !== m.checksum
            ? "APPLIED BUT MODIFIED — checksum mismatch"
            : "applied";
      console.log(`  ${state.padEnd(34)} ${m.name}`);
    }
    process.exit(0);
  }

  let count = 0;
  for (const m of local) {
    const row = appliedByName.get(m.name);
    if (row && !row.rolled_back_at) {
      if (row.checksum !== m.checksum) {
        throw new Error(
          `${m.name} was already applied but its migration.sql has changed since.\n` +
            `Edit migrations only before applying them; otherwise add a new one.`,
        );
      }
      continue;
    }

    process.stdout.write(`applying ${m.name} ... `);
    const startedAt = new Date();
    // A multi-statement simple query runs in one implicit transaction, so a
    // failure part-way leaves nothing behind.
    await client.query(m.sql);
    await client.query(
      `INSERT INTO "_prisma_migrations"
         (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
       VALUES ($1, $2, $3, $4, now(), 1)`,
      [randomUUID(), m.checksum, m.name, startedAt],
    );
    console.log("done");
    count += 1;
  }

  console.log(
    count === 0
      ? "Database is up to date."
      : `Applied ${count} migration${count === 1 ? "" : "s"}.`,
  );
} catch (err) {
  console.error("\nMigration failed:", err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
