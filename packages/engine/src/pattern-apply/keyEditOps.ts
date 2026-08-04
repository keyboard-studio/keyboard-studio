/**
 * keyEditOps — the operation union for key-level touch layout editing
 * (spec 058 FR-031…FR-034, FR-036a…FR-036g), plus the machinery both
 * appliers share so they cannot independently drift on what an address
 * means or what a `set` does to a stale `output`:
 *
 * - `applyKeyEditsToLayout.ts`   — the IR applier (Case A, T045)
 * - `applyKeyEditsToRawJson.ts`  — the raw-JSON applier (Case B, T046),
 *   required because spec 035's R9 forbids the import-adapt path from
 *   round-tripping through the IR.
 *
 * Normative source: specs/058-touch-key-editor/contracts/key-edit-overlay.md
 * §3 (operations) and §5 (resolver). This module holds ONLY the operation
 * union, the editable-field shape, and the two pieces of machinery the
 * contract's §5 table marks "shared, exactly once" — the address resolver
 * and the field-semantics function. Traversal and write mechanics (node-id
 * minting + structural sharing vs. in-place JSON mutation + placeholder
 * promotion) are each applier's own, per that same table's "duplicated"
 * column, and do not belong here. No VFS, no React, no I/O.
 *
 * ## What the union deliberately does NOT admit, and why
 *
 * - **`width` / `pad`** are absent from {@link EditableKeyFields} /
 *   {@link NewKeySpec}. Geometry is read-only for Increment 1 (FR-029b);
 *   `remove`'s `"redistribute"` outcome WRITES widths, but only as a
 *   consequence of removing a key, never as a field an operation authors
 *   directly.
 * - **Row and layer operations are not admitted.** They need the declared-
 *   writes extension and row-id stability flagged as Increment 3 work
 *   (research.md R8); admitting them to this union now would invite an
 *   applier that half-supports a kind it cannot yet implement soundly.
 *
 * `KeyEditOverlay` (the ordered log these operations are committed into)
 * lives at the bottom of this file (T048); its replay function,
 * `replayKeyEditOverlay`, lives in `applyKeyEditsToLayout.ts` so this module
 * stays free of a cycle. Replay is deliberately a thin wrapper over Case A's
 * own apply loop (`applyKeyEditsToLayout`, T045) — that loop already
 * resolves each operation against a live view reflecting every prior
 * operation in the same call and already returns the total,
 * never-throws `{ layout, orphaned, warnings }` shape the contract
 * (key-edit-overlay.md §8) requires of replay. There is no second
 * traversal/mutation implementation to maintain here.
 */

import type { TouchKeyAddressParts } from "./touchKeyAddress.js";

// ---------------------------------------------------------------------------
// Editable fields
// ---------------------------------------------------------------------------

/**
 * The full legal `sp` (key class) set an author can assign (FR-029a):
 * 0 letter, 1 special, 2 active-special, 8 deadkey-styled, 9 blank, 10
 * spacer — see `TouchKeyIR.sp`'s corrected doc comment in keyboard-ir.ts.
 */
export type EditableKeySp = 0 | 1 | 2 | 8 | 9 | 10;

/**
 * The fields Increment 1 authors on a key (contract §3). Deliberately
 * narrower than `TouchKeyIR`: no `nodeId`, `provenance`, `hint`, `layer`,
 * `default`, `sk`/`multitap`/`flick` (those are structural, not per-field
 * editable), and no `width`/`pad` (geometry stays read-only — see the
 * module docstring).
 */
export interface EditableKeyFields {
  readonly id: string;
  readonly text: string;
  readonly output?: string;
  readonly sp: EditableKeySp;
  readonly nextlayer?: string;
}

/**
 * The fields authored for a brand-new key (`add` operation). Identical to
 * {@link EditableKeyFields} — a new key is authored no more richly than an
 * edited one; its geometry is assigned by the applier from the `position`
 * it is inserted at, not authored here.
 */
export type NewKeySpec = EditableKeyFields;

// ---------------------------------------------------------------------------
// Sub-key targeting
// ---------------------------------------------------------------------------

/**
 * Which sub-entry of a resolved main key a `setSubKey`/`removeSubKey`
 * operation targets. Reuses the exact shape `TouchKeyAddressParts.sub`
 * already defines (`kind` + `id` — `id` doubles as the `flick` direction
 * string) rather than inventing a second, divergent shape for the same
 * concept.
 */
export type SubKeyRef = NonNullable<TouchKeyAddressParts["sub"]>;

// ---------------------------------------------------------------------------
// The operation union
// ---------------------------------------------------------------------------

