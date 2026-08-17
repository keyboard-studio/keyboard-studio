// keyEditOrphanReport — re-derivation resilience for the key edit overlay
// (spec 063 FR-033b; contracts/key-edit-overlay.md §8).
//
// ## The problem
//
// `replayKeyEditOverlay` (engine) already classifies every overlay operation
// as resolvable or orphaned against a NEW layout — the underlying resolver
// is total and never throws. That is enough to satisfy "detected", but not
// "reported": an orphan's OWN fields rarely carry a character. Four of the
// seven operation kinds — `rename`, `remove`, `suppress`, `removeSubKey` —
// name an EXISTING key (or sub-entry) by address alone; they never repeat
// its content, because the whole point of an address is to avoid repeating
// it. `touchKeyAddress`'s silent-miss behaviour is correct for the deletion
// overlay (a stale address there is harmless idempotence); for the edit
// overlay a silently-dropped `remove`/`suppress`/`rename` is real data loss,
// and FR-033b requires naming what was lost, not just that something was.
//
// ## The correlation this module performs
//
// The character an orphaned op would have affected is NOT visible in the
// NEW (re-derived) layout — the op didn't resolve there, that's the whole
// problem. It IS visible in the layout the op was originally authored
// against: the PRIOR seed, with every op committed before this one already
// replayed on top of it (contract §5: "an operation's address resolves
// against the layout state the operations before it produced" — this is
// exactly what the author was looking at the moment they committed this
// op). So for each orphan this module:
//
//   1. Takes the fast path first: `declaredOperationOutput` (engine,
//      keyEditOps.ts) answers the THREE op kinds that author `output`
//      directly (`add`, `set`, `setSubKey`) with no layout lookup at all —
//      `add` in particular has nothing to resolve in the prior layout by
//      definition (the key didn't exist yet), so this is not just a fast
//      path for those three, it is the ONLY path for `add`.
//   2. Falls back, for the other four kinds (plus a `set`/`setSubKey` that
//      didn't happen to touch `output`), to replaying every op with a
//      smaller `seq` against `priorLayout` (`applyKeyEditsToLayout` — the
//      same applier `replayKeyEditOverlay` itself wraps) and resolving the
//      orphaned op's OWN address/sub-ref against that intermediate result,
//      via the ONE shared resolver (`resolveKeyAddress` / `resolveSubKeyEntry`
//      — contract §5, "shared, exactly once").
//   3. Reads the resolved key's characters the same three ways
//      `keyGridViewModel.ts`'s `collectProducedChars` does — `output`,
//      `decodeUnicodeKeyId(id)`, and (when a rule index for the PRIOR ir is
//      supplied) `producedByKeyId`. Deliberately NOT re-imported from that
//      module: it is framework-adjacent studio surface owned by a sibling
//      task (T063+ — the key grid view model), and this module has no
//      dependency on it; duplicating three lines is cheaper than coupling
//      an orphan-report utility to a gallery's view-model internals.
//
// A rule index is optional because a caller may not have one handy (or the
// prior ir may not be retained at all in some call site); `output` and
// `decodeUnicodeKeyId` are still credited without it — a smaller but never-
// wrong subset. Omitting it under-reports (misses a `T_*`/`K_*` key's
// rule-bound character); it never over-reports.
//
// ## The two remedies (FR-033b / contract §8)
//
//   - **Discard the orphaned edits**: `discardOrphanedKeyEdits` below is a
//     pure overlay filter, fully implemented — dropping ops by `seq` (their
//     stable identity per FR-032) needs nothing this module doesn't already
//     have.
//   - **Re-place through the FR-062 worklist**: `report.lostCharacters` is
//     the seam — the deduplicated, NFC-normalized union of every orphan's
//     lost character(s). The worklist itself is `useKeyEditGuards.ts`
//     (tasks.md T106, not yet built), which ALSO owns the FR-062
//     "last mechanism" reachability check (a character named here may still
//     be reachable via another key/mechanism elsewhere in the re-derived
//     layout — this module has no coverage model and does not attempt that
//     check; it only answers "what did this specific operation touch").
//
// ## Why this lives in the studio, not the engine
//
// The correlation needs the PRIOR layout (a specific author-session value,
// not a pure function of the overlay) and, optionally, a rule index built
// from the PRIOR ir. Neither belongs to `keyEditOps.ts`'s own domain (an
// operation-log module with no layout of its own) — see that module's
// `declaredOperationOutput` doc comment, which draws the same line. The
// pieces this module composes (`applyKeyEditsToLayout`, `replayKeyEditOverlay`,
// `resolveKeyAddress`, `resolveSubKeyEntry`, `declaredOperationOutput`) are
// all already exported from `@keyboard-studio/engine`'s top-level barrel;
// nothing here reaches into engine internals.
//
// ## Where this plugs in (the wiring seam)
//
// This module does not decide WHEN a re-derivation happened, or where the
// "prior layout" comes from — that is a live, in-session concern of the
// touch step's own state (the author navigates back, changes physical
// assignments, and returns — TouchGallery's `rawDetectionSeedLayout` memo
// recomputing on a `mods` change, per buildTouchLayoutJson.ts). Wiring a
// call to `buildKeyEditReDerivationReport` into that recompute (retaining
// the PRIOR `rawDetectionSeedLayout` value across the change) belongs to
// whichever task next touches that surface — this module is the tested,
// pure half of the seam, deliberately decoupled from it.

