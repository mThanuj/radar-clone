import "server-only";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { HttpsProxyAgent } from "https-proxy-agent";
import ws from "ws";
import { PrismaClient } from "@/generated/prisma/client";
import { requireAudit } from "@/server/context";

/**
 * Neon's WebSocket driver, because the audited write path needs interactive
 * transactions (the HTTP driver can't do them). Behind the corp proxy only
 * 443 is tunnelled, so ws has to be handed a proxy agent; on Vercel no proxy
 * is configured and this falls through to a plain connection.
 */
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

function createClient() {
  // Pass connection config, not a Pool instance: the adapter distinguishes
  // its two constructor overloads at runtime, and a Pool built from a
  // different module instance gets misread as a config object.
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL,
  });

  return new PrismaClient({ adapter }).$extends({
    query: {
      radar: {
        /**
         * The audit guard. Without it, one `db.radar.update()` tucked into a
         * component would silently punch a hole in the history, and nothing
         * would fail loudly enough to notice. A few lines to make that
         * impossible rather than merely discouraged.
         */
        async update({ args, query }) {
          requireAudit("radar.update");
          return query(args);
        },
        async updateMany({ args, query }) {
          requireAudit("radar.updateMany");
          return query(args);
        },
        async upsert({ args, query }) {
          requireAudit("radar.upsert");
          return query(args);
        },
        async delete() {
          throw new Error(
            "Radars are never hard-deleted — close them as Not To Be Fixed or Withdrawn instead.",
          );
        },
        async deleteMany() {
          throw new Error("Radars are never hard-deleted.");
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof createClient>;

// Next dev reloads modules on every edit; without this each reload would open
// a fresh pool and Neon would start refusing connections.
const globalForDb = globalThis as unknown as { db?: ExtendedClient };

export const db: ExtendedClient = globalForDb.db ?? createClient();

if (process.env.NODE_ENV !== "production") globalForDb.db = db;
