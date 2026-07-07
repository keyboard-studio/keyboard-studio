// Store-slot removal: per-store-class dispatch for carving individual
// characters out of a store's items[] without breaking the rules that
// reference it.
//
// Originated as a single-purpose nul-fill transform for parallel-store
// deadkey patterns (the SIL Cameroon pattern). In that pattern, a rule like:
//
//   dk(003b) any(dkf003b) > index(dkt003b, 2)
//
// outputs ~83 characters: pressing the input key matching position P in
// `dkf003b` outputs `dkt003b[P]`. The FIRST approach to carving out ONE
// output character nul-filled the target slot in the output store only,
// leaving the input store untouched. That turned out to be unsafe on two
// counts:
//
//   1. Any store that was consumed BOTH as an any() input source AND as an
//      index()/outs() output target anywhere in the rule set (Cameroon's
//      `word` store is the paradigm case: `platform('touch') any(word)
//      any(final) + [K_SPACE] > index(word,2) index(final,3) ...` reads
//      AND writes `word` in the very same rule) was blocked from ANY edit
//      at all ("dual-use"), because the old classifier could not tell
//      whether the any() role and the index() role were positionally
//      related.
//   2. Even where nul-fill *was* applied (dkt003b), it created an INTERIOR
//      nul — a silent no-op sitting between real characters, rather than at
//      the store's existing TRAILING nul-padding tail — while the paired
//      INPUT store (dkf003b) kept the character that used to trigger it.
//      That is compile-clean (kmcmplib raises no new diagnostic) but the
//      idiom this codebase relies on is trailing-only nul padding; an
//      interior nul is unproven safe against the OSK runtime (e.g. keycap
//      captions), so it is avoided outright rather than shipped "probably
//      fine".
//
// The fix below replaces both problems with one mechanism: a **pairing
// graph** derived from every rule's `index()` output element, plus a
// **coordinated drop** (splice, never nul-fill) across every store the
// graph says is positionally tied to the one the caller targeted.
//
// --- Pairing graph -----------------------------------------------------
//
// For every rule whose output contains `index(B, n)`, resolve `n` as the
// 1-based ordinal of the rule's CONTEXT items, counted left-to-right and
// INCLUDING non-any() items (platform(), dk(), literal codepoints, vkeys —
// anything that occupies a context "slot"). The synthetic `{kind:"raw",
// text:"+"}` separator the codec inserts to mark the keystroke boundary is
// NOT a real kmcmplib context item (it is a codec/round-trip artifact), so
// it is excluded from the count before resolving `n`.
//
// If the n-th (post-`+`-exclusion) context item is `any(A)`, that is a
// resolved pairing: position i of A corresponds to position i of B for
// every i, because the compiled matcher reads A[i] and the compiled output
// writes B[i] for the SAME keystroke. `A` may equal `B` (Cameroon's `word`
// and `final` are self-paired this way — index(word,2) in a rule whose own
// context contains any(word) at position 2). Pairings union into pair-SETS
// (a store paired with two different stores in different rules joins one
// set), keyed by store NAME (rule elements reference stores by name, not
// nodeId).
//
// If the n-th context item does NOT resolve to an any() element (wrong
// kind, or n out of range), the target store's positions are load-bearing
// in a way this module cannot verify positionally — it is left in
// `unresolvedIndexOutputNames` and any edit to it (or to any store sharing
// its pair-set) is blocked, conservatively, rather than nul-filled.
//
// KNOWN LIMITATION (enforced, not just documented): this graph is built
// from a single per-rule scan of `rule.output` / `rule.context`. It cannot
// trace `index()` usage reached indirectly through `outs()`-nested group
// calls (e.g. an `outs(store)` output that hands control to another group
// whose OWN rules contain the real `index()` consumer) — a store whose
// only positional consumption is hidden behind such a call could otherwise
// be misclassified as unpaired-and-safe when it is not. Rather than accept
// that risk, ANY store referenced by `outs()` in ANY rule's output — in
// this IR, regardless of whether that particular usage looks positional —
// is blocked outright (`outs-reference-unanalyzed`), and the block
// propagates across its pair-set exactly like `unresolved-index-pairing`.
//
// --- Coordinated drop ---------------------------------------------------
//
// A slot removal on any store in a pair-set is applied to EVERY store in
// that pair-set at the SAME item index — never as a nul-fill. Multiple
// positions targeted in one call are removed together (via `Array#filter`,
// which is inherently order-independent — no manual descending-splice
// bookkeeping needed). Self-paired stores (pair-set of size 1) are the
// trivial case: only one store is spliced, so match position and
// index-lookup stay the same value by construction.
//
// A store referenced via `outs()` in some rule's output is blocked
// outright (see the KNOWN LIMITATION above) rather than treated as safe —
// `outs()` emits the whole store's contents inline into whatever rule set
// it hands control to, and this module cannot see far enough to prove no
// hidden `index()` consumer depends on that store's positions.
//
// Dropping never creates an interior nul: existing trailing nul padding
// (the Cameroon dkt* idiom) is untouched, and kmcmplib's Layer-A check #9
// (index-target length >= any()-source length) is preserved automatically
// because paired stores are always spliced at the same positions in the
// same call, so their relative lengths never diverge.
//
// Slot id encoding (the engine<->studio seam — do not change):
//   "<storeNodeId>#<itemsIndex>"  where itemsIndex is 0-based into IRStore.items.
//   This differs from whole-node deletion ids (bare nodeId, no `#`) so the two can be
//   unambiguously partitioned at the call site.
//
// baseIr is never mutated. Structural-sharing shallow copy:
//   { ...baseIr, stores: baseIr.stores.map(s => replacedById.get(s.nodeId) ?? s) }
// Untouched stores keep the same object reference; groups/comments/raw are passed
// through by reference.