import type { TouchKeyIR, TouchLayoutIR, TouchKeyRuleIndex } from "@keyboard-studio/contracts";
import { decodeUnicodeKeyId, producedByKeyId } from "@keyboard-studio/contracts";
import {
  applyKeyEditsToLayout,
  replayKeyEditOverlay,
  resolveKeyAddress,
  resolveSubKeyEntry,
  parseTouchKeyAddress,
  declaredOperationOutput,
  type KeyEditOperation,
  type KeyEditOverlay,
} from "@keyboard-studio/engine";

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

export interface OrphanedKeyEditEntry {
  /** The orphaned operation itself — every field the caller might want to
   *  show (kind, seq, scope) travels with it rather than being re-projected
   *  into a parallel shape. */
  readonly op: KeyEditOperation;
  /** Same as `op.address` — surfaced so a caller that only iterates entries
   *  never needs to reach into `op`. */
  readonly address: string;
  /**
   * Characters whose placement is understood to be lost, NFC-normalized and
   * deduplicated. Empty when neither the operation's own declared output nor
   * the prior-layout resolution could name one — e.g. a bare `T_*` id with no
   * `output`, no rule binding, and no rule index supplied. An empty array is
   * a real, reportable "no character identified", not a failure of this
   * function — the caller still names the AFFECTED KEY via `op`/`address`
   * even when no character comes with it.
   */
  readonly lostChars: readonly string[];
}

export interface KeyEditReDerivationReport {
  /** One entry per orphaned operation, in the same order `replayKeyEditOverlay`
   *  returned them. */
  readonly orphaned: readonly OrphanedKeyEditEntry[];
  /** Every diagnostic string from the underlying replay, unchanged. */
  readonly warnings: readonly string[];
  /** Deduplicated, NFC-normalized union of every entry's `lostChars` — the
   *  FR-062 worklist seam (see the module doc). */
  readonly lostCharacters: readonly string[];
}

export interface BuildKeyEditReDerivationReportOpts {
  /** The seed the overlay was authored against ("seed A"). */
  readonly priorLayout: TouchLayoutIR;
  /** The re-derived seed ("seed B") to replay the overlay against. */
  readonly newLayout: TouchLayoutIR;
  readonly overlay: KeyEditOverlay;
  /**
   * Rule index built from the PRIOR ir (`buildTouchKeyRuleIndex`, contracts),
   * for crediting a `T_*`/`K_*` key's rule-bound output. Omit when
   * unavailable — see the module doc's "rule index is optional" note.
   */
  readonly priorRuleIndex?: TouchKeyRuleIndex;
}

// ---------------------------------------------------------------------------
// Character extraction
// ---------------------------------------------------------------------------

function normalizeChars(chars: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const ch of chars) {
    if (ch.length > 0) out.add(ch.normalize("NFC"));
  }
  return [...out];
}

/**
 * Characters a resolved key (main or sub) is understood to carry — the same
 * three sources `keyGridViewModel.ts`'s `collectProducedChars` credits for a
 * grid cell (`output`, decoded `U_` id, rule join), duplicated here in
 * miniature rather than imported — see the module doc's "why this lives in
 * the studio" section for why this module has no dependency on that one.
 */
function keyChars(key: TouchKeyIR, ruleIndex: TouchKeyRuleIndex | undefined): string[] {
  const chars: string[] = [];
  if (key.output !== undefined && key.output.length > 0) chars.push(key.output);
  const decoded = decodeUnicodeKeyId(key.id);
  if (decoded !== undefined) chars.push(decoded);
  if (ruleIndex) chars.push(...producedByKeyId(ruleIndex, key.id));
  return normalizeChars(chars);
}

