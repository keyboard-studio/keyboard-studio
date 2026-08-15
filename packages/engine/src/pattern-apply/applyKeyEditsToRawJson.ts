/**
 * applyKeyEditsToRawJson — Case B applier for the key-level touch layout
 * edit overlay (spec 063 FR-031…FR-034, FR-036a…FR-036g): applies a
 * {@link KeyEditOperation} list directly onto a copy of the raw
 * `.keyman-touch-layout` JSON, splicing in place and never round-tripping
 * through `TouchLayoutIR`.
 *
 * The IR round-trip (`parseTouchLayoutString` / `emitTouchLayout`) drops
 * per-key `layer`, per-key `default` (longpress preselect on a sub-key)
 * fidelity beyond what the IR models, platform-level `displayUnderlying` /
 * `font` / `fontsize`, and normalizes `sp`/`width`/`pad` from the wire
 * format's string-or-number encoding to a plain number — the same field
 * list `applyDesktopModificationsToRawJson.ts` and
 * `applyTouchAssignmentsToRawJson.ts` document for their own Case B paths.
 * Spec 035's R9 forbids the import-adapt path from losing any of that, so
 * this module exists as the direct counterpart to
 * `applyKeyEditsToLayout.ts` (Case A, T045) rather than composing Case A's
 * output back through the codec. Every field the parsed key object carries
 * that this module does not explicitly touch survives byte-for-byte
 * (mirrors every other Case B applier in this directory).
 *
 * ## What is shared with Case A, and what is duplicated
 *
 * Per contracts/key-edit-overlay.md §5: the address **parser**
 * (`parseTouchKeyAddress`), the **resolver** (`resolveKeyAddress` /
 * `resolveSubKeyEntry`), the **field-semantics** function
 * (`applyFieldSemantics`), and the **`suppress` compound derivation**
 * (`applySuppressSemantics`, FR-029b) all come from `keyEditOps.ts`
 * UNCHANGED — this module must not re-derive any of them, including
 * hand-building `{ id: op.sentinelId, sp: op.spClass }` for `suppress`
 * itself, which is exactly the drift FR-029b exists to prevent. Traversal
 * (platform→layer→key index build) and write mechanics (in-place JSON
 * mutation vs. Case A's structural sharing + node-id minting) are each
 * applier's own.
 *
 * **A real gap in the shared resolver's generic bound, reported not
 * patched:** `resolveKeyAddress`/`resolveSubKeyEntry` are generic over
 * `TKey extends AddressableKeyLike`, which requires every `sk`/`multitap`/
 * `flick` sub-entry to itself carry a REQUIRED `id`. `RawSubKey` in
 * `touch-layout-wire-format.ts` declares `id` OPTIONAL (leniency for other
 * callers), so `RawKey` does not actually satisfy `TKey extends
 * AddressableKeyLike` and cannot be passed to either function directly —
 * confirmed by compiling the two shapes against each other. This module
 * works around it with a local `AddressableRawKey` type and boundary casts
 * (see below) rather than editing either shared file; a future
 * `RawSubKey.id: string` tightening in `touch-layout-wire-format.ts` would
 * let those casts be removed.
 *
 * ## `add` — always a genuine insertion
 *
 * `add` always splices a brand-new key object into `row.key` immediately
 * before/after the addressed anchor; it never promotes an adjacent blank
 * placeholder in place. **This is a deliberate deviation from this task's
 * own briefing**, which named `applyTouchAssignmentsToRawJson`'s
 * blank-placeholder promotion (`isBlankPlaceholder`) as something to reuse
 * here. Investigating that reuse surfaced a conflict with the load-bearing
 * invariant this whole sub-feature exists to protect (contract §5: the two
 * appliers must never independently drift): `applyKeyEditsToLayout.ts`
 * (Case A, landed concurrently) always inserts a new node for `add` and
 * has no promotion concept, so having Case B sometimes promote instead
 * would make the two appliers disagree on the resulting KEY COUNT for the
 * identical operation list — exactly the divergence the T047 twin
 * equivalence test exists to catch, and not a "modulo node ids" difference
 * it is scoped to tolerate. Symmetry with the landed Case A sibling won
 * out over the standalone instruction; **flagged for km-lead/km-synthesis
 * to confirm** rather than silently picked.
 *
 * ## Geometry (`remove`)
 *
 * `width`/`pad` are absent from `EditableKeyFields` — geometry is
 * read-only this increment (contract §3). `remove`'s `"reflow"` outcome
 * writes nothing: the row simply has one fewer key, and its stretched
 * final key absorbs the remainder at RENDER time (the KMW polyfill; see
 * research.md "Geometry, for the record"), never authored here. Its
 * `"redistribute"` outcome is the one place this module writes `width` as
 * a CONSEQUENCE of the edit: the removed key's own `width` (when present)
 * is split evenly across every remaining key in the row; a removed key
 * with no `width`, or a row left with no remaining keys, has nothing to
 * redistribute, so nothing is written. Mirrors
 * `applyKeyEditsToLayout.ts`'s `redistributeFreedWidth` exactly (no
 * implicit `DEFAULT_KEY_WIDTH` fallback on either side) for the same
 * twin-equivalence reason above.
 *
 * ## Resolution failures
 *
 * An operation whose `address` (or, for `setSubKey`/`removeSubKey`, whose
 * `sub`) does not resolve against the CURRENT layout is reported as a
 * warning and skipped — never thrown — matching `resolveKeyAddress`'s own
 * never-throw convention and FR-033b's re-derivation-resilience framing
 * (a stale address is an ordinary, reportable outcome). `setSubKey`
 * against a not-yet-existing sub-entry is one such case: this module does
 * NOT create a new `sk`/`multitap`/`flick` entry on a miss — the seven
 * operation kinds admit no eighth "add sub-key" kind, and increment 1's
 * sub-key editing is display/deletion-only per research.md R3e — so a
 * `setSubKey` targeting an absent sub-entry warns rather than inventing one.
 *
 * @see keyEditOps.ts                     — the operation union + shared resolver/field-semantics.
 * @see applyKeyEditsToLayout.ts           — Case A (TouchLayoutIR) sibling, T045.
 * @see applyTouchAssignmentsToRawJson.ts — the platform→layer→key index build this
 *   module follows the shape of (its blank-placeholder promotion is deliberately
 *   NOT reused here — see "`add` — always a genuine insertion" above).
 */

