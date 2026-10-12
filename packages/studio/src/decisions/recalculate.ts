// recalculate — the provenance recalculation rule (spec 093 FR-002, US1
// scenarios 1–6, research §5). Generalises spec 014's `repropagate`
// no-clobber contract (R1–R6) from the touch surface to every decision.
//
// Given the decisions that changed, the rule revisits their downstream
// closure in the `requires` graph (`decisionDownstreamClosure`, T003) in
// derived order and applies the HANDOFF rule per record:
//
//   extracted       → re-run the module's `extract` against the (possibly
//                     new) starting point; a rejection by `validate` is
//                     treated as absent, as everywhere in the series.
//   default/derived → recompute: a module's `lookupDefault` re-runs for a
//                     default; a derived value recomputes through the
//                     caller's `recomputeValue` seam (the derivation
//                     functions live with the editors that own them).
//   asked           → keep the author's value; validate it against the
//                     new inputs. If it no longer fits: keep it, flag it,
//                     and re-propose — the recomputed value rides beside
//                     it as the record's `offered`, and the id is reported
//                     in `reproposed` so the wiring can raise the notice
//                     through `reproposalNoticeStore`. NEVER overwritten.
//   gated off       → the record is kept whole with `inactive: true`;
//                     when the gate clears the flag is removed and the
//                     record is restored unchanged.
//
// Collections (values carrying per-item provenance — the ruled flat enum
// `asked | derived | extracted` on items, 090 FR-006) follow the same rule
// per item when a fresh suggestion list is available: suggested items
// (`derived`/`extracted`) are replaced by the fresh list, hand-set items
// (`asked`) are kept, and a hand-set item whose basis vanished from the
// fresh list is an ORPHAN — kept, and its decision reported in
// `orphaned` so the surface can show it (R6: shown, not deleted).
//
// Pure: no stores, no I/O. The gate evaluation and the extract context are
// the caller's (the wiring derives gates from conditional routing over
// the post-change set, exactly as the live runner does); recompute
// functions for derived values are injected for the same reason
// `repropagate` took injected deps — the rule must not import editors.

import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import { deepEqual } from "./deepEqual.ts";
import { decisionDownstreamClosure } from "./downstreamClosure.ts";
import type { ExtractContext } from "./extractContext.ts";
import type { DecisionProvider } from "./replayKeyboard.ts";

/** Per-item provenance on collection items (090 FR-006, ruled flat enum). */
type ItemProvenance = "asked" | "derived" | "extracted";

interface ProvenancedItem {
  provenance: ItemProvenance;
  id?: unknown;
  [key: string]: unknown;
}

export interface RecalculateDeps {
  /** Resolve the providing module for a decision. */
  providerFor: DecisionProvider;
  /** All modules, for the closure's provider index. */
  modules: readonly QuestionModule[];
  /** The starting-point bundle re-extraction reads (may be a new base). */
  extractContext: ExtractContext;
  /** The bundle's source name for re-extracted records (catalog id preferred). */
  source?: string;
  /**
   * Gate evaluation over the post-change set: true when the decision is
   * currently gated ON. Absent = everything is active.
   */
  isActive?: (id: DecisionId, decisions: DecisionSet) => boolean;
  /**
   * Recompute a `derived` (or hookless `default`) decision's value from
   * the current decision set, or the fresh suggestion list for a
   * collection value. Return undefined when no recompute is available —
   * the record is then kept (never overwritten, never dropped).
   */
  recomputeValue?: (
    mod: QuestionModule,
    record: Decision,
    decisions: DecisionSet,
  ) => unknown;
  /**
   * Validate an `asked` value against its NEW inputs snapshot. Defaults
   * to the module's own `validate` (value-only, the landed contract).
   */
  validateValue?: (
    mod: QuestionModule,
    value: unknown,
    newInputs: Partial<Record<DecisionId, unknown>>,
  ) => boolean;
}

