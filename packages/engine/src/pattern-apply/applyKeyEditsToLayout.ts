/**
 * applyKeyEditsToLayout — Case A: the IR applier for key-level touch layout
 * edits (spec 058 FR-031…FR-034, FR-036a…FR-036g).
 *
 * Applies an ordered `KeyEditOperation[]` list to a parsed `TouchLayoutIR`
 * with structural sharing: only the platform/layer whose rows an operation
 * actually touches is rebuilt; every other platform and layer comes back by
 * reference. New key nodes get a minted `nodeId` from a single `NodeIdMinter`
 * per call, the same convention `applyTouchAssignments.ts` uses.
 *
 * Sibling: `applyKeyEditsToRawJson.ts` (Case B) is the raw-JSON twin required
 * by spec 035's R9 — the import-adapt path must never round-trip through the
 * IR. Per contracts/key-edit-overlay.md §5, the two appliers duplicate
 * traversal and write mechanics deliberately, but both reuse the ONE address
 * resolver (`resolveKeyAddress` / `resolveSubKeyEntry`), the ONE
 * field-semantics function (`applyFieldSemantics`), and the ONE `suppress`
 * compound derivation (`applySuppressSemantics`, FR-029b) from
 * `keyEditOps.ts`, so an address, what a `set` means to a stale `output`, or
 * what a `suppress` does to `sp` + `id` together cannot independently drift
 * between them. Do not re-derive that machinery here.
 *
 * ## Fields Case A drops (read by the T047 twin-equivalence test)
 *
 * Every `TouchKeyIR` field an operation does not name (`provenance`, `hint`,
 * `layer`, `default`, and any untouched `sk`/`multitap`/`flick` entry) is
 * carried over unchanged on an edited key — Case A drops nothing of its own
 * accord. The one asymmetry the twin test must compare *modulo*, not treat as
 * a real divergence:
 *
 *   - `nodeId` is IR-only. A fresh `add`'s minted `nodeId` (and the would-be
 *     `TouchLayoutIR.nodeIds` entry a real parse derives for it) has nothing
 *     to compare against in Case B's raw JSON, which carries no such field.
 *     `TouchLayoutIR.nodeIds` itself is intentionally NOT updated for a newly
 *     minted key here, matching `applyTouchAssignments.ts`'s existing
 *     precedent of minting a `nodeId` on the key object without also
 *     maintaining the separate nodeIds index.
 *
 * NOT a modulo exception, but worth calling out because it looks like one:
 * `removeSubKey` emptying a key's LAST `sk`/`multitap`/`flick` entry drops
 * that field entirely (`undefined`) rather than leaving `[]`/`{}` — this is
 * a real behavior both appliers must agree on byte-for-byte (and, after the
 * T047 fix, do), not something the twin comparison excuses.
 *
 * `provenance` PROMOTION (re-tagging an EXISTING edited key, e.g.
 * `"base-derived"` → `"hand-set"`) is deliberately NOT done here — that is a
 * separate, address-matched studio-side path (spec 058 T059) that runs
 * beside this applier, not inside it. This is distinct from `add`, which
 * DOES set `provenance: DEFAULT_TOUCH_PROVENANCE` on the brand-new key it
 * creates (T047 fix): a freshly minted key has no prior wire value to
 * promote FROM, and leaving the field unset in-memory would silently
 * disagree with what re-parsing the same key back out of a
 * `.keyman-touch-layout` file always materializes it to (FR-009) — the
 * exact divergence the twin test caught between this applier and Case B,
 * whose added key always round-trips through a parse.
 *
 * ## Geometry stays read-only, with one documented consequence
 *
 * `width`/`pad` are absent from `EditableKeyFields` (see keyEditOps.ts) — no
 * operation authors them directly. `remove`'s `"redistribute"` outcome is the
 * ONE place this applier writes `width`: the removed key's own width (if any)
 * is split evenly across the remaining keys in its row (contracts/
 * key-edit-overlay.md §3; research.md R3c "remove, then redistribute the
 * freed width"). A removed key with no width, or a row left with no
 * remaining keys, has nothing to redistribute, so no width is written.
 * `"reflow"` writes nothing at all — a row's stretched final key absorbing
 * the slack unevenly is the Keyman Web runtime's own rendering behaviour, not
 * a data change this applier is responsible for.
 *
 * ## `scope: "family"` is not fanned out here
 *
 * Layer-family fan-out (spec 058 FR-065, layerFamilies.ts, Phase 5d) is a
 * separate, independent piece of machinery. This applier treats every
 * operation as scoped to the single key its `address` names, regardless of
 * `scope`; fanning one authored edit into one operation per family member is
 * the caller's job (or a future increment's), not this function's.
 */

