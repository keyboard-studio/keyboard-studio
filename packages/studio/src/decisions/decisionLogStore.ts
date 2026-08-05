// decisionLogStore — the append-only per-keyboard decision log
// (specs/053-decision-audit, FR-003).
//
// APPEND-ONLY IS THE WHOLE POINT, so it is worth being precise about what that
// means here. Three things are immutable from the moment an entry exists: its
// `payload`, its `provenance`, and its `supersedes` link. Those are the record of
// what the author decided, and rewriting one would make the trail lie. Revisiting
// a decision therefore never edits the old entry — it appends a NEW entry whose
// `supersedes` names the old one, and the old one stays visible as history
// (FR-015).
//
// There is exactly ONE narrow exception, `attachImpact`, and it exists because
// impact cannot be known at append time: capturing it needs the projected `.kmn`
// text, which resolves asynchronously (see snapshotSource.ts). `attachImpact`
// fills `impact` once, from absent to a value, and refuses to overwrite. It
// cannot touch any other field. Everything else about the entry is frozen.
//
// Supersession forms CHAINS, never trees: an append that supersedes walks to the
// tip of the existing chain first, so a step revisited five times leaves one
// linear history rather than five siblings all claiming to replace the original.
//
// No persistence of its own — draftPersistence.ts snapshots and rehydrates this
// store, the same arrangement phaseBDraftStore.ts has.

import { create } from "zustand";
import {
  DECISION_RECORD_FORMAT,
  DECISION_RECORD_VERSION,
  makeEmptyDecisionRecord,
  supersededEntryIds,
  type DecisionEntry,
  type DecisionImpact,
  type DecisionPayload,
  type DecisionProvenance,
  type DecisionRecord,
} from "@keyboard-studio/contracts";
import { normalizeDecisionRecord } from "@keyboard-studio/engine";

/**
 * A decision to record. The store owns `entryId`, `recordedAt`, and `supersedes`
 * — a caller cannot forge an id or claim a supersession, which is what keeps the
 * chain invariant enforceable in one place.
 */
export interface DecisionEntryInput {
  stepId: string;
  payload: DecisionPayload;
  provenance: DecisionProvenance;
}

/** The persisted shape. An alias, so the record has one representation, not two. */
export type DecisionRecordSnapshot = DecisionRecord;

export interface DecisionLogState {
  record: DecisionRecord;
  /**
   * Entries the last {@link DecisionLogState.hydrate} could not read.
   *
   * Kept in the store rather than recomputed because it is a fact about a read
   * that already happened — the trail shows a partial-read notice from it
   * (FR-011), and nothing can re-derive it once the bad text is gone.
   */
  droppedCount: number;

  /**
   * Record a decision.
   *
   * Returns the new `entryId`, or `null` when the call was a no-op because the
   * same value was re-recorded for the same slot. That no-op matters: walking
   * back and forward over a step without changing anything is ordinary
   * navigation, and it must not inflate the trail with entries that say nothing
   * happened (SC-002).
   */
  append: (input: DecisionEntryInput) => string | null;

  /**
   * Append an entry that explicitly replaces `previousEntryId`.
   *
   * Resolves to the tip of that entry's chain first, so the result is always a
   * chain. A `previousEntryId` that is not in the record appends without a link
   * rather than throwing — an audit log is not the place to fail an author's
   * session over a stale reference.
   */
  supersede: (previousEntryId: string, input: DecisionEntryInput) => string;

  /**
   * Attach the captured impact for an entry. See the module header: this is the
   * one field that can be written after append, once, and only if unset.
   */
  attachImpact: (entryId: string, impact: DecisionImpact) => void;

  /** The current record. */
  read: () => DecisionRecord;

  /** Replace the log wholesale from a restored draft or a packaged record. */
  hydrate: (record: DecisionRecord, droppedCount?: number) => void;

