import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

/**
 * SMTP transport.
 *
 * SMTP config is required (see src/lib/env.ts), so there is no "no host
 * configured" path — the only way to get the rendering transport is to ask for
 * it explicitly with EMAIL_TRANSPORT=json, which the test suite does. That way
 * a forgotten variable is a startup error, not silently swallowed mail.
 */
let cached: Transporter | null = null;

export function isLiveMail(): boolean {
  return env.EMAIL_TRANSPORT === "smtp";
}

export function fromAddress(): string {
  return env.SMTP_FROM;
}

export function getTransport(): Transporter {
  if (cached) return cached;

  if (!isLiveMail()) {
    cached = nodemailer.createTransport({ jsonTransport: true });
    return cached;
  }

  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  return cached;
}

/** Tests and the reconfiguration path need to drop the memoized transport. */
export function resetTransport(): void {
  cached = null;
}

/**
 * Proves the SMTP credentials actually work, without sending anything.
 * Used by the startup check and the settings page.
 */
export async function verifyTransport(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await getTransport().verify();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