import type { KeyboardIR, IRStore } from "@keyboard-studio/contracts";
import { parseSlotId } from "./slotId.js";
import { isPlusSeparator } from "../shared/rule-shape.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Result of {@link applyStoreSlotRemovals}.
 *
 * - `ir`           — new IR with targeted slots dropped (spliced), or left
 *                    alone (blocked) depending on each store's classification.
 * - `warnings`     — diagnostic messages for REAL problems only: malformed
 *                    ids, missing stores, blocked classes, refused
 *                    would-empty drops, and out-of-range/non-char indices
 *                    (empty array when nothing went wrong).
 * - `notices`      — informational messages about successful, expected
 *                    behavior — currently just the "dropped from every
 *                    member of a pair-set" confirmation when a drop was
 *                    coordinated. Never a problem; kept separate from
 *                    `warnings` so a UI surfacing `warnings` in an alert-severity
 *                    banner never renders a success notice as if it were one
 *                    (empty array when nothing noteworthy happened).
 * - `appliedCount` — number of individual store-item removals actually
 *                    performed (summed across every store in a coordinated
 *                    pair-set, not just the one the caller named).
 */
export interface StoreSlotRemovalResult {
  ir: KeyboardIR;
  warnings: string[];
  notices: string[];
  appliedCount: number;
}

/**
 * Reason a store's targeted slots were blocked from any edit.
 *
 * - `system-store`             — &-prefixed compiler-directive store (e.g. &NAME).
 * - `notany-widens`            — store appears in a `notany()` context element;
 *                                 dropping an item from it WIDENS the exclusion set
 *                                 (a char that used to be excluded would now match),
 *                                 changing matcher semantics.
 * - `context-index-aligned`    — store appears in an `index()` context element;
 *                                 its positions are read by the matcher itself, not
 *                                 just produced as output, so dropping isn't safe
 *                                 without deeper analysis.
 * - `unresolved-index-pairing`   — store (or a store in its pairing set) is targeted
 *                                   by `index()` in some rule's output, but the
 *                                   pairing graph could not resolve that index() to a
 *                                   matching any() source in the same rule's context.
 *                                   Blocked conservatively — a coordinated drop could
 *                                   not be proven safe.
 * - `outs-reference-unanalyzed` — store (or a store in its pairing set) is referenced
 *                                   by `outs()` in some rule's output anywhere in the
 *                                   IR. This module cannot trace `index()` consumption
 *                                   reached indirectly through an `outs()`-nested group
 *                                   call, so it fails CLOSED rather than risk treating
 *                                   a positionally-load-bearing store as safe to drop.
 *
 * (Replaces the earlier `dual-use` and `paired-input` reasons: both were
 * coarse stand-ins for "an any()-source and an index()-output target might
 * be positionally related, so refuse everything." The pairing graph now
 * resolves that relationship precisely and, when it resolves, treats it as
 * a normal coordinated `drop` rather than a block.)
 */
