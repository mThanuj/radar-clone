import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP transport, or a no-op that renders instead of sending.
 *
 * With SMTP_HOST unset — local dev, CI, and tests — nodemailer's jsonTransport
 * builds the message and hands it back without touching the network. That means
 * the whole pipeline is exercised everywhere, and nothing can escape by
 * accident from a machine that was never configured to send.
 */
let cached: Transporter | null = null;

export function isLiveMail(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export function fromAddress(): string {
  return (
    process.env.SMTP_FROM ??
    process.env.SMTP_USER ??
    "Radar <radar@localhost>"
  );
}

export function getTransport(): Transporter {
  if (cached) return cached;

  if (!isLiveMail()) {
    cached = nodemailer.createTransport({ jsonTransport: true });
    return cached;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  return cached;
}

/** Tests and the reconfiguration path need to drop the memoized transport. */
export function resetTransport(): void {
  cached = null;
}
