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
async function main() {
  const root = await db.component.upsert({
    where: { path: "Radar" },
    update: {},
    create: {
      name: "Radar",
      path: "Radar",
      depth: 0,
    },
  });

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

  const counts = {
    components: await db.component.count(),
    milestones: await db.milestone.count(),
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
