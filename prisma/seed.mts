import "dotenv/config";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { HttpsProxyAgent } from "https-proxy-agent";
import ws from "ws";
import { PrismaClient } from "../src/generated/prisma/client";

// Deliberately not importing src/lib/db: that module is `server-only` (it
// throws outside a React server context) and carries the audit guard, which
// seeding taxonomy has no need for.
const proxyUrl =
  process.env["HTTPS" + "_PROXY"] ??
  process.env["https" + "_proxy"] ??
  process.env["HTTP" + "_PROXY"] ??
  null;

if (proxyUrl) {
  const agent = new HttpsProxyAgent(proxyUrl);
  neonConfig.webSocketConstructor = class extends ws {
    constructor(address: string | URL, protocols?: string | string[]) {
      super(address, protocols, { agent });
    }
  } as unknown as typeof WebSocket;
} else {
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
}

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DIRECT_URL }),
});

/**
 * Taxonomy only — no radars. Classifications, states, priorities and
 * reproducibility are Prisma enums, so they need no rows; their labels live
 * in src/lib/radar/taxonomy.ts. Everything here is upserted so the script is
 * safe to re-run.
 */
const KEYWORDS = [
  ["bug", "bug"],
  ["chore", "chore"],
  ["research", "research"],
  ["blocked", "blocked"],
  ["nice-to-have", "nice to have"],
  ["perf", "perf"],
  ["ui", "ui"],
  ["infra", "infra"],
  ["docs", "docs"],
  ["spike", "spike"],
] as const;

async function main() {
  const root = await db.component.upsert({
    where: { path: "Radar" },
    update: {},
    create: {
      name: "Radar",
      path: "Radar",
      depth: 0,
      description: "Root component. Add children under Settings → Components.",
    },
  });

  for (const [i, name] of ["Unspecified", "1.0"].entries()) {
    await db.componentVersion.upsert({
      where: { componentId_name: { componentId: root.id, name } },
      update: {},
      create: { componentId: root.id, name, sortOrder: i },
    });
  }

  await db.milestone.upsert({
    where: { componentId_name: { componentId: root.id, name: "1.0" } },
    update: {},
    create: {
      componentId: root.id,
      name: "1.0",
      status: "ACTIVE",
      description: "First milestone.",
    },
  });

  for (const [name, label] of KEYWORDS) {
    await db.keyword.upsert({
      where: { name },
      update: {},
      create: { name, label },
    });
  }

  const counts = {
    components: await db.component.count(),
    versions: await db.componentVersion.count(),
    milestones: await db.milestone.count(),
    keywords: await db.keyword.count(),
    radars: await db.radar.count(),
  };
  console.log("Seeded taxonomy:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
