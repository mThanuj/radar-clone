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
};

const auditStorage = new AsyncLocalStorage<AuditContext>();

/** Wrap a sanctioned mutation. Only src/server/**\/mutations.ts should call this. */
export function withAudit<T>(
  actorId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  return auditStorage.run({ actorId, sanctioned: true }, fn);
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