export interface KeyEditOperationBase {
  /** Monotonic commit order. Also the undo/redo key. */
  readonly seq: number;
  /**
   * Address of the operation's MAIN key, in the existing `touchKeyAddress`
   * scheme (built by `touchKeyAddress`, parsed by `parseTouchKeyAddress`).
   * Always addresses the parent main key — even for `setSubKey`/
   * `removeSubKey`, which target one of its sub-entries via `sub`, never
   * via a `touchSubKeyAddress`/`touchFlickAddress` string. See
   * {@link resolveKeyAddress}.
   */
  readonly address: string;
  /** Default "key". "family" fans out per layer-families.md (FR-065). */
  readonly scope?: "key" | "family";
}

export interface SetKeyOp extends KeyEditOperationBase {
  readonly kind: "set";
  readonly fields: Partial<EditableKeyFields>;
}

export interface RenameKeyOp extends KeyEditOperationBase {
  readonly kind: "rename";
  readonly toId: string;
}

export interface AddKeyOp extends KeyEditOperationBase {
  readonly kind: "add";
  readonly position: "before" | "after";
  readonly key: NewKeySpec;
}

export interface RemoveKeyOp extends KeyEditOperationBase {
  readonly kind: "remove";
  readonly outcome: "reflow" | "redistribute";
}

/**
 * One operation, not two (contract §3): sets a non-interactive `sp` AND
 * neutralizes the id to a ruleless sentinel in the same commit, so
 * rendering (`sp`) and output (`id`) can never desynchronize into a live
 * key that looks dead (FR-029c). `spClass` is deliberately `9 | 10` — the
 * non-interactive classes — never `8`, which is deadkey-STYLED but
 * interactive (see `isSpacerKeyClass` in touch-coverage.ts).
 */
export interface SuppressKeyOp extends KeyEditOperationBase {
  readonly kind: "suppress";
  readonly spClass: 9 | 10;
  readonly sentinelId: string;
}

export interface SetSubKeyOp extends KeyEditOperationBase {
  readonly kind: "setSubKey";
  readonly sub: SubKeyRef;
  readonly fields: Partial<EditableKeyFields>;
}

export interface RemoveSubKeyOp extends KeyEditOperationBase {
  readonly kind: "removeSubKey";
  readonly sub: SubKeyRef;
}

/**
 * A single committed key-level edit (contract §3). Row and layer operations
 * are deliberately NOT admitted — see the module docstring.
 */
export type KeyEditOperation =
  | SetKeyOp
  | RenameKeyOp
  | AddKeyOp
  | RemoveKeyOp
  | SuppressKeyOp
  | SetSubKeyOp
  | RemoveSubKeyOp;

// ---------------------------------------------------------------------------
// The shared resolver
// ---------------------------------------------------------------------------

/**
 * The minimal structural shape the resolver needs from a key node — enough
 * to be satisfied by BOTH a real `TouchKeyIR` (the IR applier, T045) and the
 * raw `sp`/`width`-as-string JSON key object the raw-JSON applier (T046)
 * reads directly from a parsed `.keyman-touch-layout` file. Same duck-typed
 * precedent as `touch-mechanism-shared.ts`'s predicates (e.g.
 * `isTouchSubKeyDuplicate`), which already share logic across the IR and
 * raw-JSON representations this way.
 */
export interface AddressableKeyLike {
  readonly id: string;
  readonly sk?: readonly AddressableKeyLike[];
  readonly multitap?: readonly AddressableKeyLike[];
  readonly flick?: Readonly<Record<string, AddressableKeyLike | undefined>>;
}

/**
 * The minimal platforms/layers/rows/keys nesting both a `TouchLayoutIR` and
 * a parsed `.keyman-touch-layout` JSON object share.
 */
export interface AddressableLayoutLike<TKey extends AddressableKeyLike> {
  readonly platforms: ReadonlyArray<{
    readonly id: string;
    readonly layers: ReadonlyArray<{
      readonly id: string;
      readonly rows: ReadonlyArray<{ readonly keys: readonly TKey[] }>;
    }>;
  }>;
}

/**
 * Where a resolved main key lives, plus the key itself as it currently
 * stands (before any edit in the operation being processed is applied).
 */
export interface ResolvedKeyLocation<TKey extends AddressableKeyLike> {
  readonly platformIndex: number;
  readonly layerIndex: number;
  readonly rowIndex: number;
  readonly keyIndex: number;
  readonly key: TKey;
}

/**
 * Resolve address parts to the addressed MAIN key, against CURRENT state
 * (contract §5) — never against the layout an overlay was authored against.
 * `undefined` on a miss (unknown platform, layer, or key id), matching
 * `parseTouchKeyAddress`'s never-throw convention: an unresolvable address
 * is an ordinary, reportable outcome (an orphan at replay, FR-033b), not an
 * exception.
 *
 * Resolves the main key only — `parts.sub` (if the address string happened
 * to carry one) is ignored here. Every `KeyEditOperation.address` in this
 * overlay names a main key; `setSubKey`/`removeSubKey` target a sub-entry
 * via their own `sub: SubKeyRef` field instead (see
 * {@link resolveSubKeyEntry}). This keeps ONE resolver shape for all seven
 * operation kinds rather than a second one only two of them would use.
 */
