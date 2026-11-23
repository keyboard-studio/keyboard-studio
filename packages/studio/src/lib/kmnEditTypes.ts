// kmnEditTypes -- the shapes the Layout-tab commit actions take and give back. Kept apart from
// the working-copy store so the Open commit module can use them without importing the store.

import type { KmnEdit } from "@keyboard-studio/contracts";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A Layout-tab edit as the caller states it; the store assigns `seq` and `at` at commit. */
export type KmnEditInput = DistributiveOmit<KmnEdit, "seq" | "at">;

/** Why `commitKmnEdit` wrote nothing (FR-025). */
export type KmnEditRefusal =
  | "no-working-copy"
  | "locked"
  | "not-compiled"
  | "read-only"
  | "refused"
  /** On a keyboard opened for update the change needs the author's agreement and nothing can ask. */
  | "no-host";

/**
 * `pending`: on a keyboard opened for update the change is not in the file yet because the author
 * is being asked to agree to a reformat; it is recorded (and written) on agreement, and nothing
 * happens on a decline.
 */
export type CommitKmnEditResult = { ok: true; seqs: number[]; pending?: true } | { ok: false; reason: KmnEditRefusal };
