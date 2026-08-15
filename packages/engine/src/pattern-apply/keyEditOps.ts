/**
 * keyEditOps — the operation union for key-level touch layout editing
 * (spec 063 FR-031…FR-034, FR-036a…FR-036g), plus the machinery both
 * appliers share so they cannot independently drift on what an address
 * means or what a `set` does to a stale `output`:
 *
 * - `applyKeyEditsToLayout.ts`   — the IR applier (Case A, T045)
 * - `applyKeyEditsToRawJson.ts`  — the raw-JSON applier (Case B, T046),
 *   required because spec 035's R9 forbids the import-adapt path from
 *   round-tripping through the IR.
 *
 * Normative source: specs/063-touch-key-editor/contracts/key-edit-overlay.md
 * §3 (operations) and §5 (resolver). This module holds ONLY the operation
 * union, the editable-field shape, and the pieces of machinery the
 * contract's §5 table marks "shared, exactly once" — the address resolver,
 * the field-semantics function, and (FR-029b) the `suppress` compound
 * derivation (`applySuppressSemantics`/`proposeSuppressFields`), which routes
 * through the field-semantics function rather than re-deriving it. Traversal
 * and write mechanics (node-id minting + structural sharing vs. in-place JSON
 * mutation + placeholder promotion) are each applier's own, per that same
 * table's "duplicated" column, and do not belong here. No VFS, no React, no
 * I/O. The one cross-module import — `RESERVED_SENTINEL_KEY_IDS` from
 * `keyIdMinting.ts` — is a read of that module's canonical sentinel-id
 * constant, not a dependency the other direction: `keyIdMinting.ts` does not
 * import this module, so this is not a cycle.
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

import {
  hasAnyBinding,
  isCustomTouchKeyId,
  isFrameKeyLabel,
  isProducingKeyClass,
  isRulelessByConvention,
  isSpacerKeyClass,
  isValidTouchKeyIdentifier,
  normalizeTouchKeyId,
  parseTouchKeyAddress,
  type TouchKeyIR,
  type TouchKeyRuleIndex,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";

import type { TouchKeyAddressParts } from "./touchKeyAddress.js";
import { RESERVED_SENTINEL_KEY_IDS } from "./keyIdMinting.js";

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
 * The fields an author edits on a key (contract §3).
 *
 * Still deliberately narrower than `TouchKeyIR`: no `nodeId`, no `provenance`,
 * no `default`, and no `sk`/`multitap`/`flick` — those last are structural, not
 * per-field editable, and are authored through `setSubKey`/`removeSubKey`.
 *
 * **Spec 061 T030 admitted four more** (FR-018's "all eight editable fields").
 * All four already exist on `TouchKeyIR`, so nothing about the IR changed, and
 * `EditableKeyFields` has no zod mirror in `schemas.ts` — so contracts' Article I
 * drift guard is not engaged and this is an additive, non-breaking widening:
 *
 * - **`hint`** — the small secondary label a key can carry.
 * - **`width` / `pad`** — geometry, read-only for spec 063's Increment 1 and
 *   opened here. FR-015 makes the declared width a *minimum*: the last key of a
 *   row renders stretched past it, which is why editing the declared figure is
 *   safe — it can never make a row unrenderable, only narrower than its
 *   rendering. The studio validates `width` as an integer > 0 and `pad` as an
 *   integer >= 0 before committing; this module does not, for the same reason it
 *   does not validate `text` (see below).
 * - **`layer`** — the per-key modifier override. **Deliberately NOT validated as
 *   a layer reference**, unlike `nextlayer`: corpus keyboards routinely name
 *   layers that do not exist in their own file, and `findDuplicateTouchKeyIds`
 *   already treats this field as free-form when it uses it to disambiguate two
 *   same-id keys. Validating it would reject files that ship and work today.
 *
 * `remove`'s `"redistribute"` outcome still writes `width` as a CONSEQUENCE of
 * removing a key rather than as an authored field, and that path is unchanged.
 */