  /**
   * Stamp the keyboard identity onto the record, carrying every existing entry
   * forward verbatim (FR-004).
   *
   * Only `keyboardId` changes. Pre-identity entries keep their ids, payloads,
   * provenance, ordering, and `stepId` — including
   * {@link PRE_IDENTITY_STEP_ID} — because they are decisions that really were
   * made before the keyboard had a name.
   */
  setKeyboardId: (keyboardId: string | null) => void;

  /** Clear back to an empty record (start-over). */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for direct unit test, and so the invariants are
// readable without a store instance in scope.
// ---------------------------------------------------------------------------

/**
 * The delimiter between a slot key's parts.
 *
 * `U+0000` cannot occur in any of the identifiers composed below, so the key is
 * injective BY CONSTRUCTION rather than by an assumption about today's naming
 * conventions: two different (stepId, discriminant, id) triples can never
 * produce the same key. A printable separator would only be safe while every
 * id happens to exclude it — and nothing type-enforces that, so the guarantee
 * would quietly rest on a convention instead of on the alphabet.
 *
 * Written as an ESCAPE, deliberately. An earlier revision of this file spelled
 * the same delimiter as four raw `U+0000` BYTES in the source; `git` then types
 * the blob binary and renders "Binary files differ" instead of a diff, so every
 * change to this module — the module that enforces the append-only supersession
 * invariant — became unreviewable on GitHub. The escape is plain ASCII source
 * and produces the identical runtime string.
 */
const SLOT_DELIMITER = "\u0000";

/**
 * The "slot" a decision occupies, for deciding whether a new decision replaces
 * an earlier one.
 *
 * A survey answer's slot is its question within its step; an editor action's is
 * its editor within its step. Two different questions in the same step are two
 * slots and never supersede each other — which is exactly why the slot is not
 * just `stepId`. The single-letter middle part discriminates the payload kinds,
 * so a question and an editor that happen to share an id are still two slots.
 *
 * The key is compared with `===` and never parsed back apart.
 */
export function slotKeyOf(stepId: string, payload: DecisionPayload): string {
  const d = SLOT_DELIMITER;
  if (payload.kind === "survey-answer") return `${stepId}${d}q${d}${payload.questionId}`;
  if (payload.kind === "editor-action") return `${stepId}${d}e${d}${payload.actionType}`;
  // base-contribution (specs/055-legible-decision-trail D-11), recorded once at
  // `choose_base` by recordBaseContribution.ts. The slot only needs to exist
  // and not collide with a survey or editor slot; whether such an entry is ever
  // superseded is that producer's business, not this function's.
  return `${stepId}${d}b${d}${payload.kind}`;
}

/** Whether two payloads record the same decision with the same value. */
export function payloadsEqual(a: DecisionPayload, b: DecisionPayload): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "survey-answer" && b.kind === "survey-answer") {
    if (a.questionId !== b.questionId || a.answerType !== b.answerType) return false;
    // Locals so both sides stay narrowed inside the callback below (a closure
    // loses the narrowing of a property access).
    const av = a.value;
    const bv = b.value;
    if (typeof av !== "string" && typeof av !== "boolean" && typeof bv !== "string" && typeof bv !== "boolean") {
      return av.length === bv.length && av.every((v, i) => v === bv[i]);
    }
    return av === bv;
  }
  if (a.kind === "editor-action" && b.kind === "editor-action") {
    // Counts AND the sample: an editor step whose numbers match but whose
    // affected keys differ is a genuinely different edit, not a re-record.
    if (a.actionType !== b.actionType) return false;
    const x = a.summary;
    const y = b.summary;
    return (
      x.keysRemoved === y.keysRemoved &&
      x.keysAdded === y.keysAdded &&
      x.mechanismsAssigned === y.mechanismsAssigned &&
      x.touchKeysAffected === y.touchKeysAffected &&
      x.sampleTruncated === y.sampleTruncated &&
      x.sample.length === y.sample.length &&
      x.sample.every((v, i) => v === y.sample[i])
    );
  }
  if (a.kind === "base-contribution" && b.kind === "base-contribution") {
    // `startingKeyCount` is optional (absent means "not measured", never a
    // fabricated `0` — FR-005a). Plain `===` already tells `undefined` apart
    // from `0`, so no coalescing belongs here.
    if (
      a.baseId !== b.baseId ||
      a.baseDisplayName !== b.baseDisplayName ||
      a.startingKeyCount !== b.startingKeyCount ||
      a.instantiationMode !== b.instantiationMode
    ) {
      return false;
    }
    if (
      a.derivedAxes.length !== b.derivedAxes.length ||
      !a.derivedAxes.every((v, i) => v === b.derivedAxes[i])
    ) {
      return false;
    }
    return (
      a.inheritedMetadata.length === b.inheritedMetadata.length &&
      a.inheritedMetadata.every(
        (m, i) => m.field === b.inheritedMetadata[i]?.field && m.value === b.inheritedMetadata[i]?.value,
      )
    );
  }
  return false;
}

