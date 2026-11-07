// touchCodeDiff — Code tab Apply: diff an edited TouchLayoutIR against the
// effective layout and decompose the delta into KeyEditOperations
// (TIKE touch-builder port, Phase 2; Q2 ruling: diff → op sequence, one undo
// batch).
//
// Pure module: (before, after) in, ops-or-rejection out. No monaco imports,
// so the decomposition is unit-testable and the round-trip property
// (replay(before, ops) ≡ after) is pinned by test, not by reading.
//
// Contract discipline (keyEditOps.ts):
// - Key-level only (Q1). Row/layer/platform structural changes are NOT
//   decomposed — they are rejections naming the limitation, never silently
//   dropped.
// - Only the 8 op kinds; no new kinds, twin appliers untouched.
// - Addresses are `touchKeyAddress(platform, layerId, keyId)` with NO
//   occurrence suffix. Sound under the duplicate-id discipline: any op
//   addressing a duplicated id is rejected ("duplicate-id-edit"), and
//   occurrence numbering is stable under the ops that remain — an
//   add/remove/move of a UNIQUE id never changes another id's row-major
//   occurrence. Untouched duplicates need no addresses at all.
// - Emission order per layer, per row: removes → renames → moves → adds
//   (+ follow-up geometry sets) → field sets → subkey ops. Every address
//   names a key that exists at replay time in that order (removes are unique
//   ids, moves preserve identity, adds anchor on surviving paired keys).
//
// Comparison notes:
// - `nodeId`, `keycapAuthored`, `producedOutput` are session-only (never on
//   the wire) and are excluded from comparison.
// - `sp`/`width`/`pad` compare as normalized numbers, not wire encodings.
// - `layer` compares as the EFFECTIVE layer (`key.layer ??
//   key.layerAnnotation`): emit writes whichever is present, so comparing
//   the raw fields would false-positive on untouched keys.
// - Fields no op kind carries (`default`, `font`, `fontsize`, `dk`,
//   `provenance`, platform display fields) are rejections, not silent drops.
// - A brand-new key's geometry: the `add` applier materializes
//   DEFAULT_KEY_WIDTH_PCT/PAD regardless of the spec, so the differ follows
//   each `add` with a `set` restoring the authored width/pad when they
//   differ from the defaults — the applier's behavior is unchanged, the
//   round-trip is exact.