import { DEFAULT_TOUCH_PROVENANCE, type TouchKeyIR, type TouchLayoutIR } from "@keyboard-studio/contracts";
import { NodeIdMinter } from "../shared/node-ids.js";
import {
  applyFieldSemantics,
  applySuppressSemantics,
  resolveKeyAddress,
  resolveSubKeyEntry,
  type AddressableLayoutLike,
  type EditableKeyFields,
  type KeyEditOperation,
  type KeyEditOverlay,
  type SubKeyLocation,
} from "./keyEditOps.js";
import { parseTouchKeyAddress } from "./touchKeyAddress.js";
import { DEFAULT_KEY_PAD_PCT, DEFAULT_KEY_WIDTH_PCT } from "./rowMetrics.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ApplyKeyEditsToLayoutResult {
  /** Updated layout (structurally shared with the input where unchanged). */
  layout: TouchLayoutIR;
  /**
   * Operations whose address did not resolve against the CURRENT layout
   * state (an unknown platform/layer/key id, or — for `setSubKey`/
   * `removeSubKey` — an unknown sub-entry). A first-class outcome, never an
   * exception (contract §8): the caller (overlay replay, T048) decides how
   * to surface an orphan.
   */
  orphaned: KeyEditOperation[];
  /** One diagnostic per orphaned operation, plus any other apply-time note. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Per-layer working state (lazy clone-on-first-touch, mirrors
// applyTouchAssignments.ts's LayerWorkState)
// ---------------------------------------------------------------------------

interface LayerWorkState {
  platformIndex: number;
  layerIndex: number;
  /** Shallow-cloned rows whose `keys` array we splice/replace as ops land.
   *  Rows/keys we never touch stay structurally shared with the input. */
  workingRows: Array<{ keys: TouchKeyIR[] }>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply `ops` (in commit order) to `layout`, returning a new, structurally
 * shared layout plus any operations that could not be resolved.
 */
