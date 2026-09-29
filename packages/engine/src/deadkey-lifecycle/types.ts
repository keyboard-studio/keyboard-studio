/**
 * deadkey-lifecycle — shared types for spec 083 (deadkey lifecycle
 * authoring, issue #1849), Phase 2.
 *
 * Every lifecycle mutation in this module returns a {@link DeadkeyMutationResult}:
 * success carries the new IR plus the affected deadkey's inventory entry; a
 * conflict carries a list of {@link DeadkeyConflict} describing exactly what
 * collided, with enough structured data (ids, trigger keys, names, referrer
 * descriptions) for the studio to render choice buttons. The engine never
 * picks a resolution — explicit-over-silent (spec §"Design decisions").
 *
 * Numeric ids only. Nothing in this module writes `dk(name)` into rules:
 * pre-076 FR-004 the codec cannot round-trip named ids, so a non-numeric
 * rename target is refused as {@link DeadkeyConflictKind} `"named-id-unavailable"`.
 *
 * @see specs/083-deadkey-lifecycle/spec.md
 * @see specs/083-deadkey-lifecycle/plan.md (Phase 2)
 */

import type { DeadkeyInfo, KeyboardIR } from "@keyboard-studio/contracts";

/**
 * The vocabulary of conflicts a deadkey lifecycle action can report.
 *
 * - `"id-in-use"` — the requested numeric id is already minted by another
 *   deadkey (define) or rename target (rename).
 * - `"trigger-in-use"` — the requested trigger key already triggers a
 *   *different* deadkey (define, retarget), or two deadkey refs with
 *   different names share one trigger (applyAssignments S-02 merge).
 * - `"named-id-unavailable"` — a non-numeric rename target. The codec cannot
 *   round-trip `dk(name)` until 076 FR-004 lands, so the rename is refused
 *   rather than written as something the compiler cannot read back.
 * - `"referenced"` — delete was refused because rules or store items outside
 *   the deadkey's entity still reference its id (or its private stores).
 * - `"store-in-use"` — a lifecycle action was refused because writing this
 *   deadkey's conventional fan-out store names would clobber an unrelated
 *   existing store (define onto orphaned `dk_<hex>_*` stores; rename onto a
 *   target whose conventional names already exist). Pathological: reachable
 *   only when the IR already carries orphaned `dk_<hex>_*` stores.
 */
export type DeadkeyConflictKind =
  | "id-in-use"
  | "trigger-in-use"
  | "named-id-unavailable"
  | "referenced"
  | "store-in-use";

/**
 * One explicit conflict surfaced by a lifecycle action instead of a silent
 * write. Carries structured participants so the studio (Phase 3) can render
 * the merge / reassign / cancel choice buttons without re-deriving them.
 */
export interface DeadkeyConflict {
  /** What collided. */
  kind: DeadkeyConflictKind;
  /** Human-readable description of the collision (studio may reword). */
  message: string;
  /** Numeric deadkey ids involved, when known. */
  ids?: number[];
  /** Trigger keys (vkey names) involved, when relevant. */
  keys?: string[];
  /**
   * Deadkey *names* involved (the S-02 pattern's `deadkeyName` slot or an
   * opaque `dk(name)`), when the collision is about names rather than
   * numeric ids — e.g. two refs sharing a trigger with different
   * `deadkeyName` values.
   */
  names?: string[];
  /**
   * Human-readable referrer descriptions for `"referenced"` conflicts, e.g.
   * `group "main" rule r#7 — dk(3001) in context`. Enough for the studio to
   * name what blocks the delete.
   */
  referrers?: string[];
}

/**
 * Result of a deadkey lifecycle mutation. Success is total: the returned IR
 * is the fully-rewritten clone and the validator-clean invariant holds
 * (asserted in tests via `validateDeadkeyLifecycle`). Failure is explicit:
 * the input IR is untouched and every detected collision is reported —
 * never a partial write.
 */
export type DeadkeyMutationResult =
  | {
      ok: true;
      /** The rewritten IR. The caller's IR is never mutated (see below). */
      ir: KeyboardIR;
      /**
       * The affected deadkey's inventory entry after the mutation — for
       * delete, the entry as it was *before* removal (it no longer exists
       * afterwards).
       */
      deadkey: DeadkeyInfo;
    }
  | { ok: false; conflicts: DeadkeyConflict[] };

/** Options for {@link defineDeadkey}. */
export interface DefineDeadkeyOptions {
  /**
   * Trigger key as a vkey name (e.g. `"K_QUOTE"`). Any key is accepted —
   * the old 4-key restriction is gone (spec US1).
   */
  triggerKey: string;
  /**
   * Numeric id. Defaults to `allocateDeadkeyId(ir)` — auto-unique, never
   * re-minting grandfathered codepoint-derived legacy ids.
   */
  id?: number;
  /**
   * Optional author-chosen name. Stored as the `@deadkey:<hexid> name=<name>`
   * trailing-comment token on the trigger rule (Phase 1 carrier); never
   * written as `dk(name)` pre-FR-004.
   */
  authorName?: string;
  /**
   * The character emitted on double-tap of the trigger (the escape rule's
   * output). Required: the studio's define flow proposes a value per spec
   * §3c; the engine keeps it required so the escape rule is never blank.
   */
  accentChar: string;
}

/** Options for {@link renameDeadkey}. */
export interface RenameDeadkeyOptions {
  /** Numeric id of the deadkey to rename. */
  from: number;
  /**
   * New numeric id. Non-numeric values are refused with
   * `"named-id-unavailable"` — 076 FR-004 (named-deadkey codec closure) is
   * the prerequisite for real `dk(name)` ids.
   */
  to: number;
}

/** Options for {@link deleteDeadkey}. */
export interface DeleteDeadkeyOptions {
  /** Numeric id of the deadkey to delete. */
  id: number;
}

/** Options for {@link retargetDeadkey}. */
export interface RetargetDeadkeyOptions {
  /** Numeric id of the deadkey to move. */
  id: number;
  /** New trigger key as a vkey name. */
  newTriggerKey: string;
}