import {
  DEFAULT_KEY_PAD_PCT,
  DEFAULT_KEY_WIDTH_PCT,
  touchKeyAddress,
} from "@keyboard-studio/contracts";
import type {
  TouchKeyIR,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import type { PendingKeyEditOperation } from "../../../stores/workingCopyStore.ts";

// KeyEditOperation's field shapes are not re-exported through
// `@keyboard-studio/engine`'s public entry point (the same gap
// KeyInspector.tsx documents for `EditableKeySp`), so derive them from the
// `PendingKeyEditOperation` union instead of mirroring them by hand.
type SetOpFields = Extract<
  PendingKeyEditOperation,
  { kind: "set" }
>["fields"];
type NewKeySpecFields = Extract<
  PendingKeyEditOperation,
  { kind: "add" }
>["key"];
type SubKeyRefFields = Extract<
  PendingKeyEditOperation,
  { kind: "setSubKey" }
>["sub"];

/**
 * Mirrored from the engine's `EditableKeySp` (`0` character, `1` frame, `2`
 * active frame, `8` deadkey-styled, `9` blank, `10` spacer) — see
 * KeyInspector.tsx's note on why this literal union is mirrored rather than
 * imported.
 */
type LegalSp = 0 | 1 | 2 | 8 | 9 | 10;
const LEGAL_SPS: readonly LegalSp[] = [0, 1, 2, 8, 9, 10];

/** `TouchKeyIR.sp`, narrowed to the legal set; absent means the letter class. */
function normalizeSp(sp: number | undefined): LegalSp {
  return sp !== undefined && (LEGAL_SPS as readonly number[]).includes(sp)
    ? (sp as LegalSp)
    : 0;
}

/** Why the diff refused to decompose — each maps to one literal UI string. */
export type TouchCodeDiffRejectionKind =
  | "platform-structure"
  | "layer-structure"
  | "row-structure"
  | "cross-row-move"
  | "duplicate-id-edit"
  | "unexpressible-field"
  | "unknown-top-level-key";

export interface TouchCodeDiffRejected {
  readonly ok: false;
  readonly kind: TouchCodeDiffRejectionKind;
  /** Human detail for the message (key id, field name, …). Already English. */
  readonly detail: string;
}

export interface TouchCodeDiffOk {
  readonly ok: true;
  readonly ops: PendingKeyEditOperation[];
}

export type TouchCodeDiffResult = TouchCodeDiffOk | TouchCodeDiffRejected;

const KNOWN_PLATFORMS = new Set(["phone", "tablet", "desktop"]);

function reject(
  kind: TouchCodeDiffRejectionKind,
  detail: string,
): TouchCodeDiffRejected {
  return { ok: false, kind, detail };
}

// ---------------------------------------------------------------------------
// Field comparison
// ---------------------------------------------------------------------------

/** The effective per-key modifier layer (see module header). */
function effectiveLayer(key: TouchKeyIR): string | undefined {
  return key.layer ?? key.layerAnnotation;
}

/** Fields a `set` op can carry, read off a key. */
interface FullKeyFields {
  readonly id: string;
  readonly text: string;
  readonly output?: string;
  readonly sp: LegalSp;
  readonly nextlayer?: string;
  readonly hint?: string;
  readonly width?: number;
  readonly pad?: number;
  readonly layer?: string;
}

function editableOf(key: TouchKeyIR): FullKeyFields {
  const layer = effectiveLayer(key);
  return {
    id: key.id,
    text: key.text ?? "",
    ...(key.output !== undefined ? { output: key.output } : {}),
    sp: normalizeSp(key.sp),
    ...(key.nextlayer !== undefined ? { nextlayer: key.nextlayer } : {}),
    ...(key.hint !== undefined ? { hint: key.hint } : {}),
    ...(key.width !== undefined ? { width: key.width } : {}),
    ...(key.pad !== undefined ? { pad: key.pad } : {}),
    ...(layer !== undefined ? { layer } : {}),
  };
}

type SettableField = Exclude<keyof FullKeyFields, "id">;
const SETTABLE_FIELDS: readonly SettableField[] = [
  "text",
  "output",
  "sp",
  "nextlayer",
  "hint",
  "width",
  "pad",
  "layer",
];

/** The changed settable fields from `before` to `after` (undefined = none). */
function diffSettableFields(
  before: TouchKeyIR,
  after: TouchKeyIR,
): SetOpFields | undefined {
  const b = editableOf(before);
  const a = editableOf(after);
  const changed: SetOpFields = {};
  let any = false;
  for (const f of SETTABLE_FIELDS) {
    if (b[f] !== a[f]) {
      (changed as Record<string, unknown>)[f] = a[f];
      any = true;
    }
  }
  return any ? changed : undefined;
}

/**
 * Fields no KeyEditOperation kind carries. `keycapAuthored`/`nodeId`/
 * `producedOutput` are session-only (never on the wire) and excluded
 * silently — they cannot differ from the author's text. Everything else
 * here differing is a rejection naming the field.
 */
function unexpressibleFieldDiff(
  before: TouchKeyIR,
  after: TouchKeyIR,
): string | undefined {
  if ((before.default ?? false) !== (after.default ?? false)) return "default";
  if (before.font !== after.font) return "font";
  if (before.fontsize !== after.fontsize) return "fontsize";
  if (before.dk !== after.dk) return "dk";
  const bProv = before.provenance ?? "hand-set";
  const aProv = after.provenance ?? "hand-set";
  if (bProv !== aProv) return "provenance";
  return undefined;
}

// ---------------------------------------------------------------------------
// LCS pairing by key id (duplicates pair in order)
// ---------------------------------------------------------------------------

/** Indices of old/new keys paired by longest common subsequence of ids. */
function lcsPair(
  oldIds: readonly string[],
  newIds: readonly string[],
): Array<[number, number]> {
  const m = oldIds.length;
  const n = newIds.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] =
        oldIds[i] === newIds[j]
          ? (dp[i + 1]![j + 1] ?? 0) + 1
          : Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldIds[i] === newIds[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// The differ
// ---------------------------------------------------------------------------

export function diffTouchLayouts(
  before: TouchLayoutIR,
  after: TouchLayoutIR,
  rawAfter?: unknown,
): TouchCodeDiffResult {
  // Top-level keys the lenient parser drops (anything but the three
  // platforms) would vanish on Apply — refuse instead of silently dropping.
  if (rawAfter !== null && typeof rawAfter === "object" && !Array.isArray(rawAfter)) {
    for (const k of Object.keys(rawAfter)) {
      if (!KNOWN_PLATFORMS.has(k)) {
        return reject("unknown-top-level-key", k);
      }
    }
  }

  const ops: PendingKeyEditOperation[] = [];

  const beforePlatforms = new Map(before.platforms.map((p) => [p.id, p]));
  const afterPlatforms = new Map(after.platforms.map((p) => [p.id, p]));
  if (
    beforePlatforms.size !== afterPlatforms.size ||
    [...beforePlatforms.keys()].some((k) => !afterPlatforms.has(k))
  ) {
    return reject(
      "platform-structure",
      "the platform set changed (phone/tablet/desktop)",
    );
  }

  for (const [platformId, beforePlatform] of beforePlatforms) {
    const afterPlatform = afterPlatforms.get(platformId)!;

    // Platform display fields have no addressing op (per-platform font
    // editing is out of scope) — a change here is a rejection.
    for (const f of ["font", "fontsize", "displayUnderlying", "defaultHint"] as const) {
      if (beforePlatform[f] !== afterPlatform[f]) {
        return reject("unexpressible-field", `platform ${platformId}: ${f}`);
      }
    }

    const beforeLayers = new Map(beforePlatform.layers.map((l) => [l.id, l]));
    const afterLayers = new Map(afterPlatform.layers.map((l) => [l.id, l]));
    if (
      beforeLayers.size !== afterLayers.size ||
      [...beforeLayers.keys()].some((k) => !afterLayers.has(k))
    ) {
      return reject(
        "layer-structure",
        `platform ${platformId}: layers were added, removed, or renamed`,
      );
    }

    for (const [layerId, beforeLayer] of beforeLayers) {
      const afterLayer = afterLayers.get(layerId)!;
      if (beforeLayer.rows.length !== afterLayer.rows.length) {
        return reject(
          "row-structure",
          `platform ${platformId}, layer ${layerId}: row count changed ` +
            `(${beforeLayer.rows.length} → ${afterLayer.rows.length})`,
        );
      }

      // Duplicate-id discipline (module header): an op that ADDRESSES a
      // duplicated id would resolve ambiguously, and add/remove of a
      // duplicated id would shift occurrences under replay. Collect the
      // layer's duplicated ids; diffRow rejects any op touching one.
      // Untouched duplicates are fine — no address is ever emitted for them.
      const dupIds = duplicateIds(beforeLayer, afterLayer);
      const addr = (keyId: string) =>
        touchKeyAddress(platformId, layerId, keyId);

      // Cross-row moves would need remove+add, which discards subkeys and
      // mints a fresh nodeId — refuse instead.
      const crossRow = findCrossRowMove(beforeLayer, afterLayer);
      if (crossRow !== undefined) {
        return reject(
          "cross-row-move",
          `platform ${platformId}, layer ${layerId}: key "${crossRow}" moved across rows`,
        );
      }

      for (let rowIdx = 0; rowIdx < beforeLayer.rows.length; rowIdx++) {
        const beforeRow = beforeLayer.rows[rowIdx]!;
        const afterRow = afterLayer.rows[rowIdx]!;
        const rowResult = diffRow(
          addr,
          dupIds,
          beforeRow.keys,
          afterRow.keys,
          unexpressibleFieldDiff,
        );
        if (!rowResult.ok) {
          // Qualify the detail with its platform/layer for the UI message.
          return reject(
            rowResult.kind,
            `platform ${platformId}, layer ${layerId}, row ${rowIdx + 1}: ${rowResult.detail}`,
          );
        }
        ops.push(...rowResult.ops);
      }
    }
  }

  return { ok: true, ops };
}

/** Ids appearing more than once within the before or the after layer. */
function duplicateIds(
  beforeLayer: TouchLayoutIR["platforms"][number]["layers"][number],
  afterLayer: TouchLayoutIR["platforms"][number]["layers"][number],
): Set<string> {
  const dups = new Set<string>();
  for (const layer of [beforeLayer, afterLayer]) {
    const counts = new Map<string, number>();
    for (const row of layer.rows) {
      for (const k of row.keys) {
        counts.set(k.id, (counts.get(k.id) ?? 0) + 1);
      }
    }
    for (const [id, n] of counts) {
      if (n > 1) dups.add(id);
    }
  }
  return dups;
}

/**
 * Whether two keys are identical except for their id — the signal that a
 * leftover old/new pair is a genuine id edit (rename) rather than a
 * remove+add coincidence.
 */
function sameExceptId(b: TouchKeyIR, a: TouchKeyIR): boolean {
  if (b.id === a.id) return true;
  if (unexpressibleFieldDiff(b, a) !== undefined) return false;
  if (diffSettableFields(b, a) !== undefined) return false;
  for (const kind of ["sk", "multitap"] as const) {
    const bs = b[kind] ?? [];
    const as = a[kind] ?? [];
    if (bs.length !== as.length) return false;
    if (!bs.every((bk, i) => sameExceptId(bk, as[i]!))) return false;
  }
  const bFlick: Record<string, TouchKeyIR> = b.flick ?? {};
  const aFlick: Record<string, TouchKeyIR> = a.flick ?? {};
  const bDirs = Object.keys(bFlick);
  const aDirs = Object.keys(aFlick);
  if (bDirs.length !== aDirs.length) return false;
  return bDirs.every(
    (d) =>
      aFlick[d] !== undefined && sameExceptId(bFlick[d]!, aFlick[d]!),
  );
}

/**
 * A key id that left one row and appeared in another of the same layer —
 * remove+add would lose its subkeys/nodeId, so this is a rejection.
 */
function findCrossRowMove(
  beforeLayer: TouchLayoutIR["platforms"][number]["layers"][number],
  afterLayer: TouchLayoutIR["platforms"][number]["layers"][number],
): string | undefined {
  const countIds = (
    layer: TouchLayoutIR["platforms"][number]["layers"][number],
  ): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const row of layer.rows) {
      for (const k of row.keys) {
        counts.set(k.id, (counts.get(k.id) ?? 0) + 1);
      }
    }
    return counts;
  };
  const beforeCounts = countIds(beforeLayer);
  const afterCounts = countIds(afterLayer);
  const beforeRowsOf = new Map<string, number>();
  beforeLayer.rows.forEach((r, i) => {
    for (const k of r.keys) {
      // First row wins; duplicates are already rejected above.
      if (!beforeRowsOf.has(k.id)) beforeRowsOf.set(k.id, i);
    }
  });
  for (let i = 0; i < afterLayer.rows.length; i++) {
    for (const k of afterLayer.rows[i]!.keys) {
      // Duplicated ids are the duplicate-id discipline's business, not this
      // check's — only unambiguous single-occurrence keys are considered.
      if (beforeCounts.get(k.id) !== 1 || afterCounts.get(k.id) !== 1) continue;
      const bi = beforeRowsOf.get(k.id);
      if (bi !== undefined && bi !== i) return k.id;
    }
  }
  return undefined;
}