export function applyKeyEditsToLayout(
  layout: TouchLayoutIR,
  ops: readonly KeyEditOperation[],
): ApplyKeyEditsToLayoutResult {
  const warnings: string[] = [];
  const orphaned: KeyEditOperation[] = [];
  const minter = new NodeIdMinter();

  // platformIndex:layerIndex -> working state. A layer nobody's operation
  // touches is never cloned, so it comes back reference-equal.
  const layerStates = new Map<string, LayerWorkState>();
  const stateKey = (platformIndex: number, layerIndex: number): string =>
    `${platformIndex}:${layerIndex}`;

  function getOrCreateLayerState(platformIndex: number, layerIndex: number): LayerWorkState {
    const key = stateKey(platformIndex, layerIndex);
    const existing = layerStates.get(key);
    if (existing) return existing;

    const layer = layout.platforms[platformIndex]!.layers[layerIndex]!;
    const workingRows: Array<{ keys: TouchKeyIR[] }> = layer.rows.map((row) => ({
      keys: [...row.keys],
    }));
    const state: LayerWorkState = { platformIndex, layerIndex, workingRows };
    layerStates.set(key, state);
    return state;
  }

  /**
   * A live view of the layout reflecting every mutation applied so far in
   * this call, for `resolveKeyAddress` to search — the contract requires
   * resolving against CURRENT state (§5), never the layout an operation's
   * address was authored against. Untouched platforms/layers pass through by
   * reference; touched ones read from their working rows.
   */
  function liveView(): AddressableLayoutLike<TouchKeyIR> {
    return {
      platforms: layout.platforms.map((platform, pIdx) => ({
        id: platform.id,
        layers: platform.layers.map((layer, lIdx) => {
          const state = layerStates.get(stateKey(pIdx, lIdx));
          return state ? { id: layer.id, rows: state.workingRows } : layer;
        }),
      })),
    };
  }

  for (const op of ops) {
    const parts = parseTouchKeyAddress(op.address);
    if (!parts) {
      warnings.push(
        `[key-edit-apply] malformed address "${op.address}" (${op.kind}) — operation skipped`,
      );
      orphaned.push(op);
      continue;
    }

    const resolved = resolveKeyAddress(liveView(), parts);
    if (!resolved) {
      warnings.push(
        `[key-edit-apply] address "${op.address}" (${op.kind}) did not resolve — operation skipped`,
      );
      orphaned.push(op);
      continue;
    }

    const { platformIndex, layerIndex, rowIndex, keyIndex, key } = resolved;

    // Sub-entry resolution happens against `key` alone (no layer clone yet):
    // an orphaned setSubKey/removeSubKey must not force a same-content clone
    // of a layer nothing actually changes in (structural-sharing invariant).
    if (op.kind === "setSubKey" || op.kind === "removeSubKey") {
      const subLoc = resolveSubKeyEntry(key, op.sub);
      if (!subLoc) {
        warnings.push(
          `[key-edit-apply] sub-key "${op.sub.kind}:${op.sub.id}" not found on "${op.address}" — operation skipped`,
        );
        orphaned.push(op);
        continue;
      }
      const state = getOrCreateLayerState(platformIndex, layerIndex);
      const row = state.workingRows[rowIndex]!;
      if (op.kind === "setSubKey") {
        const merged = applyFieldSemantics(toEditableFields(subLoc.key), op.fields);
        const updatedSub = mergeFieldsIntoKey(subLoc.key, merged);
        row.keys[keyIndex] = writeSubKeyBack(key, subLoc, updatedSub);
      } else {
        row.keys[keyIndex] = writeSubKeyBack(key, subLoc, undefined);
      }
      continue;
    }

    const state = getOrCreateLayerState(platformIndex, layerIndex);
    const row = state.workingRows[rowIndex]!;

    switch (op.kind) {
      case "set": {
        const merged = applyFieldSemantics(toEditableFields(key), op.fields);
        row.keys[keyIndex] = mergeFieldsIntoKey(key, merged);
        break;
      }

      case "rename": {
        const merged = applyFieldSemantics(toEditableFields(key), { id: op.toId });
        row.keys[keyIndex] = mergeFieldsIntoKey(key, merged);
        break;
      }

      case "add": {
        const newKey: TouchKeyIR = {
          nodeId: minter.mint("touchKey"),
          id: op.key.id,
          // Materialized explicitly, matching what parsing this key back out
          // of a `.keyman-touch-layout` file would always produce for an
          // absent wire value (FR-009's "materialize on deserialize" — see
          // readProvenance in parseTouchLayout.ts). Without this, a
          // freshly-added key would carry `provenance: undefined` forever
          // in-memory, while Case B's raw-JSON twin re-parses to the same
          // `"hand-set"` default the instant it round-trips — a real
          // structural divergence the T047 twin test caught.
          provenance: DEFAULT_TOUCH_PROVENANCE,
          text: op.key.text,
          sp: op.key.sp,
          // The standard default geometry, written explicitly (spec 061 T021,
          // FR-016) — see the Case B twin's own comment in
          // applyKeyEditsToRawJson.ts's `newRawKeyFromSpec` for why "regardless
          // of what the spec carries" is a constraint on what this must NOT do
          // (split the anchor's width, renormalize the row) rather than a value
          // to honour, and why the value is materialized instead of left absent.
          width: DEFAULT_KEY_WIDTH_PCT,
          pad: DEFAULT_KEY_PAD_PCT,
          ...(op.key.output !== undefined ? { output: op.key.output } : {}),
          ...(op.key.nextlayer !== undefined ? { nextlayer: op.key.nextlayer } : {}),
        };
        const insertAt = op.position === "before" ? keyIndex : keyIndex + 1;
        row.keys.splice(insertAt, 0, newKey);
        break;
      }

      case "remove": {
        const [removedKey] = row.keys.splice(keyIndex, 1);
        if (op.outcome === "redistribute" && removedKey) {
          redistributeFreedWidth(row, removedKey.width);
        }
        break;
      }

      case "move": {
        // SPLICE THE EXISTING NODE — never construct a replacement. That is
        // the whole of FR-021: `nodeId`, `provenance`, `sk`, `multitap`,
        // `flick`, `width` and `pad` survive because the object identity does,
        // so the guarantee cannot rot the next time `TouchKeyIR` grows a field.
        // See MoveKeyOp's own doc for why remove+add cannot express this.
        if (op.scope === "family") {
          warnings.push(
            `[key-edit-apply] move at "${op.address}" carries scope "family", which has no shared referent across a layer family — operation skipped`,
          );
          orphaned.push(op);
          break;
        }
        const moved = moveKeyWithinLayer(state.workingRows, rowIndex, keyIndex, op.direction);
        if (!moved) {
          // At a boundary. A no-op, not a failure: the studio never emits one
          // (FR-020 makes the control ABSENT rather than inert), and an
          // overlay replayed against a changed layout may legitimately find
          // the key already at the edge.
          warnings.push(
            `[key-edit-apply] move "${op.direction}" at "${op.address}" has no room in that direction — no change`,
          );
        }
        break;
      }

      case "suppress": {
        // The compound sp+id derivation is shared, exactly once, in
        // keyEditOps.ts (FR-029b) — see applySuppressSemantics's doc for why
        // this applier must not hand-build `{ id: op.sentinelId, sp:
        // op.spClass }` itself.
        const semantics = applySuppressSemantics(toEditableFields(key), op);
        if (!semantics.ok) {
          warnings.push(
            `[key-edit-apply] suppress op at "${op.address}" rejected: sentinelId "${op.sentinelId}" is not a reserved ruleless sentinel — operation skipped`,
          );
          break;
        }
        row.keys[keyIndex] = mergeFieldsIntoKey(key, semantics.fields);
        break;
      }

      // "setSubKey" / "removeSubKey" are handled above, before the layer is
      // cloned, so an orphaned sub-key lookup never forces a same-content
      // rebuild of an otherwise-untouched layer.
    }
  }

  if (layerStates.size === 0) {
    return { layout, orphaned, warnings };
  }

  // Reconstruct with structural sharing: only the touched (platform, layer)
  // pairs are rebuilt; everything else comes back by reference.
  const updatedPlatforms = layout.platforms.map((platform, pIdx) => {
    let anyLayerChanged = false;
    const updatedLayers = platform.layers.map((layer, lIdx) => {
      const state = layerStates.get(stateKey(pIdx, lIdx));
      if (!state) return layer;
      anyLayerChanged = true;
      return { ...layer, rows: state.workingRows };
    });
    if (!anyLayerChanged) return platform;
    return { ...platform, layers: updatedLayers };
  });

  return {
    layout: { ...layout, platforms: updatedPlatforms },
    orphaned,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Field merge helpers
// ---------------------------------------------------------------------------

/** Project a `TouchKeyIR`'s editable slice, defaulting an absent `sp` to `0`
 *  (letter) — the same convention `isProducingKeyClass` etc. already use
 *  (an absent `sp` is treated identically to an explicit `0`). */
function toEditableFields(key: TouchKeyIR): EditableKeyFields {
  return {
    id: key.id,
    text: key.text ?? "",
    sp: (key.sp ?? 0) as EditableKeyFields["sp"],
    ...(key.output !== undefined ? { output: key.output } : {}),
    ...(key.nextlayer !== undefined ? { nextlayer: key.nextlayer } : {}),
    // Spec 061 T030 — the four newly editable fields, read from the same key
    // they are written back onto below.
    ...(key.hint !== undefined ? { hint: key.hint } : {}),
    ...(key.width !== undefined ? { width: key.width } : {}),
    ...(key.pad !== undefined ? { pad: key.pad } : {}),
    // `layer ?? layerAnnotation` — exactly the fallback `emitTouchLayout`
    // itself applies (parse-touch.ts: the emitter writes `layer` when present
    // and falls back to `layerAnnotation` "for keys the editor never touched").
    // Reading the same pair the emitter reads means an edit that leaves `layer`
    // alone cannot silently drop an annotation the emitter would have written.
    ...(layerOf(key) !== undefined ? { layer: layerOf(key) as string } : {}),
  };
}

/**
 * A key's effective layer override — the authoritative editable `layer`, else
 * the read-only `layerAnnotation` both are parsed from. See
 * `TouchKeyIR.layer`'s own doc for why the two exist and carry the same source
 * string.
 */
function layerOf(key: TouchKeyIR): string | undefined {
  return key.layer ?? key.layerAnnotation;
}

/** Write merged editable fields back onto a `TouchKeyIR`, preserving every
 *  other field (nodeId, provenance, default, sk, flick, multitap) untouched.
 *
 *  `hint`, `width`, `pad` and `layer` moved OUT of that preserved set at spec
 *  061 T030 and into the editable set — they are now written from `fields`, and
 *  omitted from the result when `fields` omits them, exactly as `output` and
 *  `nextlayer` already were. */
function mergeFieldsIntoKey(key: TouchKeyIR, fields: EditableKeyFields): TouchKeyIR {
  const {
    output: _omitOutput,
    nextlayer: _omitNextlayer,
    hint: _omitHint,
    width: _omitWidth,
    pad: _omitPad,
    layer: _omitLayer,
    layerAnnotation: _omitLayerAnnotation,
    ...rest
  } = key;
  return {
    ...rest,
    id: fields.id,
    text: fields.text,
    sp: fields.sp,
    ...(fields.output !== undefined ? { output: fields.output } : {}),
    ...(fields.nextlayer !== undefined ? { nextlayer: fields.nextlayer } : {}),
    ...(fields.hint !== undefined ? { hint: fields.hint } : {}),
    ...(fields.width !== undefined ? { width: fields.width } : {}),
    ...(fields.pad !== undefined ? { pad: fields.pad } : {}),
    // Both, together, always. `layer` and `layerAnnotation` are populated from
    // the SAME wire property on parse and only ever carry the same string
    // (`TouchKeyIR.layer`'s doc), so writing one without the other would leave
    // the in-memory IR in a state no parse could produce — and, concretely,
    // would make this applier disagree with its raw-JSON twin the moment an
    // author edits `layer`, since Case B writes the wire field and a re-parse
    // then populates both. Caught by applyKeyEdits.twin.test.ts.
    ...(fields.layer !== undefined
      ? { layer: fields.layer, layerAnnotation: fields.layer }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Sub-key write-back
// ---------------------------------------------------------------------------

/** Write an updated (or, when `undefined`, removed) sub-entry back onto its
 *  parent key, returning a new key object. `sk`/`multitap` become a spliced
 *  copy of the collection; `flick` becomes a copy of the map with the
 *  direction set or deleted. When a removal empties the collection, the
 *  field is DROPPED entirely (not left as `[]`/`{}`) — matching both this
 *  codebase's existing precedent for emptied sub-key collections
 *  (`applyTouchKeycapRemovalsToVfs.ts`'s `stripDeletedFromKey`, which drops
 *  to `undefined` rather than leaving an empty array/object) and Case B's
 *  own `removeResolvedSubKey`, which `delete`s the wire property once
 *  `Object.keys(...)`/`.length` reaches 0. Leaving an empty placeholder here
 *  was a real, undocumented divergence the T047 twin test caught. */
function writeSubKeyBack(
  key: TouchKeyIR,
  loc: SubKeyLocation<TouchKeyIR>,
  updatedSub: TouchKeyIR | undefined,
): TouchKeyIR {
  if (loc.collection === "flick") {
    const nextFlick: Record<string, TouchKeyIR> = { ...(key.flick ?? {}) };
    if (updatedSub === undefined) {
      delete nextFlick[loc.direction];
    } else {
      nextFlick[loc.direction] = updatedSub;
    }
    if (Object.keys(nextFlick).length === 0) {
      const { flick: _droppedFlick, ...rest } = key;
      return rest;
    }
    return { ...key, flick: nextFlick as NonNullable<TouchKeyIR["flick"]> };
  }

  const existing = key[loc.collection] ?? [];
  const nextCollection = [...existing];
  if (updatedSub === undefined) {
    nextCollection.splice(loc.index, 1);
  } else {
    nextCollection[loc.index] = updatedSub;
  }
  if (nextCollection.length === 0) {
    if (loc.collection === "sk") {
      const { sk: _droppedSk, ...rest } = key;
      return rest;
    }
    const { multitap: _droppedMultitap, ...rest } = key;
    return rest;
  }
  return loc.collection === "sk"
    ? { ...key, sk: nextCollection }
    : { ...key, multitap: nextCollection };
}

// ---------------------------------------------------------------------------
// `move` — spec 061 T031 (FR-020, FR-021)
// ---------------------------------------------------------------------------

/**
 * Move the key at `(rowIndex, keyIndex)` one position in `direction`, by
 * splicing the EXISTING node out and back in. Returns `false` — changing
 * nothing — when the move would leave the layer.
 *
 * `left`/`right` swap with the neighbour inside the row. `up`/`down` transfer to
 * the adjacent row at `min(keyIndex, targetRow.keys.length)`, so a key moving
 * into a shorter row lands at its end rather than past it. Nothing wraps in
 * either axis: a key at index 0 cannot move left onto the previous row's tail,
 * and a key in the last row cannot move down to the first.
 *
 * An emptied source row is left in place as a row with no keys, deliberately.
 * Removing it would renumber every row after it, invalidating the `rowIndex` of
 * every subsequent operation in the same overlay — and an empty row is
 * well-formed (it measures `rowTotal: 0`, renders nothing, and the author can
 * move a key back into it).
 *
 * The raw-JSON twin (`applyKeyEditsToRawJson.ts`) implements the same rules over
 * wire objects; both are pinned by `applyKeyEdits.twin.test.ts`.
 */
function moveKeyWithinLayer(
  rows: Array<{ keys: TouchKeyIR[] }>,
  rowIndex: number,
  keyIndex: number,
  direction: "left" | "right" | "up" | "down",
): boolean {
  const row = rows[rowIndex];
  if (!row) return false;

  if (direction === "left" || direction === "right") {
    const target = direction === "left" ? keyIndex - 1 : keyIndex + 1;
    if (target < 0 || target >= row.keys.length) return false;
    const [node] = row.keys.splice(keyIndex, 1);
    row.keys.splice(target, 0, node as TouchKeyIR);
    return true;
  }

  const targetRowIndex = direction === "up" ? rowIndex - 1 : rowIndex + 1;
  const targetRow = rows[targetRowIndex];
  if (!targetRow) return false;
  const [node] = row.keys.splice(keyIndex, 1);
  targetRow.keys.splice(Math.min(keyIndex, targetRow.keys.length), 0, node as TouchKeyIR);
  return true;
}

// ---------------------------------------------------------------------------
// `remove` + `"redistribute"` — the one geometry write this applier performs
// ---------------------------------------------------------------------------

/**
 * Split a freed key's width evenly across the remaining keys of its row.
 * A no-op when the removed key had no width to free, or the row is now
 * empty — there is nothing to redistribute in either case.
 */
function redistributeFreedWidth(row: { keys: TouchKeyIR[] }, freedWidth: number | undefined): void {
  if (!freedWidth || row.keys.length === 0) return;
  const share = freedWidth / row.keys.length;
  row.keys = row.keys.map((k) => ({ ...k, width: (k.width ?? 0) + share }));
}

// ---------------------------------------------------------------------------
// Overlay replay (T048)
// ---------------------------------------------------------------------------

/**
 * Same shape `applyKeyEditsToLayout` already returns (contract §8): a
 * resolution failure is a first-class outcome, never an exception.
 */
export type ReplayKeyEditOverlayResult = ApplyKeyEditsToLayoutResult;

/**
 * Replay `overlay.ops` against `layout`, in commit order (`seq` ascending —
 * `seq` IS the commit order, so this is resilient to an overlay whose `ops`
 * array was reconstructed out of that order, e.g. after undo splices an entry
 * out and back). Each operation's address resolves against the layout state
 * every prior operation in this replay produced, not against the layout the
 * overlay was originally authored against — the apply loop above already
 * provides exactly that live-view resolution, so replay does no traversal of
 * its own.
 *
 * Total and pure: never throws (an unresolved address lands in `orphaned`,
 * not an exception), and never mutates `layout` — a fixed `overlay` replayed
 * against a fixed `layout` always produces the same result.
 *
 * Hosted here rather than beside `KeyEditOverlay` in `keyEditOps.ts` because
 * the reverse direction would make the two modules circular, which
 * `depcruise`'s `no-circular` rule blocks.
 */
export function replayKeyEditOverlay(
  layout: TouchLayoutIR,
  overlay: KeyEditOverlay,
): ReplayKeyEditOverlayResult {
  const orderedOps = [...overlay.ops].sort((a, b) => a.seq - b.seq);
  return applyKeyEditsToLayout(layout, orderedOps);
}