export interface RecalculateRequest {
  /** The decision set AFTER the change (changed records already carry their new values). */
  decisions: DecisionSet;
  /** The decisions that changed. */
  changed: ReadonlySet<DecisionId>;
  /** The derived order (`orderByDependencies` over the registry). */
  order: readonly DecisionId[];
  /**
   * Visit EVERY record in the set, not just the downstream closure of
   * `changed` (spec 093 T017: a starting-point change is a recalculation
   * whose cause sits outside the decision graph — every record is
   * downstream of it). The `changed` exemption still applies to any id
   * in `changed`; starting-point callers pass an empty set, so no record
   * stands exempt. Absent/false = the closure behaviour every other
   * caller relies on.
   */
  visitAll?: boolean;
}

export interface RecalculateResult {
  /** The updated decision set (a new object; untouched records keep their references). */
  decisions: DecisionSet;
  /** Ids whose value was recomputed / re-extracted in place. */
  recomputed: DecisionId[];
  /** `asked` ids kept but flagged, with the recomputed value as `offered`. */
  reproposed: DecisionId[];
  /** Ids newly marked `inactive` (gated off by the change). */
  inactivated: DecisionId[];
  /** Ids whose `inactive` flag cleared (gate restored; value unchanged). */
  reactivated: DecisionId[];
  /** Ids whose collection value holds orphaned hand-set items (kept, shown). */
  orphaned: DecisionId[];
}

/**
 * Snapshot a module's declared input values from a set: `requires` ∪
 * `snapshotInputs` — the spec 092 A2 channel, adopted here from the live
 * extraction pass's precedent (spec 093 final pass, decision recorded in
 * followups.md). Recalculate is a snapshot WRITER (it re-stamps `inputs`
 * on every record whose value it lands) and a snapshot READER (it
 * validates `asked` records against the new snapshot); a requires-only
 * snapshot would strip the A2 keys the extraction pass seeded — falsifying
 * the record's derivation provenance and making the two writers disagree
 * on the same record's shape — and would validate against a snapshot
 * missing declared data dependencies. `requires` first, so key order
 * matches the extraction pass's snapshot for the same module.
 */