export function resolveKeyAddress<TKey extends AddressableKeyLike>(
  layout: AddressableLayoutLike<TKey>,
  parts: TouchKeyAddressParts,
): ResolvedKeyLocation<TKey> | undefined {
  const platformIndex = layout.platforms.findIndex((p) => p.id === parts.platform);
  if (platformIndex === -1) return undefined;
  const platform = layout.platforms[platformIndex]!;

  const layerIndex = platform.layers.findIndex((l) => l.id === parts.layerId);
  if (layerIndex === -1) return undefined;
  const layer = platform.layers[layerIndex]!;

  for (let rowIndex = 0; rowIndex < layer.rows.length; rowIndex++) {
    const row = layer.rows[rowIndex]!;
    const keyIndex = row.keys.findIndex((k) => k.id === parts.keyId);
    if (keyIndex !== -1) {
      return { platformIndex, layerIndex, rowIndex, keyIndex, key: row.keys[keyIndex]! };
    }
  }
  return undefined;
}

/**
 * Where a resolved sub-entry lives within its parent's `sk[]`/`multitap[]`
 * (by array index) or `flick{}` (by direction key).
 */
export type SubKeyLocation<TKey extends AddressableKeyLike> =
  | { readonly collection: "sk" | "multitap"; readonly index: number; readonly key: TKey }
  | { readonly collection: "flick"; readonly direction: string; readonly key: TKey };

/**
 * Resolve a `SubKeyRef` against an already-resolved main key's sub-entries.
 * `undefined` when the named collection is absent or has no matching
 * entry/direction — same never-throw convention as {@link resolveKeyAddress}.
 */
export function resolveSubKeyEntry<TKey extends AddressableKeyLike>(
  key: TKey,
  sub: SubKeyRef,
): SubKeyLocation<TKey> | undefined {
  if (sub.kind === "flick") {
    const entry = key.flick?.[sub.id];
    return entry ? { collection: "flick", direction: sub.id, key: entry as TKey } : undefined;
  }
  const collection = sub.kind === "sk" ? key.sk : key.multitap;
  if (!collection) return undefined;
  const index = collection.findIndex((s) => s.id === sub.id);
  if (index === -1) return undefined;
  return { collection: sub.kind, index, key: collection[index] as TKey };
}

// ---------------------------------------------------------------------------
// The shared field-semantics function
// ---------------------------------------------------------------------------

/**
 * The ONE place a changed `id` clears a stale `output` (contract §5): if
 * `patch.id` differs from `current.id` and `patch` does not itself supply a
 * new `output`, the resulting fields drop `output` rather than carrying it
 * over from the old id. Both `set` and `rename` (via a synthesized
 * `{ id: toId }` patch) are expected to route through this function so the
 * rule cannot be reimplemented twice and drift.
 *
 * Every other field is a plain override-if-present merge. This function
 * does not otherwise support clearing an optional field — there is no
 * "explicitly unset" patch value under `exactOptionalPropertyTypes` — so an
 * author clearing `output`/`nextlayer` without also changing `id` is a
 * `set`-authoring limitation the studio must express some other way (e.g. a
 * full replace), not something this function works around.
 */
export function applyFieldSemantics(
  current: EditableKeyFields,
  patch: Partial<EditableKeyFields>,
): EditableKeyFields {
  const idChanged = patch.id !== undefined && patch.id !== current.id;
  const clearOutput = idChanged && patch.output === undefined;

  const output = clearOutput ? undefined : (patch.output ?? current.output);
  const nextlayer = patch.nextlayer ?? current.nextlayer;

  return {
    id: patch.id ?? current.id,
    text: patch.text ?? current.text,
    sp: patch.sp ?? current.sp,
    ...(output !== undefined ? { output } : {}),
    ...(nextlayer !== undefined ? { nextlayer } : {}),
  };
}

// ---------------------------------------------------------------------------
// The overlay, and replay (T048)
// ---------------------------------------------------------------------------

/**
 * An ordered log of committed key-level operations (contract §2). Ordered,
 * not keyed — a `Map<address, edit>` cannot express rename-then-edit, since
 * after a rename the later operation's address names a key the original
 * layout never contained. The overlay holds no reference to the layout it
 * was authored against; every address is resolved against whatever layout
 * `replayKeyEditOverlay` is called with, at replay time.
 */
export interface KeyEditOverlay {
  readonly ops: readonly KeyEditOperation[];
}

// `replayKeyEditOverlay` itself lives in `applyKeyEditsToLayout.ts`, not here:
// replay is a thin wrapper over Case A's apply loop, so hosting it in this
// module would make `keyEditOps` -> `applyKeyEditsToLayout` -> `keyEditOps` a
// cycle, which `pnpm depcruise`'s `no-circular` rule blocks.