export type StoreSlotBlockReason =
  | "system-store"
  | "notany-widens"
  | "context-index-aligned"
  | "unresolved-index-pairing"
  | "outs-reference-unanalyzed";

/**
 * Per-store edit mode chosen by {@link classifyStoreSlotEdit}.
 *
 * `coordinatedWith` lists the OTHER store names (sorted, may be empty) that
 * a drop on this store will also splice at the same item index, because the
 * pairing graph ties them together. An empty array means a plain,
 * uncoordinated drop (unpaired any()-source, outs()-only output target, or
 * entirely unreferenced).
 */
export type StoreSlotEditMode =
  | { mode: "drop"; coordinatedWith: string[] }
  | { mode: "blocked"; reason: StoreSlotBlockReason };

// ---------------------------------------------------------------------------
// Pairing graph + usage analysis (built once per IR)
// ---------------------------------------------------------------------------

/** Usage flags for one store, keyed by name, gathered by a single scan over every rule. */
interface StoreUsageFlags {
  /** Store is a bare any() context source in some rule. */
  asAnySource: boolean;
  /** Store is a notany() context source in some rule. */
  asNotAny: boolean;
  /** Store is referenced by an index() context element in some rule (matcher reads it). */
  asContextIndex: boolean;
}

/** Full-IR analysis shared by {@link classifyStoreSlotEdit} and {@link applyStoreSlotRemovals}. */
interface StoreAnalysis {
  storeByName: Map<string, IRStore>;
  usageByName: Map<string, StoreUsageFlags>;
  /** name -> full pair-set (including itself) for every name touched by a resolved index()-output pairing. */
  pairSets: Map<string, Set<string>>;
  /** Names targeted by index() in some rule's output whose pairing could NOT be resolved to an any() source. */
  unresolvedIndexOutputNames: Set<string>;
  /** Names referenced by outs() in some rule's output anywhere in the IR — fail-closed, see the KNOWN LIMITATION note above analyzeStores. */
  outsReferencedNames: Set<string>;
}

/**
 * Scan every rule once and build the shared usage + pairing analysis for the
 * whole IR. Reimplemented inline rather than importing a studio helper — the
 * engine must not import from the studio package (team-boundary invariant, spec §12).
 */
function analyzeStores(ir: KeyboardIR): StoreAnalysis {
  const storeByName = new Map(ir.stores.map((s) => [s.name, s]));
  const usageByName = new Map<string, StoreUsageFlags>();
  const ensureUsage = (name: string): StoreUsageFlags => {
    let usage = usageByName.get(name);
    if (usage === undefined) {
      usage = { asAnySource: false, asNotAny: false, asContextIndex: false };
      usageByName.set(name, usage);
    }
    return usage;
  };

  // Union-find over store names, populated only for names touched by an
  // index()-output element (resolved or not) — everything else stays out of
  // the pairing structure entirely (plain drop, no coordination).
  const parent = new Map<string, string>();
  const ensureNode = (name: string) => {
    if (!parent.has(name)) parent.set(name, name);
  };
  const find = (name: string): string => {
    let root = name;
    for (let next = parent.get(root); next !== undefined && next !== root; next = parent.get(root)) {
      root = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    ensureNode(a);
    ensureNode(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const unresolvedIndexOutputNames = new Set<string>();
  const outsReferencedNames = new Set<string>();

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if (el.kind === "any") {
          ensureUsage(el.storeRef).asAnySource = true;
        } else if (el.kind === "notany") {
          ensureUsage(el.storeRef).asNotAny = true;
        } else if (el.kind === "index") {
          ensureUsage(el.storeRef).asContextIndex = true;
        }
      }

      // The n-th context item, per the pairing algorithm, excludes the
      // codec's synthetic `+` keystroke-boundary token.
      const effectiveContext = rule.context.filter((el) => !isPlusSeparator(el));

      for (const el of rule.output) {
        if (el.kind === "outs") {
          // Amendment 4: fail CLOSED on outs()-referenced stores — see the
          // KNOWN LIMITATION note above. Recorded regardless of whether this
          // particular outs() looks positional; any outs() reference is enough.
          outsReferencedNames.add(el.storeRef);
          continue;
        }
        if (el.kind !== "index") continue;
        ensureNode(el.storeRef);
        const target = effectiveContext[el.offset - 1];
        if (target !== undefined && target.kind === "any") {
          union(el.storeRef, target.storeRef);
        } else {
          unresolvedIndexOutputNames.add(el.storeRef);
        }
      }
    }
  }

  const membersByRoot = new Map<string, Set<string>>();
  for (const name of parent.keys()) {
    const root = find(name);
    let members = membersByRoot.get(root);
    if (members === undefined) {
      members = new Set<string>();
      membersByRoot.set(root, members);
    }
    members.add(name);
  }
  const pairSets = new Map<string, Set<string>>();
  for (const name of parent.keys()) {
    const members = membersByRoot.get(find(name));
    if (members !== undefined) pairSets.set(name, members);
  }

  return { storeByName, usageByName, pairSets, unresolvedIndexOutputNames, outsReferencedNames };
}