function snapshotInputs(
  mod: QuestionModule,
  decisions: DecisionSet,
): Decision["inputs"] {
  const declared: DecisionId[] = [];
  for (const id of mod.requires ?? []) {
    if (!declared.includes(id)) declared.push(id);
  }
  for (const id of mod.snapshotInputs ?? []) {
    if (!declared.includes(id)) declared.push(id);
  }
  if (declared.length === 0) return undefined;
  const snapshot: NonNullable<Decision["inputs"]> = {};
  for (const required of declared) {
    const record = decisions[required];
    if (record !== undefined) snapshot[required] = record.value;
  }
  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

/** Run a module's extract with the series' rejection rule (rejected = absent). */
function runExtract(
  mod: QuestionModule,
  ctx: ExtractContext,
): unknown {
  if (mod.extract === undefined) return undefined;
  const value = mod.extract(ctx);
  if (value === undefined || value === null) return undefined;
  if (mod.validate !== undefined) {
    if (!mod.validate(value as string | string[] | undefined).ok) return undefined;
  }
  return value;
}

/** Run a module's lookup default (spec 092 shape). */
function runLookupDefault(
  mod: QuestionModule,
  ctx: ExtractContext,
): { value: unknown; source?: string } | undefined {
  if (mod.lookupDefault === undefined) return undefined;
  const dflt = mod.lookupDefault(ctx);
  if (dflt === undefined || dflt.value === undefined || dflt.value === null) return undefined;
  if (mod.validate !== undefined) {
    if (!mod.validate(dflt.value as string | string[] | undefined).ok) return undefined;
  }
  return dflt.source === undefined
    ? { value: dflt.value }
    : { value: dflt.value, source: dflt.source };
}

/**
 * The would-be value for a record under the current inputs — used for
 * `derived`/`default` recompute and as the re-proposal beside a kept
 * `asked` value. Undefined when no source can produce one.
 */
function computeFreshValue(
  mod: QuestionModule,
  record: Decision,
  decisions: DecisionSet,
  deps: RecalculateDeps,
): { value: unknown; source?: string } | undefined {
  if (record.provenance === "extracted") {
    const value = runExtract(mod, deps.extractContext);
    if (value === undefined) return undefined;
    return deps.source === undefined ? { value } : { value, source: deps.source };
  }
  const dflt = runLookupDefault(mod, deps.extractContext);
  if (dflt !== undefined) return dflt;
  if (deps.recomputeValue !== undefined) {
    const value = deps.recomputeValue(mod, record, decisions);
    if (value !== undefined) return { value };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Collections: values carrying per-item provenance (scenario 5)
// ---------------------------------------------------------------------------

function isProvenancedItem(v: unknown): v is ProvenancedItem {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p = (v as { provenance?: unknown }).provenance;
  return p === "asked" || p === "derived" || p === "extracted";
}

/**
 * Locate a value's collection: the value itself when it is an array of
 * provenanced items, else the first array-valued field of a plain object
 * whose members are provenanced items (the landed shape:
 * `CarvedLayoutValue.removals`). Returns a getter/replacer pair so the
 * merge writes back into the same shape it read.
 */
function locateCollection(
  value: unknown,
): { items: ProvenancedItem[]; replace: (items: ProvenancedItem[]) => unknown } | undefined {
  if (Array.isArray(value) && value.length > 0 && value.every(isProvenancedItem)) {
    const items = value as ProvenancedItem[];
    return { items, replace: (next) => next };
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(field) && field.length > 0 && field.every(isProvenancedItem)) {
        const items = field as ProvenancedItem[];
        return {
          items,
          replace: (next) => ({ ...(value as Record<string, unknown>), [key]: next }),
        };
      }
    }
  }
  return undefined;
}

/**
 * Merge a fresh suggestion list into a collection value per item:
 * suggested items are replaced by the fresh ones (matched by `id` when
 * items carry one — a fresh item with a known id supersedes the old
 * suggested item in place; fresh items with new ids append), hand-set
 * items are kept untouched, and a hand-set item whose id is absent from
 * the fresh list is an orphan (kept; reported via the return flag).
 * Suggested items whose ids vanish from the fresh list are dropped —
 * they were the studio's proposal, and the studio withdrew it (a
 * hand-set item in the same position is never dropped: R6).
 */
function mergeCollection(
  current: ProvenancedItem[],
  fresh: ProvenancedItem[],
): { items: ProvenancedItem[]; hasOrphans: boolean } {
  const keyOf = (item: ProvenancedItem, index: number): unknown =>
    item.id !== undefined ? item.id : `\u0001${index}`;
  const freshByKey = new Map<unknown, ProvenancedItem>();
  fresh.forEach((item, i) => freshByKey.set(keyOf(item, i), item));
  const usedFresh = new Set<unknown>();
  let hasOrphans = false;

  const merged: ProvenancedItem[] = [];
  current.forEach((item, i) => {
    const key = keyOf(item, i);
    if (item.provenance === "asked") {
      merged.push(item);
      if (item.id !== undefined && !freshByKey.has(key)) hasOrphans = true;
      if (freshByKey.has(key)) usedFresh.add(key);
      return;
    }
    const replacement = freshByKey.get(key);
    if (replacement !== undefined) {
      merged.push(replacement);
      usedFresh.add(key);
    }
    // A suggested item with no fresh counterpart is withdrawn — dropped.
  });
  fresh.forEach((item, i) => {
    const key = keyOf(item, i);
    if (!usedFresh.has(key) && item.provenance !== "asked") merged.push(item);
  });
  return { items: merged, hasOrphans };
}

/**
 * Land a fresh value on a record: per-item collection merge when both the
 * current and fresh values carry a collection in the same shape (scenario
 * 5 — hand-set items survive any provenance's refresh), wholesale replace
 * otherwise. Returns the next record (or the original reference when
 * nothing changed) plus the orphan signal.
 */
function landFreshValue(
  record: Decision,
  fresh: { value: unknown; source?: string },
  newInputs: Decision["inputs"],
): { record: Decision; changed: boolean; hasOrphans: boolean } {
  const currentLoc = locateCollection(record.value);
  const freshLoc = locateCollection(fresh.value);
  if (currentLoc !== undefined && freshLoc !== undefined) {
    const merged = mergeCollection(currentLoc.items, freshLoc.items);
    const nextValue = currentLoc.replace(merged.items);
    if (deepEqual(nextValue, record.value)) {
      return { record, changed: false, hasOrphans: merged.hasOrphans };
    }
    return {
      record: {
        ...record,
        value: nextValue,
        ...(fresh.source !== undefined ? { source: fresh.source } : {}),
        ...(newInputs !== undefined ? { inputs: newInputs } : {}),
      },
      changed: true,
      hasOrphans: merged.hasOrphans,
    };
  }
  if (deepEqual(fresh.value, record.value)) {
    return { record, changed: false, hasOrphans: false };
  }
  return {
    record: {
      ...record,
      value: fresh.value,
      ...(fresh.source !== undefined ? { source: fresh.source } : {}),
      ...(newInputs !== undefined ? { inputs: newInputs } : {}),
    },
    changed: true,
    hasOrphans: false,
  };
}

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

/**
 * Recalculate the downstream closure of `changed` under the provenance
 * rule. The changed records themselves stand as written (an author's new
 * answer is never recalculated away); every downstream record is visited
 * in derived order so an upstream recompute is visible to the downstream
 * records that read it.
 */
export function recalculate(
  deps: RecalculateDeps,
  request: RecalculateRequest,
): RecalculateResult {
  const { order } = request;
  const changed = request.changed;
  const closure = decisionDownstreamClosure(deps.modules, changed);

  const working: Record<string, Decision<unknown>> = { ...request.decisions };
  const recomputed: DecisionId[] = [];
  const reproposed: DecisionId[] = [];
  const inactivated: DecisionId[] = [];
  const reactivated: DecisionId[] = [];
  const orphaned: DecisionId[] = [];

  const isActive = (id: DecisionId): boolean =>
    deps.isActive === undefined ? true : deps.isActive(id, working);

  // Visit set: the closure, plus every currently-inactive record (its
  // gate may have cleared even when it sits outside this change's
  // requires-closure — gates ride routing, not `requires`). Under
  // `visitAll` (T017) the set is the whole record set.
  const visit = new Set<DecisionId>(closure);
  if (request.visitAll === true) {
    for (const id of Object.keys(working)) visit.add(id as DecisionId);
  }
  for (const [id, record] of Object.entries(working)) {
    if (record !== undefined && record.inactive === true) {
      visit.add(id as DecisionId);
    }
  }

  const orderedVisit = order.filter((id) => visit.has(id));
  // Records outside the derived order still get their gate check.
  for (const id of visit) {
    if (!order.includes(id)) orderedVisit.push(id);
  }

  for (const id of orderedVisit) {
    const record = working[id];
    if (record === undefined) continue;
    if (changed.has(id)) continue;
    const mod = deps.providerFor(id);

    // Scenario 6: gating first — it overrides provenance processing.
    if (!isActive(id)) {
      if (record.inactive !== true) {
        working[id] = { ...record, inactive: true };
        inactivated.push(id);
      }
      continue;
    }
    if (record.inactive === true) {
      const { inactive: _dropped, ...rest } = record;
      working[id] = rest as Decision;
      reactivated.push(id);
      continue; // restored unchanged — no provenance processing this pass
    }
    if (mod === undefined) continue;

    const newInputs = snapshotInputs(mod, working);

    switch (record.provenance) {
      case "extracted":
      case "default":
      case "derived": {
        const fresh = computeFreshValue(mod, record, working, deps);
        if (fresh === undefined) break;
        const landed = landFreshValue(record, fresh, newInputs);
        if (landed.changed) {
          working[id] = landed.record;
          recomputed.push(id);
        }
        if (landed.hasOrphans) orphaned.push(id);
        break;
      }
      case "asked": {
        const valid =
          deps.validateValue !== undefined
            ? deps.validateValue(mod, record.value, newInputs ?? {})
            : mod.validate === undefined
              ? true
              : mod.validate(record.value as string | string[] | undefined).ok;
        if (valid) break; // scenario 3: kept unchanged
        // Scenario 4: kept, flagged, re-proposed beside the recomputed
        // value — never overwritten.
        const fresh = computeFreshValue(mod, record, working, deps);
        if (fresh !== undefined && !deepEqual(fresh.value, record.value)) {
          working[id] = { ...record, offered: fresh.value };
        }
        reproposed.push(id);
        break;
      }
    }
  }

  return {
    decisions: working as DecisionSet,
    recomputed,
    reproposed,
    inactivated,
    reactivated,
    orphaned,
  };
}