function provenanceEqual(a: DecisionProvenance, b: DecisionProvenance): boolean {
  return a.agency === b.agency && a.source === b.source;
}

/**
 * The live entry for a slot: the one in that slot which nothing has superseded.
 *
 * Scanning from the end finds it in one pass for the common case (the most
 * recent decision is usually the live one) and is correct in every case, since
 * only one entry per slot can be unsuperseded.
 */
export function liveEntryForSlot(
  entries: readonly DecisionEntry[],
  slotKey: string,
): DecisionEntry | undefined {
  const superseded = supersededEntryIds(entries);
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    if (superseded.has(entry.entryId)) continue;
    if (slotKeyOf(entry.stepId, entry.payload) === slotKey) return entry;
  }
  return undefined;
}

/**
 * Walk a supersession chain to its tip.
 *
 * Guards against a cycle in restored data by bounding the walk at the entry
 * count — a corrupt record must not hang the studio.
 */
export function chainTip(entries: readonly DecisionEntry[], entryId: string): string {
  const successorOf = new Map<string, string>();
  for (const entry of entries) {
    if (entry.supersedes !== null) successorOf.set(entry.supersedes, entry.entryId);
  }
  let current = entryId;
  for (let guard = 0; guard <= entries.length; guard++) {
    const next = successorOf.get(current);
    if (next === undefined) return current;
    current = next;
  }
  return current;
}

/** Highest numeric suffix among `d<n>`-shaped ids, so hydrate cannot reissue one. */
function highestSeq(entries: readonly DecisionEntry[]): number {
  let max = 0;
  for (const entry of entries) {
    const match = /^d(\d+)$/.exec(entry.entryId);
    if (match !== null) max = Math.max(max, Number(match[1]));
  }
  return max;
}

// Monotonic id counter, module-side like phaseBDraftStore's `picks`: it is
// bookkeeping, not state any component subscribes to.
let seq = 0;

/** Reset the id counter. Exported for tests that assert on exact entry ids. */
export function resetDecisionEntryIds(from = 0): void {
  seq = from;
}

