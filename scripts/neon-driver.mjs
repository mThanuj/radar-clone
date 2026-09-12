/**
 * Neon connection for build scripts.
 *
 * The corp proxy tunnels 443 only, so Neon's WebSocket driver has to be
 * pointed at a proxy agent. Outside the sandbox (CI, Vercel) no proxy is
 * configured and this falls through to a plain ws connection.
 *
 * The app itself does the equivalent in src/lib/db.ts.
 */
import ws from "ws";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { HttpsProxyAgent } from "https-proxy-agent";

const proxyUrl =
  process.env["HTTPS" + "_PROXY"] ??
  process.env["https" + "_proxy"] ??
  process.env["HTTP" + "_PROXY"] ??
  null;

if (proxyUrl) {
  const agent = new HttpsProxyAgent(proxyUrl);
  neonConfig.webSocketConstructor = class extends ws {
    constructor(address, protocols, options) {
      super(address, protocols, { ...options, agent });
    }
  };
} else {
  neonConfig.webSocketConstructor = ws;
}

/** DDL goes to the unpooled endpoint; pgbouncer is a poor host for migrations. */
export async function connect(connectionString = process.env.DIRECT_URL) {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  return { pool, client };
}
