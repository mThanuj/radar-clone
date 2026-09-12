import "server-only";
import { promises as dns } from "node:dns";

/**
 * Does this email's domain actually accept mail?
 *
 * Catches typos like "gmial.com" at sign-up, before anything is queued. It
 * cannot prove a specific mailbox exists — only a verification email does
 * that — but it rejects the large class of addresses that could never receive
 * one.
 *
 * **Fails open by design.** Only a definitive negative answer from DNS
 * (NXDOMAIN, or a domain with no MX and no A record) rejects. Any other
 * outcome — timeout, SERVFAIL, no resolver reachable — is treated as valid,
 * because a DNS problem on our side must never stop someone signing up. This
 * sandbox refuses DNS outright, so the check is effectively skipped here and
 * only does real work in deployed environments.
 */
const LOOKUP_TIMEOUT_MS = 2500;

const DEFINITIVE_FAILURES = new Set(["ENOTFOUND", "NXDOMAIN"]);

export async function hasMailExchanger(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain || !domain.includes(".")) return false;

  const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("dns-timeout")), LOOKUP_TIMEOUT_MS),
      ),
    ]);

  try {
    const records = await withTimeout(dns.resolveMx(domain));
    if (records.length > 0) return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!code || !DEFINITIVE_FAILURES.has(code)) return true; // fail open
    // ENOTFOUND from resolveMx can still mean "no MX but has A", so fall
    // through to the A-record check before rejecting.
  }

  // RFC 5321: a domain with an A record but no MX still accepts mail there.
  try {
    const addresses = await withTimeout(dns.resolve4(domain));
    return addresses.length > 0;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return !code || !DEFINITIVE_FAILURES.has(code);
  }
}