export interface EditableKeyFields {
  readonly id: string;
  readonly text: string;
  readonly output?: string;
  readonly sp: EditableKeySp;
  readonly nextlayer?: string;
  /** Secondary label (spec 065 T030). */
  readonly hint?: string;
  /** Declared width in the 100-unit model — a MINIMUM, not the rendered width (FR-015). */
  readonly width?: number;
  /** Declared left padding in the 100-unit model. */
  readonly pad?: number;
  /** Per-key modifier override. Free-form by design — see the interface doc. */
  readonly layer?: string;
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
 * Move a key one position in a direction (spec 065 T030, FR-020, FR-021).
 *
 * ## Why a DIRECTION, and no key spec
 *
 * A move cannot be composed from `remove` + `add`. {@link NewKeySpec} carries no
 * `sk`, `multitap`, `flick`, `nodeId` or `provenance`, so a re-add would discard
 * every sub-key and mint a fresh `nodeId` — and the `nodeId` is what key
 * addressing, the decision trail, and spec 035's Case B byte-preservation all
 * key off. FR-021 ("moving a key MUST preserve its identity, sub-keys, geometry
 * and provenance") is therefore satisfied by *how* both appliers implement this:
 * they splice the existing node, never construct a replacement. That makes
 * FR-021 a property of the strategy rather than of a field-copy list that goes
 * stale the next time `TouchKeyIR` grows a field.
 *
 * The op carries a direction rather than an absolute `{toRow, toIndex}` target
 * because an absolute target goes stale under replay: an earlier operation in
 * the same overlay may have changed a row's length, whereas a direction
 * re-resolves against whatever the current state is (research D4).
 *
 * ## No wrapping, ever
 *
 * `left`/`right` swap within the row and stop at its ends; `up`/`down` transfer
 * to the adjacent row, clamped to `min(keyIndex, targetRow.keys.length)`, and
 * stop at the first and last rows. A move that cannot act is a no-op in the
 * appliers — but the studio never emits one, because FR-020 requires the
 * corresponding control be *absent* rather than inert.
 *
 * ## `scope: "family"` is rejected
 *
 * A family fan-out repeats an operation across a layer family's siblings, which
 * is meaningful for a field edit and meaningless for a position change — the
 * siblings' rows are not required to be the same length, so "the same move" has
 * no shared referent. Passing it is a programming error, reported as a warning
 * by both appliers rather than silently half-applied.
 */
export interface MoveKeyOp extends KeyEditOperationBase {
  readonly kind: "move";
  readonly direction: "left" | "right" | "up" | "down";
}

/**
 * One operation, not two (contract §3): sets a non-interactive `sp` AND
 * neutralizes the id to a ruleless sentinel in the same commit, so
 * rendering (`sp`) and output (`id`) can never desynchronize into a live
 * key that looks dead (FR-029c). `spClass` is deliberately `9 | 10` — the
 * non-interactive classes — never `8`, which is deadkey-STYLED but
 * interactive (see `isSpacerKeyClass` in touch-coverage.ts). The compound
 * effect (both fields, together, and rejecting a non-sentinel id) is
 * computed by {@link applySuppressSemantics} below — the paired proposal
 * (which shape implies which `spClass`/id) by {@link proposeSuppressFields}
 * — so neither applier re-derives either half on its own.
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
  | MoveKeyOp
  | SuppressKeyOp
  | SetSubKeyOp
  | RemoveSubKeyOp;

/**
 * True when a `scope: "family"` fan-out is a programming error for this
 * operation. Stated once here so both appliers report it identically rather
 * than each deciding for itself — see {@link MoveKeyOp}'s doc for why a move is
 * the one kind with no shared referent across a layer family.
 */
export function rejectsFamilyScope(op: KeyEditOperation): boolean {
  return op.kind === "move";
}

// ---------------------------------------------------------------------------
// Declared output (spec 063 T060 / FR-033b)
// ---------------------------------------------------------------------------

/**
 * The character an operation DECLARES as its own new `output`, straight from
 * its own fields — no layout lookup, no resolver. `undefined` (never `""`)
 * when the operation carries no declared output of its own.
 *
 * Exactly three of the eight kinds ever author `output` directly:
 * - `add` — a brand-new key's `key.output`;
 * - `set` / `setSubKey` — a patch that happens to touch `fields.output`.
 *
 * The other five — `rename`, `remove`, `move`, `suppress`, `removeSubKey` — name
 * an EXISTING key or sub-entry by address/sub-ref only; they never repeat its
 * content, so this function returns `undefined` for them even though the key
 * they touch may well produce a character. That gap is deliberate: this
 * function answers "what does the OPERATION ITSELF say", not "what does the
 * key it addresses produce" — the latter needs the layout the operation
 * resolves against, which is outside an operation-log module's own domain
 * (see the studio's `keyEditOrphanReport.ts`, which falls back to this
 * function first — cheap, no layout needed — before doing that resolution
 * for the four kinds it cannot answer).
 */
export function declaredOperationOutput(op: KeyEditOperation): string | undefined {
  switch (op.kind) {
    case "add":
      return op.key.output;
    case "set":
    case "setSubKey":
      return op.fields.output;
    default:
      return undefined;
  }
}

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

  // Walk the layer ROW-MAJOR, counting keys that carry this id, and stop at the
  // requested occurrence. An address with no occurrence wants the first, which
  // is what this loop returns on its first match — byte-identical behaviour to
  // the plain `findIndex` this replaced, for every address that names a unique
  // id (nearly all of them) and for every address written before occurrences
  // existed.
  //
  // Row-major is not an arbitrary traversal choice: it is the SAME order
  // `createKeyOccurrenceCounter`'s callers walk in when they build these
  // addresses. If the builder and this resolver disagreed about the order, an
  // occurrence-bearing address would resolve to a different key than the one
  // whose address it is.
  const wanted = parts.occurrence ?? 0;
  let seen = 0;
  for (let rowIndex = 0; rowIndex < layer.rows.length; rowIndex++) {
    const row = layer.rows[rowIndex]!;
    for (let keyIndex = 0; keyIndex < row.keys.length; keyIndex++) {
      const key = row.keys[keyIndex]!;
      if (key.id !== parts.keyId) continue;
      if (seen === wanted) {
        return { platformIndex, layerIndex, rowIndex, keyIndex, key };
      }
      seen++;
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
  // The four fields spec 065 T030 admitted. Plain override-if-present, exactly
  // like `nextlayer`: none of them participates in the id/output coupling
  // above, so none of them is cleared by an id change.
  const hint = patch.hint ?? current.hint;
  const width = patch.width ?? current.width;
  const pad = patch.pad ?? current.pad;
  const layer = patch.layer ?? current.layer;

  return {
    id: patch.id ?? current.id,
    text: patch.text ?? current.text,
    sp: patch.sp ?? current.sp,
    ...(output !== undefined ? { output } : {}),
    ...(nextlayer !== undefined ? { nextlayer } : {}),
    ...(hint !== undefined ? { hint } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(pad !== undefined ? { pad } : {}),
    ...(layer !== undefined ? { layer } : {}),
  };
}

// ---------------------------------------------------------------------------
// The shared suppress derivation (contract §3/§5, FR-029b)
// ---------------------------------------------------------------------------

/**
 * The two shapes an author can choose when suppressing a key
 * (key-id-policy.md section 2's "Gap or blank" row): `"keycap-hole"` keeps a
 * keycap-shaped hole in the layout (rendered, but non-interactive);
 * `"spacer"` renders no keycap at all. This is the ONLY vocabulary a caller
 * uses to state intent — the `9`-vs-`10` `sp` value and the `T_BLANK`-vs-
 * `T_SPACER` sentinel are both derived from it below, never chosen
 * separately.
 */
export type SuppressShapeChoice = "keycap-hole" | "spacer";

/**
 * The corpus-matching `(spClass, sentinelId)` pair for a suppress shape
 * choice. `9` (blank) pairs with `T_BLANK` when a keycap-shaped hole is
 * wanted; `10` (spacer) pairs with `T_SPACER` otherwise. A PROPOSAL, not a
 * mutation (spec.md §3c "propose-then-confirm"): the studio calls this to
 * decide what a `SuppressKeyOp` should carry BEFORE the author confirms it,
 * so the 9-vs-10 choice is stated once, here, rather than the engine
 * deciding it silently deep inside an applier.
 */
export function proposeSuppressFields(
  shape: SuppressShapeChoice,
): { readonly spClass: 9 | 10; readonly sentinelId: "T_BLANK" | "T_SPACER" } {
  return shape === "keycap-hole"
    ? { spClass: 9, sentinelId: "T_BLANK" }
    : { spClass: 10, sentinelId: "T_SPACER" };
}

/** Why {@link applySuppressSemantics} rejected a `suppress` op. */
export type SuppressRejectionReason = "sentinel-not-reserved";

export type SuppressSemanticsResult =
  | { readonly ok: true; readonly fields: EditableKeyFields }
  | { readonly ok: false; readonly reason: SuppressRejectionReason };

/**
 * The ONE place a `suppress` op's compound effect (contract §3) is computed:
 * sets `sp` to `op.spClass` (`9` blank | `10` spacer, the non-interactive
 * classes) AND neutralizes `id` to `op.sentinelId` in the SAME
 * {@link applyFieldSemantics} call, so rendering (`sp`) and output (`id`)
 * cannot be committed as two separate merges that drift apart — a half-done
 * suppression is a live key that looks dead (FR-029c). Both
 * `applyKeyEditsToLayout.ts` (Case A) and `applyKeyEditsToRawJson.ts`
 * (Case B) call THIS function rather than each hand-building
 * `{ id: op.sentinelId, sp: op.spClass }` and independently risking exactly
 * the desynchronization FR-029b names (contract §5's "shared, exactly once"
 * field-semantics row).
 *
 * `op.sentinelId` is checked against {@link RESERVED_SENTINEL_KEY_IDS}
 * before merging: a `suppress` op is meaningless (FR-029c's "ruleless
 * sentinel") unless its id is actually one of the corpus's ruleless
 * sentinels, so an arbitrary string is rejected rather than silently
 * accepted as "suppressed enough". Never throws — a rejection is an
 * ordinary, reportable outcome (this module's existing never-throw
 * convention, matching {@link resolveKeyAddress}/{@link resolveSubKeyEntry}),
 * not an exception. `SuppressKeyOp.sentinelId` is typed `string` rather than
 * the reserved-sentinel union because the overlay is data the studio
 * proposes but a caller could still hand-construct or load from a stale
 * persisted draft; this function is where that gap is actually closed.
 */
export function applySuppressSemantics(
  current: EditableKeyFields,
  op: SuppressKeyOp,
): SuppressSemanticsResult {
  if (!(RESERVED_SENTINEL_KEY_IDS as readonly string[]).includes(op.sentinelId)) {
    return { ok: false, reason: "sentinel-not-reserved" };
  }
  return {
    ok: true,
    fields: applyFieldSemantics(current, { id: op.sentinelId, sp: op.spClass }),
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

// ---------------------------------------------------------------------------
// Edit-time rejection (spec 063 T118; FR-045, FR-040)
// ---------------------------------------------------------------------------

/**
 * Why {@link checkKeyEditRejections} refused a pending operation.
 *
 * FR-045: "Validation that would create an invalid state MUST **reject the
 * mutation** rather than emit a finding — notably a dead `T_` key MUST NOT be
 * creatable, and an in-layer id collision MUST NOT be writable." Rejection is
 * the counterpart to the reporting path in `touchKeyDiagnostics.ts`: a finding
 * describes a state that exists, and a rejection is how a state never comes to
 * exist. The same defect never appears as both.
 *
 * - `invalid-identifier` — `0x05A` (`ERROR_TouchLayoutInvalidIdentifier`) for
 *   AUTHOR-TYPED input. Deliberately emits **no finding at all** (FR-040): the
 *   only 0x05A finding path is Layer A′ import-fidelity, for ids an imported
 *   keyboard already contained. Grammar shared with that check via
 *   `isValidTouchKeyIdentifier`.
 * - `in-layer-id-collision` — the exact ambiguity `touchKeyAddress` documents as
 *   unaddressable: two keys with one id on one layer cannot both be named by an
 *   operation, so committing one is committing an edit that cannot be undone
 *   precisely.
 * - `would-create-dead-key` — a `T_*` id with no rule, no `nextlayer`, and a
 *   producing `sp`. The one reason that can DOWNGRADE; see
 *   {@link KeyEditRejection.confirmable}.
 */
export type KeyEditRejectionReason =
  | "invalid-identifier"
  | "in-layer-id-collision"
  | "would-create-dead-key";

export interface KeyEditRejection {
  readonly reason: KeyEditRejectionReason;
  /**
   * `true` when the block downgrades to **warn-and-confirm**: the author may
   * proceed after acknowledging it. `false` is a hard block.
   *
   * Only `would-create-dead-key` is ever confirmable, and only when the join
   * cannot see the whole `.kmn` (`ruleIndex.opaqueFragmentCount > 0`, or no
   * index supplied at all) — because a rule for this id may be sitting inside a
   * `RawKmnFragment` the codec could not read, which would make the refusal
   * simply wrong (data-model.md §10).
   *
   * The other two reasons never downgrade, and the asymmetry is the point:
   * `in-layer-id-collision` is a fact about the LAYOUT, which is fully visible —
   * an opaque `.kmn` fragment cannot hide a second key. `invalid-identifier` is
   * a fact about the id's own spelling, which nothing can hide either. Applying
   * the opaque downgrade to those would weaken a sound block for no reason.
   */
  readonly confirmable: boolean;
  /** The id that triggered the rejection — the RESULTING id, not the current one. */
  readonly keyId: string;
  /** The operation's own address, echoed so a caller can locate the key it named. */
  readonly address: string;
}

export type KeyEditRejectionVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly rejections: readonly KeyEditRejection[] };

const OK_VERDICT: KeyEditRejectionVerdict = { ok: true };

/** An operation with no `seq` yet — the studio's `PendingKeyEditOperation`, restated structurally so this module needs no studio import. */
export type UnsequencedKeyEditOperation =
  | Omit<SetKeyOp, "seq">
  | Omit<RenameKeyOp, "seq">
  | Omit<AddKeyOp, "seq">
  | Omit<RemoveKeyOp, "seq">
  | Omit<MoveKeyOp, "seq">
  | Omit<SuppressKeyOp, "seq">
  | Omit<SetSubKeyOp, "seq">
  | Omit<RemoveSubKeyOp, "seq">;

/**
 * The resulting id an operation would write, or `undefined` for the operations
 * that author no id at all (`remove`, `move`, `removeSubKey`, and a
 * `set`/`setSubKey` patch that happens not to touch `id`).
 *
 * `suppress` is deliberately excluded even though it DOES set an id:
 * {@link applySuppressSemantics} already rejects a non-reserved sentinel, and
 * every reserved sentinel is by construction a valid identifier, collision-exempt
 * (several `T_BLANK` keys on one layer is the idiom), and ruleless by design.
 * Re-checking it here would only produce false rejections.
 */
function authoredId(op: UnsequencedKeyEditOperation): string | undefined {
  switch (op.kind) {
    case "rename":
      return op.toId;
    case "add":
      return op.key.id;
    case "set":
    case "setSubKey":
      return op.fields.id;
    default:
      return undefined;
  }
}

/**
 * Check a PENDING operation for mutations that must be refused rather than
 * committed-and-reported (FR-045). Pure, synchronous, and never throws — a
 * rejection is an ordinary outcome, matching this module's existing convention
 * (`resolveKeyAddress`, `applySuppressSemantics`).
 *
 * Returns `{ ok: true }` for every operation that authors no id (see
 * {@link authoredId}) and for every authored id that passes all three checks.
 *
 * **`sub`-targeting operations are checked for identifier validity only.** A
 * `setSubKey` writes an id into an `sk`/`multitap`/`flick` entry, where the
 * in-layer collision rule does not apply (a sub-entry id is scoped to its
 * parent, not the layer) and the dead-key rule is Developer's own 0x092 scope
 * rather than an edit-time invariant — a longpress entry with no rule is
 * reported by `findDeadTouchKeys`, not refused. Stating that here rather than
 * silently running the main-key checks against a sub-entry.
 *
 * @param layout - The EFFECTIVE layout the operation will apply to.
 * @param op - The pending operation, before `seq` is assigned.
 * @param ruleIndex - The touch key/rule join. Omitting it makes the dead-key
 *   rejection `confirmable` rather than hard, for the same reason an opaque
 *   fragment does: without the index this function cannot prove a rule is absent.
 */
export function checkKeyEditRejections(
  layout: TouchLayoutIR,
  op: UnsequencedKeyEditOperation,
  ruleIndex?: TouchKeyRuleIndex,
): KeyEditRejectionVerdict {
  const newId = authoredId(op);
  if (newId === undefined) return OK_VERDICT;

  const rejections: KeyEditRejection[] = [];
  const push = (reason: KeyEditRejectionReason, confirmable: boolean): void => {
    rejections.push({ reason, confirmable, keyId: newId, address: op.address });
  };

  // 1. 0x05A — the id's own spelling. Checked first, and short-circuits: an id
  //    the compiler cannot lex is not worth collision- or rule-checking, and
  //    reporting three reasons for one typo reads as three problems.
  if (!isValidTouchKeyIdentifier(newId)) {
    push("invalid-identifier", false);
    return { ok: false, rejections };
  }

  if (op.kind === "setSubKey") return OK_VERDICT;

  const parts = parseTouchKeyAddress(op.address);
  if (parts === undefined) return OK_VERDICT;
  const layer = findLayer(layout, parts.platform, parts.layerId);
  // An unresolvable platform/layer is not a rejection: it is an ordinary
  // reportable miss (an orphan at replay, FR-033b), and refusing the edit here
  // would turn that into a dead end the author cannot act on.
  if (layer === undefined) return OK_VERDICT;
  // Same reasoning one level down, and it is NOT redundant with the layer check:
  // an operation naming a key the layer does not carry will orphan rather than
  // mutate, so there is no resulting key for the two state-based checks below to
  // be about. Without this, such an op read as "a `T_` key with no rule and no
  // `sp`" — i.e. a dead key — and got refused, which is precisely the dead end
  // the paragraph above rules out. `add` is included deliberately: its address
  // names the ANCHOR it inserts beside, so an unresolvable anchor orphans too.
  if (findMainKey(layer, parts.keyId) === undefined) return OK_VERDICT;

  // 2. In-layer id collision. The current key at this address is excluded — a
  //    `set` that re-writes a key's own id to what it already is is a no-op, not
  //    a collision. Exemptions mirror `findDuplicateTouchKeyIds`' first two
  //    (sentinel/auto-minted ids, and non-interactive classes), because the
  //    reporting and rejection paths must agree on what counts as a collision:
  //    a duplicate the detector deliberately does not report must not be a
  //    duplicate this function refuses.
  const resultingSp = resultingSpFor(op, layer, parts.keyId);
  const collisionExempt =
    isRulelessByConvention(newId) || isSpacerKeyClass(resultingSp);
  if (!collisionExempt && layerHasOtherKeyWithId(layer, newId, parts.keyId)) {
    push("in-layer-id-collision", false);
  }

  // 3. Would create a dead `T_` key. Same predicate set as
  //    `findDeadTouchKeys` — a state the detector would report as a defect must
  //    not be reachable by an edit in the first place, which is exactly the
  //    FR-045/FR-040 division of labour.
  if (wouldBeDeadKey(newId, op, layer, parts.keyId, ruleIndex)) {
    const cannotProveAbsence =
      ruleIndex === undefined || ruleIndex.opaqueFragmentCount > 0;
    push("would-create-dead-key", cannotProveAbsence);
  }

  return rejections.length === 0 ? OK_VERDICT : { ok: false, rejections };
}

type ResolvedLayer = TouchLayoutIR["platforms"][number]["layers"][number];

function findLayer(
  layout: TouchLayoutIR,
  platformId: string,
  layerId: string,
): ResolvedLayer | undefined {
  return layout.platforms
    .find((p) => p.id === platformId)
    ?.layers.find((l) => l.id === layerId);
}

/** The main key currently at `keyId` within `layer`, if any. */
function findMainKey(layer: ResolvedLayer, keyId: string): TouchKeyIR | undefined {
  for (const row of layer.rows) {
    const found = row.keys.find((k) => k.id === keyId);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** True when some OTHER main key in `layer` already carries `newId` (case-insensitively, matching `kmcmplib` interning). */
function layerHasOtherKeyWithId(
  layer: ResolvedLayer,
  newId: string,
  currentKeyId: string,
): boolean {
  const target = normalizeTouchKeyId(newId);
  for (const row of layer.rows) {
    for (const key of row.keys) {
      if (key.id === currentKeyId) continue;
      if (normalizeTouchKeyId(key.id) === target) return true;
    }
  }
  return false;
}

/** The `sp` the key would end up with: the op's own value where it authors one, else the current key's. */
function resultingSpFor(
  op: UnsequencedKeyEditOperation,
  layer: ResolvedLayer,
  currentKeyId: string,
): number | undefined {
  if (op.kind === "add") return op.key.sp;
  if (op.kind === "set" && op.fields.sp !== undefined) return op.fields.sp;
  return findMainKey(layer, currentKeyId)?.sp;
}

/**
 * The same exemption chain `findDeadTouchKeys` applies, run against the state the
 * operation WOULD produce rather than against a state that exists.
 *
 * `text` and `nextlayer` come from the op where it authors them and from the
 * current key otherwise, so a `rename` on a key that already has a `nextlayer`
 * correctly stays exempt.
 */
function wouldBeDeadKey(
  newId: string,
  op: UnsequencedKeyEditOperation,
  layer: ResolvedLayer,
  currentKeyId: string,
  ruleIndex: TouchKeyRuleIndex | undefined,
): boolean {
  if (!isCustomTouchKeyId(newId)) return false;
  if (normalizeTouchKeyId(newId).startsWith("U_")) return false;
  if (isRulelessByConvention(newId)) return false;

  const current = findMainKey(layer, currentKeyId);
  const nextlayer =
    op.kind === "add"
      ? op.key.nextlayer
      : op.kind === "set"
        ? (op.fields.nextlayer ?? current?.nextlayer)
        : current?.nextlayer;
  if (nextlayer !== undefined && nextlayer.length > 0) return false;

  const text =
    op.kind === "add"
      ? op.key.text
      : op.kind === "set"
        ? (op.fields.text ?? current?.text)
        : current?.text;
  if (isFrameKeyLabel(text)) return false;

  const sp = resultingSpFor(op, layer, currentKeyId);
  if (!isProducingKeyClass(sp)) return false;
  if (isSpacerKeyClass(sp)) return false;

  // An `add` or `set` that supplies its own `output` is not dead: the key types
  // that character directly, with no rule needed. `findDeadTouchKeys` has no
  // equivalent branch because a layout key's `output` is already folded into the
  // grid's `producedChars` before that detector ever sees it — here the output
  // is still only a promise in the operation's fields.
  const output = op.kind === "add" ? op.key.output : op.kind === "set" ? op.fields.output : undefined;
  if (output !== undefined && output.length > 0) return false;

  // Without an index this cannot be proven either way — reported as a
  // CONFIRMABLE rejection by the caller above, never as a hard block.
  if (ruleIndex === undefined) return true;
  return !hasAnyBinding(ruleIndex, newId);
}