interface RowDiffOk {
  readonly ok: true;
  readonly ops: PendingKeyEditOperation[];
}
interface RowDiffRejected {
  readonly ok: false;
  readonly kind: TouchCodeDiffRejectionKind;
  readonly detail: string;
}

function diffRow(
  addr: (keyId: string) => string,
  dupIds: ReadonlySet<string>,
  beforeKeys: readonly TouchKeyIR[],
  afterKeys: readonly TouchKeyIR[],
  unexpressible: (b: TouchKeyIR, a: TouchKeyIR) => string | undefined,
): RowDiffOk | RowDiffRejected {
  const ops: PendingKeyEditOperation[] = [];
  const dupReject = (
    id: string,
  ): RowDiffRejected => ({
    ok: false,
    kind: "duplicate-id-edit",
    detail: `key "${id}" is duplicated — its address would resolve ambiguously`,
  });
  const pairs = lcsPair(
    beforeKeys.map((k) => k.id),
    afterKeys.map((k) => k.id),
  );
  const pairedOld = new Set(pairs.map(([i]) => i));
  const pairedNew = new Set(pairs.map(([, j]) => j));
  const unpairedOld = beforeKeys
    .map((k, i) => ({ k, i }))
    .filter(({ i }) => !pairedOld.has(i));
  const unpairedNew = afterKeys
    .map((k, j) => ({ k, j }))
    .filter(({ j }) => !pairedNew.has(j));

  // Leftover olds/news sharing an id are moved keys, not renames — pair
  // them so the move decomposition below handles them. (LCS cannot pair a
  // key that moved past the whole common subsequence, e.g. K_Q in
  // [K_Q,K_W,K_E] → [K_W,K_E,K_Q].)
  const movedPairs: Array<[number, number]> = [];
  const restOld = [...unpairedOld];
  const restNew = [...unpairedNew];
  for (const o of [...restOld]) {
    const ni = restNew.findIndex((n) => n.k.id === o.k.id);
    if (ni >= 0) {
      const n = restNew.splice(ni, 1)[0]!;
      restOld.splice(restOld.indexOf(o), 1);
      movedPairs.push([o.i, n.j]);
    }
  }
  const allPairs = [...pairs, ...movedPairs];

  // Rename detection on the remainder: a leftover old/new pair is a rename
  // (not remove+add) when it is the only pair — the common single-key id
  // edit — or when every pair is identical except for the id. Anything else
  // (e.g. a whole row of new ids) is an honest remove+add: guessing renames
  // there would silently transfer subkeys/nodeIds onto unrelated keys.
  const renames = new Map<number, number>(); // oldIdx -> newIdx
  if (restOld.length === restNew.length && restOld.length > 0) {
    const olds = restOld.sort((a, b) => a.i - b.i);
    const news = restNew.sort((a, b) => a.j - b.j);
    const allSameExceptId = olds.every((o, n) => sameExceptId(o.k, news[n]!.k));
    if (restOld.length === 1 || allSameExceptId) {
      olds.forEach((o, n) => renames.set(o.i, news[n]!.j));
    }
  }
  const removedOld = restOld.filter(({ i }) => !renames.has(i));
  const addedNew = restNew.filter(
    ({ j }) => ![...renames.values()].includes(j),
  );

  // 1. Removes, reverse index order (deterministic; ids are unique per the
  //    layer-level duplicate discipline, so order is cosmetic).
  //    The all-new-row trick withholds the last old key as an add anchor —
  //    an `add` needs a surviving key to anchor before/after.
  const allNew = pairs.length === 0 && beforeKeys.length > 0;
  const anchorIdx = allNew ? beforeKeys.length - 1 : -1;
  for (const { k, i } of [...removedOld].sort((a, b) => b.i - a.i)) {
    if (i === anchorIdx) continue;
    // Removing a duplicated id would shift occurrences under replay.
    if (dupIds.has(k.id)) return dupReject(k.id);
    // A whole-row replacement removes the old keys as scaffolding — the
    // replacement keys bring their own width, so the removal must leave
    // nothing behind (`"drop"`): a `"reflow"` here would park the old
    // row's width as trailing padding and double the row (#2360). A
    // genuine deletion (any paired key survives) keeps `"reflow"`.
    ops.push({ address: addr(k.id), kind: "remove", outcome: allNew ? "drop" : "reflow" });
  }

  // 2. Renames. Guard: the target id must not already exist in the layer —
  //    otherwise a later `set` addressed by the new id would be ambiguous.
  //    (The caller guarantees layer-wide uniqueness on the before side.)
  for (const [oldIdx, newIdx] of renames) {
    const b = beforeKeys[oldIdx]!;
    const a = afterKeys[newIdx]!;
    if (dupIds.has(b.id) || dupIds.has(a.id)) {
      return dupReject(dupIds.has(b.id) ? b.id : a.id);
    }
    ops.push({ address: addr(b.id), kind: "rename", toId: a.id });
  }

  // 3. Same-row reorder of paired keys → adjacent-swap `move` decomposition.
  //    Keys are unique ids; moves preserve node identity (FR-021).
  const pairedNewOrder = allPairs
    .slice()
    .sort(([, j1], [, j2]) => j1 - j2)
    .map(([i]) => beforeKeys[i]!.id);
  // Rename targets are not in the paired set; the working list holds the
  // paired keys' ids in old relative order (ids are unique per the
  // layer-level duplicate discipline, so plain ids address unambiguously).
  const working = allPairs
    .slice()
    .sort(([i1], [i2]) => i1 - i2)
    .map(([i]) => beforeKeys[i]!.id);
  for (let target = 0; target < pairedNewOrder.length; target++) {
    const wantId = pairedNewOrder[target]!;
    const pos = working.indexOf(wantId);
    // A move addressed at a duplicated id would resolve ambiguously — but
    // only when a move is actually emitted (an already-placed key is fine).
    if (pos !== target && dupIds.has(wantId)) return dupReject(wantId);
    for (let s = pos; s > target; s--) {
      ops.push({ address: addr(wantId), kind: "move", direction: "left" });
      working.splice(s, 1);
      working.splice(s - 1, 0, wantId);
    }
  }

  // Current ids of renamed keys (oldIdx -> new id), for anchors and sets
  // that must address the post-rename key.
  const renamedTo = new Map<number, string>();
  for (const [oldIdx, newIdx] of renames) {
    renamedTo.set(oldIdx, afterKeys[newIdx]!.id);
  }

  // 4. Adds, anchored on the nearest surviving paired key. New ids must not
  //    already exist in the layer (ambiguity guard, same as rename).
  const pairedNewIds = new Set(allPairs.map(([, j]) => afterKeys[j]!.id));
  const anchorFor = (
    newIdx: number,
  ): { id: string; position: "before" | "after" } | undefined => {
    for (let j = newIdx - 1; j >= 0; j--) {
      const id = afterKeys[j]!.id;
      if (pairedNewIds.has(id)) {
        const oldIdx = allPairs.find(([, jj]) => jj === j)![0];
        return { id: renamedTo.get(oldIdx) ?? id, position: "after" };
      }
    }
    for (let j = newIdx + 1; j < afterKeys.length; j++) {
      const id = afterKeys[j]!.id;
      if (pairedNewIds.has(id)) {
        const oldIdx = allPairs.find(([, jj]) => jj === j)![0];
        return { id: renamedTo.get(oldIdx) ?? id, position: "before" };
      }
    }
    return undefined;
  };
  // Whether the all-new-row anchor trick was used: only then does step 6
  // remove the withheld anchor.
  let anchorUsed = false;
  const emitAdd = (
    newKey: TouchKeyIR,
    anchor: { id: string; position: "before" | "after" },
  ): void => {
    const spec: NewKeySpecFields = {
      id: newKey.id,
      text: newKey.text ?? "",
      ...(newKey.output !== undefined ? { output: newKey.output } : {}),
      sp: normalizeSp(newKey.sp),
      ...(newKey.nextlayer !== undefined ? { nextlayer: newKey.nextlayer } : {}),
      ...(newKey.hint !== undefined ? { hint: newKey.hint } : {}),
      ...(newKey.width !== undefined ? { width: newKey.width } : {}),
      ...(newKey.pad !== undefined ? { pad: newKey.pad } : {}),
      ...(effectiveLayer(newKey) !== undefined
        ? { layer: effectiveLayer(newKey) as string }
        : {}),
    };
    ops.push({
      address: addr(anchor.id),
      kind: "add",
      position: anchor.position,
      key: spec,
    });
    // The `add` applier materializes default geometry regardless of the
    // spec — follow with a `set` restoring authored width/pad (module
    // header). The new key's own id addresses it (unique per the guards).
    const geomWidth =
      spec.width !== undefined && spec.width !== DEFAULT_KEY_WIDTH_PCT
        ? spec.width
        : undefined;
    const geomPad =
      spec.pad !== undefined && spec.pad !== DEFAULT_KEY_PAD_PCT
        ? spec.pad
        : undefined;
    if (geomWidth !== undefined || geomPad !== undefined) {
      ops.push({
        address: addr(newKey.id),
        kind: "set",
        fields: {
          ...(geomWidth !== undefined ? { width: geomWidth } : {}),
          ...(geomPad !== undefined ? { pad: geomPad } : {}),
        },
      });
    }
  };
  // Resolve every add's anchor first (rejections before any emission), then
  // emit in an order that lands keys correctly: "before" anchors in
  // ascending new-order, "after" anchors in DESCENDING new-order (each
  // insert goes directly against the anchor).
  const resolvedAdds: Array<{
    newKey: TouchKeyIR;
    j: number;
    anchor: { id: string; position: "before" | "after" };
  }> = [];
  for (const { k: newKey, j } of addedNew) {
    if (dupIds.has(newKey.id)) {
      return dupReject(newKey.id);
    }
    let anchor = anchorFor(j);
    if (anchor === undefined) {
      // All-new row: the withheld old key is the anchor.
      if (anchorIdx < 0) {
        return {
          ok: false,
          kind: "row-structure",
          detail: `new key "${newKey.id}" has no surviving key to anchor to`,
        };
      }
      anchor = { id: beforeKeys[anchorIdx]!.id, position: "after" };
      anchorUsed = true;
    }
    if (dupIds.has(anchor.id)) return dupReject(anchor.id);
    resolvedAdds.push({ newKey, j, anchor });
  }
  for (const { newKey, anchor } of resolvedAdds
    .filter((r) => r.anchor.position === "before")
    .sort((a, b) => a.j - b.j)) {
    emitAdd(newKey, anchor);
  }
  for (const { newKey, anchor } of resolvedAdds
    .filter((r) => r.anchor.position === "after")
    .sort((a, b) => b.j - a.j)) {
    emitAdd(newKey, anchor);
  }

  // 5. Field sets on paired keys (post-rename ids) and renamed keys.
  // checkOne/diffSubKeys build LOCAL op lists: the duplicate-id guard below
  // must only fire when an op would actually address the duplicated id —
  // untouched duplicates emit nothing and are fine.
  const checkOne = (
    b: TouchKeyIR,
    a: TouchKeyIR,
    address: string,
  ): RowDiffOk | RowDiffRejected => {
    const local: PendingKeyEditOperation[] = [];
    const bad = unexpressible(b, a);
    if (bad !== undefined) {
      return {
        ok: false,
        kind: "unexpressible-field",
        detail: `key "${b.id}": field "${bad}" has no key-edit operation`,
      };
    }
    const changed = diffSettableFields(b, a);
    if (changed !== undefined) {
      local.push({ address, kind: "set", fields: changed });
    }
    const sub = diffSubKeys(addr, address, b, a);
    if (!sub.ok) return sub;
    local.push(...sub.ops);
    return { ok: true, ops: local };
  };
  for (const [oldIdx, newIdx] of allPairs) {
    const b = beforeKeys[oldIdx]!;
    const a = afterKeys[newIdx]!;
    const addressedId = renamedTo.get(oldIdx) ?? b.id;
    const r = checkOne(b, a, addr(addressedId));
    if (!r.ok) return r;
    if (r.ops.length > 0 && dupIds.has(addressedId)) {
      return dupReject(addressedId);
    }
    ops.push(...r.ops);
  }
  for (const [oldIdx, newIdx] of renames) {
    const b = beforeKeys[oldIdx]!;
    const a = afterKeys[newIdx]!;
    // Renames already passed the dupIds guard above; the set addresses the
    // post-rename id.
    const r = checkOne(b, a, addr(a.id));
    if (!r.ok) return r;
    ops.push(...r.ops);
  }

  // 6. The withheld all-new-row anchor is removed last — but only when the
  //    anchor trick actually ran (adds anchored on it). A renamed anchor, or
  //    a row whose leftovers became renames instead of adds, needs no
  //    cleanup remove. The anchor is scaffolding for the replacement, so it
  //    goes with `"drop"`, not `"reflow"` — the replacement keys already
  //    carry the row's width (see step 1).
  if (anchorIdx >= 0 && anchorUsed) {
    const anchorId = beforeKeys[anchorIdx]!.id;
    if (dupIds.has(anchorId)) return dupReject(anchorId);
    ops.push({
      address: addr(anchorId),
      kind: "remove",
      outcome: "drop",
    });
  }

  return { ok: true, ops };
}

