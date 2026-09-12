import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who is performing the current mutation.
 *
 * Every audited write reads the actor from here rather than taking it as a
 * parameter that a caller could forget. src/lib/db.ts refuses to run
 * radar.update / radar.updateMany when this store is empty, so the only way
 * to change a radar is through a mutation that has declared who is doing it.
 */
export type AuditContext = {
  actorId: string | null;
  /** Set by updateRadar() etc. so the guard knows the write is sanctioned. */
  sanctioned: true;
  /**
   * Who got notified during this mutation. Collected here rather than threaded
   * through every return type, so the caller can push to them after commit
   * without each mutation having to carry the list back by hand.
   */
  recipients: Set<string>;
};

const auditStorage = new AsyncLocalStorage<AuditContext>();

/**
 * Wrap a sanctioned mutation and report who it notified.
 * Only src/server/**\/mutations.ts and action files should call this.
 */
export async function withAuditResult<T>(
  actorId: string | null,
  fn: () => Promise<T>,
): Promise<{ value: T; recipients: string[] }> {
  const recipients = new Set<string>();
  const value = await auditStorage.run(
    { actorId, sanctioned: true, recipients },
    fn,
  );
  return { value, recipients: [...recipients] };
}

/** Same, for callers that don't care who was notified. */
export async function withAudit<T>(
  actorId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  const { value } = await withAuditResult(actorId, fn);
  return value;
}

/** Called by recordActivity once fan-out knows who it reached. */
export function noteRecipients(userIds: string[]): void {
  const store = auditStorage.getStore();
  if (!store) return;
  for (const id of userIds) store.recipients.add(id);
}

export function currentAudit(): AuditContext | undefined {
  return auditStorage.getStore();
}

export function currentActorId(): string | null {
  return auditStorage.getStore()?.actorId ?? null;
}

export class UnauditedWriteError extends Error {
  constructor(operation: string) {
    super(
      `${operation} was called outside withAudit(). Radar writes must go ` +
        `through src/server/radars/mutations.ts so the activity trail stays complete.`,
    );
    this.name = "UnauditedWriteError";
  }
}

export function requireAudit(operation: string): void {
  if (!auditStorage.getStore()?.sanctioned) {
    throw new UnauditedWriteError(operation);
  }
}