function nextEntryId(): string {
  seq += 1;
  return `d${seq}`;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDecisionLogStore = create<DecisionLogState>((set, get) => ({
  record: makeEmptyDecisionRecord(),
  droppedCount: 0,

  append: (input) => {
    const { record } = get();
    const slot = slotKeyOf(input.stepId, input.payload);
    const live = liveEntryForSlot(record.entries, slot);

    if (live !== undefined) {
      if (
        payloadsEqual(live.payload, input.payload) &&
        provenanceEqual(live.provenance, input.provenance)
      ) {
        return null; // Identical revisit — nothing decided, nothing recorded.
      }
      return get().supersede(live.entryId, input);
    }

    const entry: DecisionEntry = {
      entryId: nextEntryId(),
      stepId: input.stepId,
      payload: input.payload,
      provenance: input.provenance,
      recordedAt: Date.now(),
      supersedes: null,
    };
    set({ record: { ...record, entries: [...record.entries, entry] } });
    return entry.entryId;
  },

  supersede: (previousEntryId, input) => {
    const { record } = get();
    const known = record.entries.some((e) => e.entryId === previousEntryId);
    const entry: DecisionEntry = {
      entryId: nextEntryId(),
      stepId: input.stepId,
      payload: input.payload,
      provenance: input.provenance,
      recordedAt: Date.now(),
      // Chain, not tree: link to the tip of the existing chain, and to nothing
      // at all when the referenced entry is not in this record.
      supersedes: known ? chainTip(record.entries, previousEntryId) : null,
    };
    set({ record: { ...record, entries: [...record.entries, entry] } });
    return entry.entryId;
  },

  attachImpact: (entryId, impact) => {
    const { record } = get();
    const index = record.entries.findIndex((e) => e.entryId === entryId);
    if (index === -1) return;
    // Write-once. A second capture for the same entry is ignored rather than
    // overwriting, so the stored diff is always the one taken at the boundary
    // the entry belongs to.
    if (record.entries[index]!.impact !== undefined) return;
    const entries = [...record.entries];
    entries[index] = { ...entries[index]!, impact };
    set({ record: { ...record, entries } });
  },

  read: () => get().record,

  hydrate: (record, droppedCount = 0) => {
    // Every consumer of this store sees the normalized shape (specs/055 T008,
    // contract §5), regardless of how `record` got here. In the studio's own
    // read path it has already been normalized once, by the engine's
    // `parseDecisionRecord` — `normalizeDecisionRecord` is a no-op there (a
    // `version >= 2` record passes through by reference). This call is the
    // defensive second seam: nothing here mutates `record` or writes
    // anything back to storage; it only decides what goes into memory.
    const normalized = normalizeDecisionRecord(record);
    // Reissuing an id that a restored entry already uses would let a later
    // append collide with recorded history, so the counter jumps past whatever
    // came in.
    seq = Math.max(seq, highestSeq(normalized.entries));
    set({
      record: {
        format: DECISION_RECORD_FORMAT,
        // Whatever came in, what goes into memory is v2-shaped —
        // `normalizeDecisionRecord` guarantees that and already tags its
        // result accordingly. `Math.max` is this seam's own restatement of
        // that floor rather than a second opinion about it (see the module
        // header: hydrate is the DEFENSIVE seam, and it takes a record from
        // any caller). A newer build's record keeps its own higher version.
        //
        // What must never happen is a pre-v2 tag surviving into the store: a
        // restored v1 draft would stay tagged v1 for the whole session, and
        // since `draftPersistence` snapshots this state, the next read would
        // re-run the migration over every entry appended in between and strip
        // the counts those entries genuinely measured (FR-005a).
        version: Math.max(normalized.version, DECISION_RECORD_VERSION),
        keyboardId: normalized.keyboardId,
        entries: normalized.entries,
        truncated: normalized.truncated,
      },
      droppedCount,
    });
  },

  setKeyboardId: (keyboardId) => {
    const { record } = get();
    if (record.keyboardId === keyboardId) return;
    set({ record: { ...record, keyboardId } });
  },

  reset: () => {
    set({ record: makeEmptyDecisionRecord(), droppedCount: 0 });
  },
}));

/** Snapshot for the durable draft. The record is already JSON-safe. */
export function snapshotDecisionRecord(): DecisionRecordSnapshot {
  return useDecisionLogStore.getState().record;
}

/** Restore a snapshot into the log. `droppedCount` reports a partial read. */
export function applyDecisionRecordSnapshot(
  snapshot: DecisionRecordSnapshot,
  droppedCount = 0,
): void {
  useDecisionLogStore.getState().hydrate(snapshot, droppedCount);
}
