/**
 * keyboardIRRoundTrip — semantic equivalence oracle for KeyboardIR.
 *
 * Purpose
 * -------
 * After a KMN source is imported → mutated → re-emitted → re-imported, the
 * resulting IRs should be *semantically* identical (modulo the intentional
 * mutation). This oracle checks structural equivalence while ignoring:
 *   - nodeId values (internal parser bookkeeping, not semantic)
 *   - trailingComment on rules (not part of keyboard behaviour)
 *   - IRComment nodes (comments are opaque prose)
 *   - ownedByPattern (recognition metadata, not keyboard logic)
 *   - IRHeader.storeDirectives order where directives are
 *     semantically commutative (we do NOT reorder them — order IS preserved by
 *     the emitter, so we compare order-sensitive here)
 *
 * What IS compared semantically:
 *   - header fields (keyboardId, name, bcp47, copyright, version, targets,
 *     storeDirectives — ordered)
 *   - stores (sorted by name; items within a store are ordered)
 *   - groups (ordered, since group traversal order is significant in KMN;
 *     rules within a group are ordered)
 *   - rule context and output elements (ordered; modifiers on vkey elements
 *     are sorted so ["SHIFT","CTRL"] and ["CTRL","SHIFT"] compare equal)
 *   - raw fragments (sorted by sourceText for stable comparison)
 *   - touchLayout and visualKeyboard fields (deep-equal, nodeIds ignored)
 *   - recognizedPatterns (sorted by id)
 *
 * Optional fields with explicit default values are normalised before comparison:
 *   - IRStore.isSystem: absent treated as false
 *   - IRGroup.readonly: absent treated as false
 *   - IRGroup.usingKeys: absent treated as false
 *   - IRRule.matchKind: absent treated as undefined (no normalisation needed)
 *   - IRRule.targetSelector, IRStore.targetSelector: absent treated as undefined
 *
 * Byte-identical round-trip is explicitly OUT OF SCOPE (spec §16).
 *
 * @see spec.md §5a, §14 (Decision D7, D8), §16
 */

import type {
  KeyboardIR,
  IRHeader,
  IRStore,
  IRGroup,
  IRRule,
  StoreItem,
  ContextElement,
  OutputElement,
  RawKmnFragment,
  TouchLayoutIR,
  KvksIR,
} from "./keyboard-ir.js";
import type { Pattern } from "./pattern.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SemanticDifference {
  /** JSON-path-style string, e.g. "rules[3].lhs.keystroke" */
  path: string;
  a: unknown;
  b: unknown;
  /** Human-readable explanation of why this constitutes a semantic difference. */
  reason: string;
}