import type {
  AddKeyOp,
  KeyEditOperation,
  MoveKeyOp,
  RemoveKeyOp,
  SubKeyLocation,
  SubKeyRef,
  AddressableKeyLike,
  AddressableLayoutLike,
  EditableKeyFields,
} from "./keyEditOps.js";
import {
  applyFieldSemantics,
  applySuppressSemantics,
  resolveKeyAddress,
  resolveSubKeyEntry,
} from "./keyEditOps.js";
import { parseTouchKeyAddress } from "./touchKeyAddress.js";
import { DEFAULT_KEY_PAD_PCT, DEFAULT_KEY_WIDTH_PCT } from "./rowMetrics.js";
import {
  isRawLayer,
  isRawPlatform,
  type RawKey,
  type RawSubKey,
} from "./touch-layout-wire-format.js";

/** The top-level raw `.keyman-touch-layout` JSON object. */
type RawTouchLayout = Record<string, unknown>;

export interface ApplyKeyEditsToRawJsonResult {
  /** Updated `.keyman-touch-layout` JSON string. */
  json: string;
  /** Diagnostic messages for operations that could not be resolved/applied. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// A lightweight, index-based view over the raw JSON so the shared resolver
// (keyEditOps.ts) can be reused as-is. Every `keys`/`rows`/`layers` array
// below is the SAME array reference the parsed JSON tree owns — splicing
// into `row.keys` (an `add`/`remove`) mutates the real `row.key` array too;
// no rebuild is needed between operations since Increment 1 admits no row or
// layer operations (contract §3).
// ---------------------------------------------------------------------------

interface RawKeyRow {
  readonly keys: RawKey[];
}
interface RawKeyLayer {
  readonly id: string;
  readonly rows: RawKeyRow[];
}
interface RawKeyPlatform {
  readonly id: string;
  readonly layers: RawKeyLayer[];
}
interface RawLayoutView {
  readonly platforms: RawKeyPlatform[];
}

/**
 * Type-level view over a raw key satisfying the shared resolver's
 * `TKey extends AddressableKeyLike` bound — see the module docstring's
 * "real gap" note. Never a copy: every cast to/from this type re-labels the
 * identical runtime object.
 */
interface AddressableRawKey extends AddressableKeyLike {
  readonly [k: string]: unknown;
}

function buildLayoutView(layout: RawTouchLayout): RawLayoutView {
  const platforms: RawKeyPlatform[] = [];
  for (const [name, value] of Object.entries(layout)) {
    if (!isRawPlatform(value)) continue;
    const layers: RawKeyLayer[] = [];
    for (const layer of value.layer) {
      if (!isRawLayer(layer)) continue;
      const rows: RawKeyRow[] = [];
      for (const row of layer.row) {
        if (!Array.isArray(row.key)) continue;
        rows.push({ keys: row.key });
      }
      layers.push({ id: layer.id, rows });
    }
    platforms.push({ id: name, layers });
  }
  return { platforms };
}

interface ResolvedMainKey {
  readonly row: RawKeyRow;
  readonly keyIndex: number;
  readonly key: RawKey;
  /**
   * The containing layer's rows, and this row's index within them — needed by
   * `move` (spec 065 T032), which is the only operation that reaches beyond the
   * row it resolved into.
   *
   * These are VIEW rows: `buildLayoutView` skips any wire row whose `key` is not
   * an array, so an index here is not necessarily the wire row's own ordinal.
   * That is correct for a move, which steps between adjacent *well-formed* rows;
   * a malformed row is not somewhere a key could be placed anyway. Each view
   * row's `keys` IS the live wire array, so splicing it mutates the JSON.
   */
  readonly layerRows: RawKeyRow[];
  readonly rowIndex: number;
}

/** Resolve an operation's `address` against the CURRENT view. `undefined` on
 *  a malformed address or a miss — never throws (see module docstring). */
function resolveMainRawKey(view: RawLayoutView, address: string): ResolvedMainKey | undefined {
  const parts = parseTouchKeyAddress(address);
  if (!parts) return undefined;
  const located = resolveKeyAddress(
    view as unknown as AddressableLayoutLike<AddressableRawKey>,
    parts,
  );
  if (!located) return undefined;
  const platform = view.platforms[located.platformIndex]!;
  const layer = platform.layers[located.layerIndex]!;
  const row = layer.rows[located.rowIndex]!;
  const key = row.keys[located.keyIndex]!;
  return {
    row,
    keyIndex: located.keyIndex,
    key,
    layerRows: layer.rows,
    rowIndex: located.rowIndex,
  };
}

// ---------------------------------------------------------------------------
// Reading/writing EditableKeyFields onto a raw object — shared between a
// main RawKey and a RawSubKey (a resolved sub-entry is always id-matched, so
// its `id` is known to be a real string even though RawSubKey declares it
// optional for other callers' leniency).
// ---------------------------------------------------------------------------

type EditableRawTarget = {
  id?: string;
  text?: string;
  output?: string;
  nextlayer?: string;
  [k: string]: unknown;
};

/** Coerce a wire-format numeric field (string | number | unknown) to a finite number. */
function toWireNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function readEditableFields(target: EditableRawTarget): EditableKeyFields {
  // An sp value outside the legal {0,1,2,8,9,10} set is malformed input, not
  // a case this applier defends against — validity is a Layer A concern.
  const sp = (toWireNumber(target["sp"]) ?? 0) as EditableKeyFields["sp"];
  // Spec 061 T030 — the four newly editable fields. `width`/`pad` go through
  // `toWireNumber` because the wire format admits either a number or a numeric
  // string, the same tolerance `applyRemove` already relies on.
  const width = toWireNumber(target["width"]);
  const pad = toWireNumber(target["pad"]);
  return {
    id: target.id ?? "",
    text: typeof target.text === "string" ? target.text : "",
    sp,
    ...(typeof target.output === "string" ? { output: target.output } : {}),
    ...(typeof target.nextlayer === "string" ? { nextlayer: target.nextlayer } : {}),
    ...(typeof target["hint"] === "string" ? { hint: target["hint"] } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(pad !== undefined ? { pad } : {}),
    ...(typeof target["layer"] === "string" ? { layer: target["layer"] } : {}),
  };
}

function writeEditableFields(target: EditableRawTarget, fields: EditableKeyFields): void {
  target.id = fields.id;
  target.text = fields.text;
  target["sp"] = fields.sp;
  if (fields.output !== undefined) target.output = fields.output;
  else delete target.output;
  if (fields.nextlayer !== undefined) target.nextlayer = fields.nextlayer;
  else delete target.nextlayer;
  // Spec 061 T030 — same present-or-deleted discipline as the two above, so a
  // field the merged set omits leaves no stale wire property behind.
  if (fields.hint !== undefined) target["hint"] = fields.hint;
  else delete target["hint"];
  if (fields.width !== undefined) target["width"] = fields.width;
  else delete target["width"];
  if (fields.pad !== undefined) target["pad"] = fields.pad;
  else delete target["pad"];
  if (fields.layer !== undefined) target["layer"] = fields.layer;
  else delete target["layer"];
}

function newRawKeyFromSpec(spec: EditableKeyFields): RawKey {
  const key: RawKey = { id: spec.id, text: spec.text };
  key["sp"] = spec.sp;
  // The standard default geometry, written EXPLICITLY (spec 065 T021, FR-016).
  //
  // `NewKeySpec` is `EditableKeyFields`, which carries no width or pad, so
  // there is nothing to inherit and nothing to honour — "regardless of what the
  // spec carries" is a statement about what this applier must NOT do instead:
  // it must not split the anchor key's width between the anchor and the new
  // key, and it must not renormalize the row so the totals stay put. Both were
  // plausible readings of "add a key without disturbing the layout", and both
  // are wrong: FR-016 wants the new key at the standard default and the row
  // legitimately wider, which is exactly what makes FR-014's "allow more keys,
  // but complain" a coherent pair.
  //
  // Materialized rather than left absent for the same reason `provenance` is in
  // the IR twin: an absent width renders at the default via the view model, so
  // the two paths agree on screen either way — but only an explicit value
  // survives into the emitted artifact, where the author (or Keyman Developer)
  // reads geometry with no view model in the loop.
  key["width"] = DEFAULT_KEY_WIDTH_PCT;
  key["pad"] = DEFAULT_KEY_PAD_PCT;
  if (spec.output !== undefined) key.output = spec.output;
  if (spec.nextlayer !== undefined) key.nextlayer = spec.nextlayer;
  return key;
}

// ---------------------------------------------------------------------------
// Per-kind appliers
// ---------------------------------------------------------------------------

function applyAdd(resolved: ResolvedMainKey, op: AddKeyOp): void {
  // Always a genuine insertion — see the module docstring's "`add` — always
  // a genuine insertion" section for why this does not promote an adjacent
  // blank placeholder despite this task's briefing naming that reuse.
  const insertAt = op.position === "before" ? resolved.keyIndex : resolved.keyIndex + 1;
  resolved.row.keys.splice(insertAt, 0, newRawKeyFromSpec(op.key));
}

/**
 * Case B's `move` (spec 065 T032) — the twin of `applyKeyEditsToLayout.ts`'s
 * `moveKeyWithinLayer`, and held to the same rules by
 * `applyKeyEdits.twin.test.ts`: swap within the row for `left`/`right`,
 * transfer to the adjacent row clamped to `min(keyIndex, targetRow.keys.length)`
 * for `up`/`down`, never wrap, and leave an emptied source row in place.
 *
 * Same splice discipline as the IR twin, and for the same FR-021 reason: the
 * EXISTING wire object is spliced out and back in, never rebuilt. In the raw
 * path that matters even more than in the IR one — a rebuilt object would drop
 * every wire field this applier does not know about, which is precisely the
 * Case B fidelity promise (spec 035) the whole raw path exists to keep.
 *
 * Returns false when the move would leave the layer, having changed nothing.
 */
function applyMove(resolved: ResolvedMainKey, direction: MoveKeyOp["direction"]): boolean {
  const { row, keyIndex, layerRows, rowIndex } = resolved;

  if (direction === "left" || direction === "right") {
    const target = direction === "left" ? keyIndex - 1 : keyIndex + 1;
    if (target < 0 || target >= row.keys.length) return false;
    const [node] = row.keys.splice(keyIndex, 1);
    row.keys.splice(target, 0, node as RawKey);
    return true;
  }

  const targetRow = layerRows[direction === "up" ? rowIndex - 1 : rowIndex + 1];
  if (!targetRow) return false;
  const [node] = row.keys.splice(keyIndex, 1);
  targetRow.keys.splice(Math.min(keyIndex, targetRow.keys.length), 0, node as RawKey);
  return true;
}

function applyRemove(resolved: ResolvedMainKey, op: RemoveKeyOp): void {
  const removedWidth = toWireNumber(resolved.key["width"]);
  resolved.row.keys.splice(resolved.keyIndex, 1);

  // "reflow": no width writes. Redistribute needs a removed width to free —
  // no implicit default (mirrors applyKeyEditsToLayout.ts's
  // redistributeFreedWidth exactly; see module docstring).
  if (op.outcome !== "redistribute" || !removedWidth) return;

  const remaining = resolved.row.keys;
  if (remaining.length === 0) return;
  const share = removedWidth / remaining.length;
  for (const key of remaining) {
    const current = toWireNumber(key["width"]) ?? 0;
    key["width"] = current + share;
  }
}

/**
 * Case B's create half of `setSubKey`'s upsert (spec 065 T042, FR-026) — the
 * twin of `applyKeyEditsToLayout.ts`'s `appendSubKey`.
 *
 * `sk`/`multitap` append; `flick` sets its direction. The new entry is built
 * through the SAME `writeEditableFields` every other write here goes through,
 * so a created sub-key and an edited one carry exactly the same wire shape —
 * which is what lets the twin test compare the two appliers structurally after
 * an add.
 */
function appendRawSubKey(
  mainKey: RawKey,
  sub: SubKeyRef,
  fields: Partial<EditableKeyFields>,
): void {
  const created: RawSubKey = {};
  writeEditableFields(
    created as EditableRawTarget,
    applyFieldSemantics({ id: sub.id, text: "", sp: 0 }, fields),
  );

  if (sub.kind === "flick") {
    mainKey.flick = { ...(mainKey.flick ?? {}), [sub.id]: created };
    return;
  }
  const existing = mainKey[sub.kind] ?? [];
  mainKey[sub.kind] = [...existing, created];
}

function describeSub(sub: SubKeyRef): string {
  return `${sub.kind}:${sub.id}`;
}

function removeResolvedSubKey(
  mainKey: RawKey,
  subLoc: SubKeyLocation<AddressableRawKey>,
): void {
  if (subLoc.collection === "flick") {
    if (mainKey.flick) {
      delete mainKey.flick[subLoc.direction];
      if (Object.keys(mainKey.flick).length === 0) delete mainKey.flick;
    }
    return;
  }
  const arr = mainKey[subLoc.collection];
  if (Array.isArray(arr)) {
    arr.splice(subLoc.index, 1);
    if (arr.length === 0) delete mainKey[subLoc.collection];
  }
}

function warnUnresolved(warnings: string[], op: KeyEditOperation, reason: string): void {
  warnings.push(
    `[key-edit-apply-raw] op #${op.seq} (${op.kind}) at "${op.address}": ${reason} — skipped`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a {@link KeyEditOperation} list, in order, directly onto a copy of
 * the raw `.keyman-touch-layout` JSON string. Pure — the input string is
 * never modified; returns a new JSON string plus per-operation warnings for
 * anything that failed to resolve.
 *
 * @param rawJson Raw `.keyman-touch-layout` JSON string from the working copy.
 * @param ops     The committed key edit operations, in commit order.
 */
export function applyKeyEditsToRawJson(
  rawJson: string,
  ops: readonly KeyEditOperation[],
): ApplyKeyEditsToRawJsonResult {
  const warnings: string[] = [];
  if (ops.length === 0) return { json: rawJson, warnings };

  const layout = JSON.parse(rawJson) as RawTouchLayout;
  const view = buildLayoutView(layout);

  for (const op of ops) {
    const resolved = resolveMainRawKey(view, op.address);
    if (!resolved) {
      warnUnresolved(warnings, op, "address does not resolve against the current layout");
      continue;
    }

    switch (op.kind) {
      case "set": {
        const current = readEditableFields(resolved.key);
        writeEditableFields(resolved.key, applyFieldSemantics(current, op.fields));
        break;
      }
      case "rename": {
        const current = readEditableFields(resolved.key);
        writeEditableFields(resolved.key, applyFieldSemantics(current, { id: op.toId }));
        break;
      }
      case "suppress": {
        // Shared, exactly once, in keyEditOps.ts (FR-029b) — see the module
        // docstring's "What is shared with Case A" section.
        const current = readEditableFields(resolved.key);
        const semantics = applySuppressSemantics(current, op);
        if (!semantics.ok) {
          warnUnresolved(
            warnings,
            op,
            `sentinelId "${op.sentinelId}" is not a reserved ruleless sentinel`,
          );
          break;
        }
        writeEditableFields(resolved.key, semantics.fields);
        break;
      }
      case "add": {
        applyAdd(resolved, op);
        break;
      }
      case "remove": {
        applyRemove(resolved, op);
        break;
      }
      case "move": {
        if (op.scope === "family") {
          warnUnresolved(
            warnings,
            op,
            'scope "family" has no shared referent across a layer family for a move',
          );
          break;
        }
        if (!applyMove(resolved, op.direction)) {
          // A boundary, not a failure — see the IR twin's own comment.
          warnUnresolved(warnings, op, `no room to move "${op.direction}"`);
        }
        break;
      }
      case "setSubKey": {
        const subLoc = resolveSubKeyEntry(resolved.key as unknown as AddressableRawKey, op.sub);
        if (!subLoc) {
          // UPSERT (spec 065 T042, FR-026) — see the IR twin's own comment for
          // why the spec-058 warn-and-skip behaviour this replaced no longer
          // holds: key mode must be able to ADD a longpress, multitap or flick,
          // through the existing operations on the one overlay.
          appendRawSubKey(resolved.key, op.sub, op.fields);
          break;
        }
        const subKey = subLoc.key as unknown as RawSubKey;
        writeEditableFields(subKey, applyFieldSemantics(readEditableFields(subKey), op.fields));
        break;
      }
      case "removeSubKey": {
        const subLoc = resolveSubKeyEntry(resolved.key as unknown as AddressableRawKey, op.sub);
        if (!subLoc) {
          warnUnresolved(
            warnings,
            op,
            `sub-key "${describeSub(op.sub)}" not found on the resolved key`,
          );
          break;
        }
        removeResolvedSubKey(resolved.key, subLoc);
        break;
      }
    }
  }

  return { json: JSON.stringify(layout), warnings };
}