/**
 * Resolve what `op` affected in the layout it was ORIGINALLY authored
 * against — the prior seed, replayed with every op committed strictly
 * before this one (in commit order; `orderedOps` is already seq-sorted).
 * Returns `[]` (never throws) when nothing resolves.
 */
function lostCharsForOp(
  op: KeyEditOperation,
  priorLayout: TouchLayoutIR,
  orderedOps: readonly KeyEditOperation[],
  ruleIndex: TouchKeyRuleIndex | undefined,
): string[] {
  // Fast/only path for `add`, fast path for `set`/`setSubKey`: the operation
  // names its own new content directly, no layout lookup needed.
  const declared = declaredOperationOutput(op);
  const declaredChars: string[] = [];
  if (declared !== undefined && declared.length > 0) declaredChars.push(declared);
  if (op.kind === "add") {
    const decoded = decodeUnicodeKeyId(op.key.id);
    if (decoded !== undefined) declaredChars.push(decoded);
    // `add` has nothing to resolve in the PRIOR layout — the key did not
    // exist there by definition. Whatever was declared on the op is the
    // whole answer.
    return normalizeChars(declaredChars);
  }
  if (declaredChars.length > 0) {
    return normalizeChars(declaredChars);
  }

  // `rename` / `remove` / `suppress` / `removeSubKey` (and a `set`/
  // `setSubKey` that didn't touch `output`): resolve the op's own address
  // against the state its own earlier siblings produced from the PRIOR seed.
  const parts = parseTouchKeyAddress(op.address);
  if (!parts) return [];

  const priorOps = orderedOps.filter((o) => o.seq < op.seq);
  const { layout: asAuthored } = applyKeyEditsToLayout(priorLayout, priorOps);

  const resolved = resolveKeyAddress(asAuthored, parts);
  if (!resolved) return [];

  if (op.kind === "setSubKey" || op.kind === "removeSubKey") {
    const subLoc = resolveSubKeyEntry(resolved.key, op.sub);
    return subLoc ? keyChars(subLoc.key, ruleIndex) : [];
  }

  return keyChars(resolved.key, ruleIndex);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the FR-033b re-derivation report: classify every overlay op as
 * resolvable/orphaned against `newLayout` (via `replayKeyEditOverlay`), then
 * — for each orphan — name the character(s) whose placement is lost by
 * resolving the SAME address/sub-ref against `priorLayout` as the overlay's
 * earlier ops left it. Pure; never throws (mirrors `replayKeyEditOverlay`'s
 * own total contract) and does not mutate any input.
 */
export function buildKeyEditReDerivationReport(
  opts: BuildKeyEditReDerivationReportOpts,
): KeyEditReDerivationReport {
  const { priorLayout, newLayout, overlay, priorRuleIndex } = opts;
  const orderedOps = [...overlay.ops].sort((a, b) => a.seq - b.seq);
  const { orphaned, warnings } = replayKeyEditOverlay(newLayout, overlay);

  const entries: OrphanedKeyEditEntry[] = orphaned.map((op) => ({
    op,
    address: op.address,
    lostChars: lostCharsForOp(op, priorLayout, orderedOps, priorRuleIndex),
  }));

  const lostCharacters = normalizeChars(entries.flatMap((entry) => entry.lostChars));

  return { orphaned: entries, warnings, lostCharacters };
}

/**
 * Discard remedy (FR-033b / contract §8's "offering to discard the orphaned
 * operations"): a pure filter removing the ops named by `seqsToDrop` (the
 * overlay's own stable identity per FR-032 — "seq… also the undo/redo key")
 * from `overlay.ops`. Callers typically pass
 * `report.orphaned.map((entry) => entry.op.seq)` to discard every orphan
 * from a report built above, but any subset of seqs is accepted — an author
 * may choose to discard only some of the reported operations and re-place
 * the rest through the FR-062 worklist instead.
 *
 * Wiring this into a store action + UI affordance is future work (the
 * re-derivation warning surface itself does not exist yet); this function
 * is the pure half of that seam.
 */
export function discardOrphanedKeyEdits(
  overlay: KeyEditOverlay,
  seqsToDrop: readonly number[],
): KeyEditOverlay {
  if (seqsToDrop.length === 0) return overlay;
  const drop = new Set(seqsToDrop);
  return { ops: overlay.ops.filter((op) => !drop.has(op.seq)) };
}
