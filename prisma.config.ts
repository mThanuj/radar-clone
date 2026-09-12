import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 keeps connection URLs out of schema.prisma. The URL here is the
// one the schema engine uses for migrate/introspect, so it must be the
// UNPOOLED endpoint — pgbouncer can't run DDL in a session the way migrate
// needs. The runtime client uses the pooled URL via the Neon driver adapter
// in src/lib/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
  migrations: {
    path: "prisma/migrations",
    seed: "node --env-file=.env --import tsx/esm prisma/seed.mts",
  },
});