export interface SemanticEquivalenceResult {
  equivalent: boolean;
  differences: ReadonlyArray<SemanticDifference>;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Assert semantic equivalence between two KeyboardIR instances.
 *
 * Returns `{ equivalent: true, differences: [] }` when the keyboards are
 * semantically identical. When they differ, `equivalent` is false and
 * `differences` lists every detected discrepancy with its path and reason.
 *
 * The comparison is non-short-circuiting: all differences are collected so
 * callers can see the full set of divergence at once.
 */
export function assertSemanticEquivalence(
  a: KeyboardIR,
  b: KeyboardIR,
): SemanticEquivalenceResult {
  const diffs: SemanticDifference[] = [];
  compareIR(a, b, diffs);
  return { equivalent: diffs.length === 0, differences: diffs };
}

// ---------------------------------------------------------------------------
// Internal comparison helpers
// ---------------------------------------------------------------------------

function push(
  diffs: SemanticDifference[],
  path: string,
  a: unknown,
  b: unknown,
  reason: string,
): void {
  diffs.push({ path, a, b, reason });
}

function compareScalar(
  a: unknown,
  b: unknown,
  path: string,
  reason: string,
  diffs: SemanticDifference[],
): void {
  if (a !== b) push(diffs, path, a, b, reason);
}

function compareStringArray(
  a: string[],
  b: string[],
  path: string,
  reason: string,
  diffs: SemanticDifference[],
): void {
  if (a.join("\x00") !== b.join("\x00")) push(diffs, path, a, b, reason);
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function compareHeader(
  a: IRHeader,
  b: IRHeader,
  diffs: SemanticDifference[],
): void {
  const p = (f: string) => `header.${f}`;
  compareScalar(a.keyboardId, b.keyboardId, p("keyboardId"), "keyboard ID differs", diffs);
  compareScalar(a.name, b.name, p("name"), "display name differs", diffs);
  compareStringArray(
    [...a.bcp47].sort(),
    [...b.bcp47].sort(),
    p("bcp47"),
    "BCP47 language tag set differs",
    diffs,
  );
  compareScalar(a.copyright, b.copyright, p("copyright"), "copyright string differs", diffs);
  compareScalar(a.version, b.version, p("version"), "version string differs", diffs);
  compareStringArray(
    [...a.targets].sort(),
    [...b.targets].sort(),
    p("targets"),
    "target platform set differs",
    diffs,
  );
  // storeDirectives: order IS semantically significant (KMN processes them
  // in declaration order); compare ordered.
  compareStringArray(
    a.storeDirectives,
    b.storeDirectives,
    p("storeDirectives"),
    "file-level store directives differ (order is significant)",
    diffs,
  );
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

function storeItemKey(item: StoreItem): string {
  switch (item.kind) {
    case "char":    return `char:${item.value}`;
    case "vkey":    return `vkey:${item.name}`;
    case "deadkey": return `dk:${item.id}`;
    case "any":     return "any";
    case "raw":     return `raw:${item.text}`;
    default: {
      const _: never = item;
      return JSON.stringify(_);
    }
  }
}

function compareStoreItems(
  a: StoreItem[],
  b: StoreItem[],
  path: string,
  diffs: SemanticDifference[],
): void {
  if (a.length !== b.length) {
    push(diffs, path, a, b, "store item count differs");
    return;
  }
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    const ka = storeItemKey(ai);
    const kb = storeItemKey(bi);
    if (ka !== kb) push(diffs, `${path}[${i}]`, ai, bi, "store item differs");
  }
}

function compareStores(
  a: IRStore[],
  b: IRStore[],
  diffs: SemanticDifference[],
): void {
  // Sort by name — store declaration order is not semantically meaningful
  // because KMN stores are looked up by name, not position.
  const sortedA = [...a].sort((x, y) => x.name.localeCompare(y.name));
  const sortedB = [...b].sort((x, y) => x.name.localeCompare(y.name));

  if (sortedA.length !== sortedB.length) {
    push(diffs, "stores", sortedA.map((s) => s.name), sortedB.map((s) => s.name),
      "store count differs");
    return;
  }

  for (let i = 0; i < sortedA.length; i++) {
    const sa = sortedA[i]!;
    const sb = sortedB[i]!;
    const path = `stores[name=${JSON.stringify(sa.name)}]`;
    if (sa.name !== sb.name) {
      push(diffs, path, sa.name, sb.name, "store name differs after sorting");
      continue;
    }
    // isSystem: treat absent as false
    const sysA = sa.isSystem ?? false;
    const sysB = sb.isSystem ?? false;
    if (sysA !== sysB) push(diffs, `${path}.isSystem`, sysA, sysB, "system-store flag differs");
    if ((sa.targetSelector ?? undefined) !== (sb.targetSelector ?? undefined)) {
      push(diffs, `${path}.targetSelector`, sa.targetSelector, sb.targetSelector,
        "target-selector differs");
    }
    compareStoreItems(sa.items, sb.items, `${path}.items`, diffs);
  }
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Sort modifier flag strings so ["SHIFT","CTRL"] === ["CTRL","SHIFT"]. */
function normModifiers(mods: string[]): string {
  return [...mods].sort().join("+");
}

function contextElementKey(el: ContextElement): string {
  switch (el.kind) {
    case "char":       return `char:${el.value}`;
    case "vkey":       return `vkey:${el.name}|${normModifiers(el.modifiers)}`;
    case "deadkey":    return `dk:${el.id}`;
    case "any":        return `any:${el.storeRef}`;
    case "notany":     return `notany:${el.storeRef}`;
    case "context":    return `ctx:${el.offset}`;
    case "index":      return `index:${el.storeRef}:${el.offset}`;
    case "baselayout": return `baselayout:${el.value}`;
    case "raw":        return `raw:${el.text}`;
    default: {
      const _: never = el;
      return JSON.stringify(_);
    }
  }
}

function outputElementKey(el: OutputElement): string {
  switch (el.kind) {
    case "char":    return `char:${el.value}`;
    case "deadkey": return `dk:${el.id}`;
    case "beep":    return "beep";
    case "index":   return `index:${el.storeRef}:${el.offset}`;
    case "outs":    return `outs:${el.storeRef}`;
    case "useGroup": return `useGroup:${el.groupName}`;
    case "raw":     return `raw:${el.text}`;
    default: {
      const _: never = el;
      return JSON.stringify(_);
    }
  }
}

function compareRule(
  a: IRRule,
  b: IRRule,
  path: string,
  diffs: SemanticDifference[],
): void {
  // context elements — ordered
  if (a.context.length !== b.context.length) {
    push(diffs, `${path}.context`, a.context, b.context, "context element count differs");
  } else {
    for (let i = 0; i < a.context.length; i++) {
      const aci = a.context[i]!;
      const bci = b.context[i]!;
      const ka = contextElementKey(aci);
      const kb = contextElementKey(bci);
      if (ka !== kb) push(diffs, `${path}.context[${i}]`, aci, bci,
        "context element differs");
    }
  }

  // output elements — ordered
  if (a.output.length !== b.output.length) {
    push(diffs, `${path}.output`, a.output, b.output, "output element count differs");
  } else {
    for (let i = 0; i < a.output.length; i++) {
      const aoi = a.output[i]!;
      const boi = b.output[i]!;
      const ka = outputElementKey(aoi);
      const kb = outputElementKey(boi);
      if (ka !== kb) push(diffs, `${path}.output[${i}]`, aoi, boi,
        "output element differs");
    }
  }

  // matchKind: structural, not optional-with-default
  if ((a.matchKind ?? undefined) !== (b.matchKind ?? undefined)) {
    push(diffs, `${path}.matchKind`, a.matchKind, b.matchKind, "match/nomatch kind differs");
  }

  // targetSelector
  if ((a.targetSelector ?? undefined) !== (b.targetSelector ?? undefined)) {
    push(diffs, `${path}.targetSelector`, a.targetSelector, b.targetSelector,
      "target-selector differs");
  }

  // NOTE: trailingComment and ownedByPattern are intentionally NOT compared —
  // trailing comments are opaque prose; ownedByPattern is recognition metadata
  // assigned by the pattern recognizer, not stable across import/emit cycles.
}

function compareRules(
  a: IRRule[] | undefined,
  b: IRRule[] | undefined,
  groupPath: string,
  diffs: SemanticDifference[],
): void {
  // Normalize undefined to empty array (defensive; IRGroup.rules should
  // always be present but the "absent vs explicit []" case is tested below).
  const ra = a ?? [];
  const rb = b ?? [];
  a = ra;
  b = rb;
  // Rule order within a group IS semantically significant: KMN applies the
  // first matching rule. Do not sort.
  if (a.length !== b.length) {
    push(diffs, `${groupPath}.rules`, a.length, b.length, "rule count differs");
    return;
  }
  for (let i = 0; i < a.length; i++) {
    compareRule(a[i]!, b[i]!, `${groupPath}.rules[${i}]`, diffs);
  }
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

function compareGroups(
  a: IRGroup[],
  b: IRGroup[],
  diffs: SemanticDifference[],
): void {
  // Group order IS semantically significant: the `begin` directive names
  // the entry group by position; `use(g)` calls jump by name, but the
  // linear order affects which rules fire first for calls from `begin`.
  // We compare in declaration order.
  if (a.length !== b.length) {
    push(diffs, "groups", a.map((g) => g.name), b.map((g) => g.name),
      "group count differs");
    return;
  }
  for (let i = 0; i < a.length; i++) {
    const ga = a[i]!;
    const gb = b[i]!;
    const path = `groups[${i}](name=${JSON.stringify(ga.name)})`;

    if (ga.name !== gb.name) push(diffs, `${path}.name`, ga.name, gb.name, "group name differs");
    if ((ga.usingKeys ?? false) !== (gb.usingKeys ?? false)) {
      push(diffs, `${path}.usingKeys`, ga.usingKeys, gb.usingKeys,
        "usingKeys flag differs (affects whether context conditions fire)");
    }
    if ((ga.readonly ?? false) !== (gb.readonly ?? false)) {
      push(diffs, `${path}.readonly`, ga.readonly, gb.readonly, "readonly flag differs");
    }
    compareRules(ga.rules, gb.rules, path, diffs);
  }
}

// ---------------------------------------------------------------------------
// Raw fragments
// ---------------------------------------------------------------------------

function compareRaw(
  a: RawKmnFragment[],
  b: RawKmnFragment[],
  diffs: SemanticDifference[],
): void {
  // Raw fragments are opaque; sort by sourceText for stable comparison.
  // Per spec §14 D8 they are preserved verbatim, so text equality is the
  // right check.
  const sortedA = [...a].sort((x, y) => x.sourceText.localeCompare(y.sourceText));
  const sortedB = [...b].sort((x, y) => x.sourceText.localeCompare(y.sourceText));
  if (sortedA.length !== sortedB.length) {
    push(diffs, "raw", sortedA.length, sortedB.length, "raw fragment count differs");
    return;
  }
  for (let i = 0; i < sortedA.length; i++) {
    const ra = sortedA[i]!;
    const rb = sortedB[i]!;
    if (ra.sourceText !== rb.sourceText) {
      push(diffs, `raw[${i}].sourceText`, ra.sourceText, rb.sourceText,
        "raw fragment source text differs");
    }
    if (ra.reason !== rb.reason) {
      push(diffs, `raw[${i}].reason`, ra.reason, rb.reason,
        "raw fragment opaque-feature reason differs");
    }
  }
}

// ---------------------------------------------------------------------------
// Touch layout (structural deep-equal, ignoring nodeIds)
// ---------------------------------------------------------------------------

function compareTouchLayout(
  a: TouchLayoutIR | undefined,
  b: TouchLayoutIR | undefined,
  diffs: SemanticDifference[],
): void {
  if (a === undefined && b === undefined) return;
  if (a === undefined || b === undefined) {
    push(diffs, "touchLayout", a, b, "one IR has a touch layout and the other does not");
    return;
  }
  // Strip nodeIds before JSON comparison — they are internal parser bookkeeping.
  const strip = (tl: TouchLayoutIR): unknown =>
    JSON.parse(JSON.stringify({ ...tl, nodeIds: undefined }));
  const sa = JSON.stringify(strip(a));
  const sb = JSON.stringify(strip(b));
  if (sa !== sb) {
    push(diffs, "touchLayout", a, b,
      "touch layout platforms/layers/keys differ (nodeIds excluded)");
  }
}

// ---------------------------------------------------------------------------
// Visual keyboard (structural deep-equal, ignoring nodeIds)
// ---------------------------------------------------------------------------

function compareVisualKeyboard(
  a: KvksIR | undefined,
  b: KvksIR | undefined,
  diffs: SemanticDifference[],
): void {
  if (a === undefined && b === undefined) return;
  if (a === undefined || b === undefined) {
    push(diffs, "visualKeyboard", a, b, "one IR has a visual keyboard and the other does not");
    return;
  }
  const strip = (k: KvksIR): unknown =>
    JSON.parse(JSON.stringify({ ...k, nodeIds: undefined }));
  const sa = JSON.stringify(strip(a));
  const sb = JSON.stringify(strip(b));
  if (sa !== sb) {
    push(diffs, "visualKeyboard", a, b,
      "visual keyboard layers/keys differ (nodeIds excluded)");
  }
}

// ---------------------------------------------------------------------------
// Recognized patterns (sorted by id — recognition is deterministic given the
// same IR; order reflects recognizer traversal which may differ across versions)
// ---------------------------------------------------------------------------

function compareRecognizedPatterns(
  a: Pattern[],
  b: Pattern[],
  diffs: SemanticDifference[],
): void {
  const sortedA = [...a].sort((x, y) => x.id.localeCompare(y.id));
  const sortedB = [...b].sort((x, y) => x.id.localeCompare(y.id));
  if (sortedA.length !== sortedB.length) {
    push(diffs, "recognizedPatterns", sortedA.map((p) => p.id), sortedB.map((p) => p.id),
      "recognized pattern count differs");
    return;
  }
  for (let i = 0; i < sortedA.length; i++) {
    const pa = sortedA[i]!;
    const pb = sortedB[i]!;
    if (pa.id !== pb.id) {
      push(diffs, `recognizedPatterns[${i}].id`, pa.id, pb.id,
        "recognized pattern id differs");
    }
  }
}

// ---------------------------------------------------------------------------
// Top-level IR comparison
// ---------------------------------------------------------------------------

function compareIR(
  a: KeyboardIR,
  b: KeyboardIR,
  diffs: SemanticDifference[],
): void {
  // origin is metadata about how the keyboard entered the studio — not
  // intrinsic to the keyboard's semantics; intentionally NOT compared.

  compareHeader(a.header, b.header, diffs);
  compareStores(a.stores, b.stores, diffs);
  compareGroups(a.groups, b.groups, diffs);
  compareRaw(a.raw, b.raw, diffs);
  compareTouchLayout(a.touchLayout, b.touchLayout, diffs);
  compareVisualKeyboard(a.visualKeyboard, b.visualKeyboard, diffs);
  compareRecognizedPatterns(a.recognizedPatterns, b.recognizedPatterns, diffs);
}