/**
 * Classify how slots in `store` may be edited, given the shared
 * whole-IR {@link StoreAnalysis}. Decision order (first match wins):
 *
 *   1. `store.isSystem`                                    → blocked "system-store"
 *   2. referenced by `notany()`                            → blocked "notany-widens"
 *   3. referenced by `index()` in context                  → blocked "context-index-aligned"
 *   4. any store in its pairing set is referenced by `outs()`
 *      anywhere in the IR (Amendment 4, fail-closed)         → blocked "outs-reference-unanalyzed"
 *   5. any store in its pairing set has unresolved index() pairing,
 *      or is itself system/notany/context-index-aligned     → blocked (that member's reason)
 *   6. otherwise                                            → "drop", coordinated with its
 *                                                              pair-set peers (may be empty)
 *
 * Steps 4-5 evaluate the WHOLE pair-set (not just `store` itself): a
 * coordinated drop touches every member, so if any member is unsafe to
 * touch, the whole coordinated group is unsafe from ANY entry point.
 */
function classifyStoreWithAnalysis(store: IRStore, analysis: StoreAnalysis): StoreSlotEditMode {
  if (store.isSystem) {
    return { mode: "blocked", reason: "system-store" };
  }

  const usage = analysis.usageByName.get(store.name);
  if (usage?.asNotAny === true) {
    return { mode: "blocked", reason: "notany-widens" };
  }
  if (usage?.asContextIndex === true) {
    return { mode: "blocked", reason: "context-index-aligned" };
  }

  const members = analysis.pairSets.get(store.name) ?? new Set([store.name]);

  for (const memberName of members) {
    if (analysis.outsReferencedNames.has(memberName)) {
      return { mode: "blocked", reason: "outs-reference-unanalyzed" };
    }
    if (analysis.unresolvedIndexOutputNames.has(memberName)) {
      return { mode: "blocked", reason: "unresolved-index-pairing" };
    }
    if (memberName === store.name) continue;
    const memberStore = analysis.storeByName.get(memberName);
    if (memberStore === undefined) continue; // unresolved peer name — nothing more to check
    if (memberStore.isSystem) {
      return { mode: "blocked", reason: "system-store" };
    }
    const memberUsage = analysis.usageByName.get(memberName);
    if (memberUsage?.asNotAny === true) {
      return { mode: "blocked", reason: "notany-widens" };
    }
    if (memberUsage?.asContextIndex === true) {
      return { mode: "blocked", reason: "context-index-aligned" };
    }
  }

  const coordinatedWith = [...members].filter((name) => name !== store.name).sort();
  return { mode: "drop", coordinatedWith };
}

/**
 * Classify how slots in `store` may be edited, given its usage across every
 * rule in `ir`. Thin wrapper over the shared analysis for callers that only
 * have one store to classify (e.g. the studio's chip classifier).
 *
 * @param store  The store whose slots are being targeted.
 * @param ir     The full IR (scanned for every rule's use of every store).
 */