// ---------------------------------------------------------------------------
// Sub-key diffs
// ---------------------------------------------------------------------------

function diffSubKeys(
  addr: (keyId: string) => string,
  address: string,
  before: TouchKeyIR,
  after: TouchKeyIR,
): RowDiffOk | RowDiffRejected {
  const ops: PendingKeyEditOperation[] = [];

  for (const kind of ["sk", "multitap"] as const) {
    const b = before[kind] ?? [];
    const a = after[kind] ?? [];
    // Sub-entry duplicates are pathological — refuse rather than address
    // ambiguously, but only when an op would actually address the
    // duplicated sub-id (untouched duplicates emit nothing). Counted per
    // side: an id appearing once before and once after is the normal
    // paired case, not a duplicate.
    const subCounts = new Map<string, number>();
    for (const side of [b, a]) {
      const counts = new Map<string, number>();
      for (const s of side) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
      for (const [id, n] of counts) {
        if (n > 1) subCounts.set(id, n);
      }
    }
    const dupSubReject = (id: string): RowDiffRejected => ({
      ok: false,
      kind: "duplicate-id-edit",
      detail: `sub-key "${id}" (${kind}) is duplicated`,
    });
    const pairs = lcsPair(
      b.map((s) => s.id),
      a.map((s) => s.id),
    );
    const pairedB = new Set(pairs.map(([i]) => i));
    const pairedJ = new Set(pairs.map(([, j]) => j));
    for (let i = 0; i < b.length; i++) {
      if (pairedB.has(i)) continue;
      const id = b[i]!.id;
      if ((subCounts.get(id) ?? 0) > 1) return dupSubReject(id);
      const sub: SubKeyRefFields = { kind, id };
      ops.push({ address, kind: "removeSubKey", sub });
    }
    for (let j = 0; j < a.length; j++) {
      if (pairedJ.has(j)) continue;
      const id = a[j]!.id;
      if ((subCounts.get(id) ?? 0) > 1) return dupSubReject(id);
      const sub: SubKeyRefFields = { kind, id };
      ops.push({ address, kind: "setSubKey", sub, fields: editableOf(a[j]!) });
    }
    for (const [i, j] of pairs) {
      const changed = diffSettableFields(b[i]!, a[j]!);
      if (changed !== undefined) {
        const id = b[i]!.id;
        if ((subCounts.get(id) ?? 0) > 1) return dupSubReject(id);
        const sub: SubKeyRefFields = { kind, id };
        ops.push({ address, kind: "setSubKey", sub, fields: changed });
      }
    }
  }

  // flick is direction-keyed, not an array. Widened to string-keyed: the
  // directions are a fixed literal set on the type, but the differ treats
  // them opaquely (a new direction string round-trips through the applier).
  const bFlick: Partial<Record<string, TouchKeyIR>> = before.flick ?? {};
  const aFlick: Partial<Record<string, TouchKeyIR>> = after.flick ?? {};
  for (const dir of Object.keys(bFlick)) {
    if (!(dir in aFlick)) {
      const sub: SubKeyRefFields = { kind: "flick", id: dir };
      ops.push({ address, kind: "removeSubKey", sub });
    }
  }
  for (const dir of Object.keys(aFlick)) {
    const sub: SubKeyRefFields = { kind: "flick", id: dir };
    if (!(dir in bFlick)) {
      ops.push({
        address,
        kind: "setSubKey",
        sub,
        fields: editableOf(aFlick[dir]!),
      });
    } else {
      const changed = diffSettableFields(bFlick[dir]!, aFlick[dir]!);
      if (changed !== undefined) {
        ops.push({ address, kind: "setSubKey", sub, fields: changed });
      }
    }
  }

  return { ok: true, ops };
}

// Re-exported for the pane's tests.
export { lcsPair };