export function classifyStoreSlotEdit(store: IRStore, ir: KeyboardIR): StoreSlotEditMode {
  return classifyStoreWithAnalysis(store, analyzeStores(ir));
}

/**
 * How `store` relates, positionally, to other stores per the pairing graph —
 * the single source of truth for a "Linked pair" style display. Distinct
 * from {@link StoreSlotEditMode}: a store can be display-"cross"/"self"
 * paired and STILL editable (mode "drop"), or pairing can be "unresolved"
 * while the store is blocked from editing — the two questions ("is this
 * store part of a positional mechanism, and with whom?" vs. "can slots be
 * edited?") are related but not the same, so callers that only need display
 * info (e.g. the studio's Inspector "Linked pair" panel) don't have to
 * reverse-engineer it from {@link StoreSlotEditMode}.
 *
 * - `"none"`   — `store` is never targeted by a resolved OR unresolved
 *                `index()`-output element anywhere in the IR: no positional
 *                pairing relationship at all (an ordinary any()-source or
 *                orphan store).
 * - `"self"`   — `store` participates in the pairing graph, and its
 *                pair-set contains ONLY itself (e.g. Cameroon's `word` and
 *                `final`, each independently self-paired by their own
 *                `any()`/`index()` in the SAME rule — NOT paired with each
 *                other). Input and output side of the same mechanism.
 * - `"cross"`  — `store`'s pair-set contains one or more OTHER named stores
 *                (`partners`, sorted); a coordinated drop splices all of
 *                them at the same position.
 * - `"unresolved"` — `store` (or a store in its pair-set) is targeted by
 *                `index()` whose pairing couldn't be resolved to an any()
 *                source, or is referenced by `outs()` anywhere in the IR —
 *                the same conditions {@link classifyStoreSlotEdit} blocks on.
 */
export type StorePairingDescription =
  | { kind: "none" }
  | { kind: "self" }
  | { kind: "cross"; partners: string[] }
  | { kind: "unresolved" };

/**
 * Describe `store`'s pairing-graph relationship for display purposes (see
 * {@link StorePairingDescription}). Reuses the exact same shared analysis as
 * {@link classifyStoreSlotEdit} — never a separate cross-product heuristic —
 * so the "Linked pair" panel can never name a partnership the engine doesn't
 * actually couple.
 */
export function describeStorePairing(store: IRStore, ir: KeyboardIR): StorePairingDescription {
  const analysis = analyzeStores(ir);

  const members = analysis.pairSets.get(store.name);
  if (members === undefined) {
    // Not in the pairing graph via index() at all. A bare outs() reference
    // with no index()-output pairing anywhere still can't PROVE a positional
    // relationship, but it also isn't ONE this graph can name partners for —
    // report unresolved so the author isn't told "no pairing" about a store
    // that's blocked from editing for pairing-adjacent reasons.
    return analysis.outsReferencedNames.has(store.name) ? { kind: "unresolved" } : { kind: "none" };
  }

  for (const memberName of members) {
    if (
      analysis.unresolvedIndexOutputNames.has(memberName) ||
      analysis.outsReferencedNames.has(memberName)
    ) {
      return { kind: "unresolved" };
    }
  }

  const partners = [...members].filter((name) => name !== store.name).sort();
  return partners.length > 0 ? { kind: "cross", partners } : { kind: "self" };
}

/**
 * Human-readable explanation appended to a blocked-store warning (engine-side,
 * warning-log audience). Sibling: `blockReasonToDisabledReason` in the studio's
 * irToCarveNodes.ts switches over the same `StoreSlotBlockReason` union to produce
 * author-facing UI copy — a new reason must be added to both switches.
 */
function blockReasonMessage(reason: StoreSlotBlockReason): string {
  switch (reason) {
    case "system-store":
      return "it is a system/compiler-directive store.";
    case "notany-widens":
      return "it is referenced by notany() in a rule's context; dropping a char would widen matching.";
    case "context-index-aligned":
      return "it is referenced by index() in a rule's context; its positions are read by the matcher.";
    case "unresolved-index-pairing":
      return (
        "it (or a store in its pairing set) is targeted by index() in a rule's output, but that " +
        "index()'s pairing could not be resolved to a matching any() source; edits are blocked to " +
        "avoid corrupting index() alignment."
      );
    case "outs-reference-unanalyzed":
      return (
        "it (or a store in its pairing set) is referenced by outs() in a rule's output; this module " +
        "cannot trace index() usage reached indirectly through an outs()-nested group call, so edits " +
        "are blocked conservatively rather than risk corrupting a hidden positional consumer."
      );
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/** One coordinated-drop unit: every store name in a pair-set, plus the union of requested positions. */
interface PairWork {
  /** Sorted store names in this pair-set (size 1 for an uncoordinated drop). */
  memberNames: string[];
  /** name -> positions directly requested for that store (a subset of unionPositions). */
  requestedByName: Map<string, Set<number>>;
  /** Union of every position requested for any member of this pair-set. */
  unionPositions: Set<number>;
}

function blockedWarning(store: IRStore, storeNodeId: string, reason: StoreSlotBlockReason): string {
  return (
    `[store-slot] store "${store.name}" (nodeId: ${storeNodeId}) is blocked from editing: ` +
    blockReasonMessage(reason)
  );
}

/**
 * Edit targeted store slots in a new IR without mutating `baseIr`.
 *
 * Each `slotId` in `slotIds` must have the form `"<storeNodeId>#<itemsIndex>"`.
 * Slot ids are grouped by store, classified via the shared pairing-graph
 * analysis, and dispatched in pair-set batches: every store in a resolved
 * pair-set is spliced at the SAME positions in one pass, or the whole batch
 * is blocked/refused together.
 *
 * @param baseIr  Source-of-truth IR. Never mutated.
 * @param slotIds Set of slot ids encoding which store items to edit.
 * @returns       New IR, diagnostic warnings, and count of applied edits.
 */
export function applyStoreSlotRemovals(
  baseIr: KeyboardIR,
  slotIds: ReadonlySet<string>,
): StoreSlotRemovalResult {
  const warnings: string[] = [];
  const notices: string[] = [];

  if (slotIds.size === 0) {
    return { ir: baseIr, warnings, notices, appliedCount: 0 };
  }

  // --- Parse and group slot ids by storeNodeId ----------------------------
  const targetsByStore = new Map<string, Set<number>>();

  for (const id of slotIds) {
    const parsed = parseSlotId(id);
    if (parsed === null) {
      warnings.push(
        `[store-slot] malformed slot id (expected "<storeNodeId>#<itemsIndex>"): ${id}`,
      );
      continue;
    }
    const { storeNodeId, itemsIndex } = parsed;

    let indexSet = targetsByStore.get(storeNodeId);
    if (indexSet === undefined) {
      indexSet = new Set<number>();
      targetsByStore.set(storeNodeId, indexSet);
    }
    indexSet.add(itemsIndex);
  }

  if (targetsByStore.size === 0) {
    // All ids were malformed.
    return { ir: baseIr, warnings, notices, appliedCount: 0 };
  }

  const analysis = analyzeStores(baseIr);

  // --- Classify each directly-targeted store, grouping into pair-work -----
  const workByKey = new Map<string, PairWork>();

  for (const [storeNodeId, indexSet] of targetsByStore) {
    const store = baseIr.stores.find((s) => s.nodeId === storeNodeId);
    if (store === undefined) {
      warnings.push(
        `[store-slot] store not found in IR (nodeId: ${storeNodeId}); slot(s) skipped.`,
      );
      continue;
    }

    const editMode = classifyStoreWithAnalysis(store, analysis);
    if (editMode.mode === "blocked") {
      warnings.push(blockedWarning(store, storeNodeId, editMode.reason));
      continue;
    }

    const memberNames = [store.name, ...editMode.coordinatedWith].sort();
    const key = memberNames.join("\x00"); // NUL-joined: unambiguous delimiter, unlike a plain space
    let work = workByKey.get(key);
    if (work === undefined) {
      work = { memberNames, requestedByName: new Map(), unionPositions: new Set() };
      workByKey.set(key, work);
    }

    let requested = work.requestedByName.get(store.name);
    if (requested === undefined) {
      requested = new Set<number>();
      work.requestedByName.set(store.name, requested);
    }
    for (const idx of indexSet) {
      requested.add(idx);
      work.unionPositions.add(idx);
    }
  }

  // --- Apply each pair-work batch ------------------------------------------
  const replacedById = new Map<string, IRStore>();
  let appliedCount = 0;

  for (const work of workByKey.values()) {
    const coordinated = work.memberNames.length > 1;
    const memberLabel = () => work.memberNames.map((n) => `"${n}"`).join(", ");

    const memberStores = work.memberNames
      .map((name) => analysis.storeByName.get(name))
      .filter((s): s is IRStore => s !== undefined);

    // Validate every requested position: it must be in-range for EVERY
    // member (so the pair-set never diverges in length) and, for every
    // store where it was DIRECTLY requested, the item at that position must
    // be a char. A position's item kind is NEVER checked for a store where
    // the position is only a COORDINATED PARTNER (e.g. dropping a char in
    // dkf003b must be free to drop dkt003b's item at the same position even
    // when it's a nul filler, or a bare-any input store's vkey partner).
    const validPositions = new Set<number>();

    for (const pos of work.unionPositions) {
      let outOfRange = false;
      for (const s of memberStores) {
        if (pos < 0 || pos >= s.items.length) {
          warnings.push(
            `[store-slot] index ${pos} out of range for store "${s.name}" (length: ${s.items.length}); ` +
              (coordinated
                ? `coordinated slot skipped for paired stores ${memberLabel()}.`
                : `slot skipped.`),
          );
          outOfRange = true;
        }
      }
      if (outOfRange) continue;

      let badChar = false;
      for (const [name, requested] of work.requestedByName) {
        if (!requested.has(pos)) continue;
        const item = analysis.storeByName.get(name)?.items[pos];
        if (item === undefined || item.kind !== "char") {
          warnings.push(
            `[store-slot] index ${pos} in store "${name}" is not a char item ` +
              `(kind: ${item === undefined ? "undefined" : item.kind}); drop skipped for this slot.`,
          );
          badChar = true;
        }
      }
      if (badChar) continue;

      validPositions.add(pos);
    }

    if (validPositions.size === 0) continue;

    // Would-empty guard, evaluated over the WHOLE pair-set: refuse the
    // entire coordinated drop (no partial application) if it would empty
    // any member that is any()-consumed — that compiles to a keyboard that
    // silently fails to build (spec §10 Layer-A evidence).
    const emptiedAnySourceMembers = memberStores.filter(
      (s) =>
        s.items.length - validPositions.size === 0 &&
        (analysis.usageByName.get(s.name)?.asAnySource ?? false),
    );

    if (emptiedAnySourceMembers.length > 0) {
      const emptiedLabel = emptiedAnySourceMembers.map((s) => `"${s.name}"`).join(", ");
      warnings.push(
        coordinated
          ? `[store-slot] refusing coordinated removal across paired stores ${memberLabel()} - ` +
              `dropping these positions would empty ${emptiedLabel}, which is consumed by any() and would ` +
              `break the build; remove the whole store and its rules instead`
          : `[store-slot] refusing to empty store ${emptiedLabel} - a store consumed by any() compiles to a ` +
              `keyboard that silently fails to build when empty; remove the whole store and its rules instead`,
      );
      continue;
    }

    for (const s of memberStores) {
      const newItems = s.items.filter((_, i) => !validPositions.has(i));
      replacedById.set(s.nodeId, { ...s, items: newItems });
      appliedCount += validPositions.size;
    }

    if (coordinated) {
      notices.push(
        `[store-slot] coordinated removal across paired stores ${memberLabel()}: dropped ` +
          `${validPositions.size} position(s) from each to preserve index() alignment.`,
      );
    }
  }

  if (replacedById.size === 0) {
    // Nothing survived the guards.
    return { ir: baseIr, warnings, notices, appliedCount: 0 };
  }

  // --- Structural-sharing shallow copy of the IR --------------------------
  const newIr: KeyboardIR = {
    ...baseIr,
    stores: baseIr.stores.map((s) => replacedById.get(s.nodeId) ?? s),
    // groups, comments, raw, touchLayout, visualKeyboard passed through by reference.
  };

  return { ir: newIr, warnings, notices, appliedCount };
}
