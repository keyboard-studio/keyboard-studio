/**
 * keyGridViewModel — the key grid's view model as a PURE PROJECTION from a
 * touch layout + the touch key <-> rule join, holding no state of its own
 * (spec 058 T063; [data-model.md](../../../../../specs/058-touch-key-editor/data-model.md)
 * §8; FR-020, FR-022, FR-030).
 *
 * `buildKeyGridViewModel` is a plain function: same (layout, ruleIndex,
 * platform, layerId) in, same `KeyGridViewModel` out, no mutation of any
 * input, no subscription, no framework import. T064-T071 put React (roving
 * tabindex, navigation, the inspector, find-by-value) around this; keeping it
 * framework-free is what makes it cheap to re-derive on every debounce cycle
 * (decision D3) and cheap to unit-test without mounting anything.
 *
 * ## Overlay folding — a deliberate seam, not an oversight
 *
 * The task brief for this module reads "a pure projection from layout +
 * overlay + rule index" — and `layout` here IS the overlay-folded (effective)
 * layout, not the pristine base layout. Folding a `KeyEditOverlay` into a
 * `TouchLayoutIR` already exists and is exactly `replayKeyEditOverlay` /
 * `applyKeyEditsToLayout` (`packages/engine/src/pattern-apply/
 * applyKeyEditsToLayout.ts`, committed in Phase 5a) — this module deliberately
 * does NOT re-implement that fold, per the task's own "do not re-derive"
 * instruction.
 *
 * It also does not CALL that fold, for a narrower reason: at the time this
 * module was written, `packages/engine/src/index.ts` (the studio's only
 * sanctioned entry point into engine — dependency-cruiser's `no-circular` /
 * team-boundary rules, spec §12/§13) re-exports the VFS-level
 * `applyKeyEditsToVfs` and the `KeyEditOverlay` TYPE, but neither
 * `applyKeyEditsToLayout` nor `replayKeyEditOverlay` themselves. Reaching past
 * `packages/engine/src/pattern-apply/applyKeyEditsToLayout.js` directly would
 * violate the same package-boundary discipline this codebase already enforces
 * via `package.json`'s `exports` map (Node/bundler module resolution refuses
 * an unexported subpath). Confirmed against the on-disk `index.ts` at the time
 * of writing — a sibling task (T053, "give `useWorkingCopyTransform` an
 * optional live-layout override … the in-progress `touchLayoutJson` plus the
 * overlay") needs the exact same fold and is the natural place to add the
 * missing re-export.
 *
 * So: this module's `layout` parameter is contracted to already be the
 * effective layout. The caller (a later task wiring this into
 * TouchGallery/KeyGrid) folds the overlay in first — today via whatever path
 * `useWorkingCopyTransform` uses, and once the engine index gains the export,
 * directly via `replayKeyEditOverlay(baseLayout, overlay).layout`. This keeps
 * `keyGridViewModel.ts` honestly framework- AND engine-internals-free: its
 * only import from `@keyboard-studio/engine` is the already-exported,
 * already-stable `touchKeyAddress` builder.
 *
 * **DEFECT to flag upstream:** `packages/engine/src/index.ts` should export
 * `applyKeyEditsToLayout` / `replayKeyEditOverlay` (and their result types)
 * from `./pattern-apply/index.js` alongside the existing `KeyEditOverlay` type
 * export, so studio code other than the VFS projection pass can fold an
 * overlay into a `TouchLayoutIR` without reaching into engine internals.
 *
 * ## `direction` — a second seam
 *
 * FR-020i requires RTL layers to render mirrored, with direction resolved
 * PER LAYER (a Latin-numeral layer inside an Arabic keyboard is legitimate).
 * That resolution algorithm is T066's job, not this module's — this module
 * takes `direction` as an optional input (default `"ltr"`), threaded straight
 * onto the returned view model. T066 supplies the real per-layer value; no
 * shape change is needed when it does.
 *
 * ## `findings` — the Phase 9 seam
 *
 * The eight FR-040 diagnostics (`TouchKeyFinding`, contract-shaped per
 * data-model.md §10) are T113-T121, which do not exist yet. Rather than
 * hardcode `findings: []` on every cell — which T113+ would then have to come
 * back and thread through this module's internals — this module accepts an
 * optional `findingsByAddress: ReadonlyMap<address, TouchKeyFinding[]>` and
 * looks each cell's findings up by its own `address`. A cell whose address has
 * no entry gets `[]`. When T113 lands its real `TouchKeyFinding` type
 * (`packages/engine/src/pattern-apply/touchKeyDiagnostics.ts`, per tasks.md),
 * this module's LOCAL placeholder type below is deleted and this file's one
 * import line is repointed at the real one — the map-lookup wiring in
 * `buildCell` does not change. `useValidatorFindings` (T114) is expected to be
 * the map's producer, aggregated from the same working IR/layout this module
 * already receives — "no second store field, no second timer" (data-model.md
 * §10) holds because this module adds neither.
 *
 * ## `producedChars` semantics — narrower than `computeTouchCoverage`
 *
 * `computeTouchCoverage`'s `collectKeyChars` is deliberately GENEROUS for
 * coverage SCORING (it also credits a `*`-guarded frame label's absence, a
 * U+25CC-stripped mark form, and recurses into every sub-key) — the right
 * call for "is this inventory character reachable at all". A grid CELL's
 * `producedChars` answers a narrower question — "what does striking exactly
 * this key wire to" — so this module credits only:
 *
 *   1. `key.output` (an explicit override the layout itself declares, wire
 *      key `output`);
 *   2. `decodeUnicodeKeyId(key.id)` — a `U_<HEX>[_<HEX>]*` id's own
 *      self-output (an existing contracts primitive, not re-derived here);
 *   3. `producedByKeyId(ruleIndex, key.id)` — what a `.kmn` rule keyed on
 *      this id's `role: "produces"` binding(s) emit, via the join (T014).
 *
 * It deliberately does NOT fold in `key.text` as production (a `T_*`/`K_*`
 * keycap label is not intrinsic output — the whole reason the join exists,
 * per touch-key-rule-join.ts's module doc, is that a `T_*` id "has no
 * intrinsic output; it produces only via a rule keyed on it"), nor the
 * additive U+25CC-stripped-form heuristic (a coverage-scoring convenience,
 * not a "what does this cell produce" fact), nor sub-key
 * (`sk`/`multitap`/`flick`) recursion — those are summarized instead as
 * `annotations` counts; a future increment may want a per-sub-key cell of its
 * own, at which point THIS is the seam to extend, not to re-derive.
 * Blank/spacer keys (`sp` 9/10, `isSpacerKeyClass`) always produce nothing,
 * matching `collectKeyChars`'s own short-circuit.
 */

import {
  decodeUnicodeKeyId,
  isSpacerKeyClass,
  producedByKeyId,
  type TouchKeyIR,
  type TouchKeyProvenance,
  type TouchKeyRuleIndex,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { touchKeyAddress } from "@keyboard-studio/engine";

// ---------------------------------------------------------------------------
// Geometry — the 100-unit model (FR-022, FR-030's sibling spec text: "the
// 100-unit width grid with DEFAULT_PAD=15", mirroring the vendored KMW
// polyfill's own `ActiveKeyBase.DEFAULT_PAD` constant).
// ---------------------------------------------------------------------------

/** Default key width (percent-like units) when `TouchKeyIR.width` is absent. */
export const DEFAULT_KEY_WIDTH_PCT = 100;

/** Default left padding (percent-like units) when `TouchKeyIR.pad` is absent. */
export const DEFAULT_KEY_PAD_PCT = 15;

// ---------------------------------------------------------------------------
// Annotations (longpress / multitap / flick counts)
// ---------------------------------------------------------------------------

export interface KeyGridAnnotationCounts {
  /** Number of `sk[]` (longpress menu) entries. */
  readonly longpress: number;
  /** Number of `multitap[]` entries. */
  readonly multitap: number;
  /** Number of populated `flick{}` directions. */
  readonly flick: number;
}

// ---------------------------------------------------------------------------
// Findings — Phase 9 seam (T113-T121). See the module doc's "findings"
// section. This is a LOCAL PLACEHOLDER, shaped to match data-model.md §10
// exactly, so the eventual swap to the real engine-owned type is type-only.
// ---------------------------------------------------------------------------

export type TouchKeyFindingSeverity = "error" | "warning" | "hint";

/**
 * Placeholder for the real `TouchKeyFinding` (T113,
 * `packages/engine/src/pattern-apply/touchKeyDiagnostics.ts`). Structured
 * only — `fields` carries data for studio-composed, localized copy; no
 * English prose crosses this boundary (data-model.md §10).
 */
export interface TouchKeyFinding {
  /** One of the eight FR-040 diagnostic codes (opaque here — T113 owns the enum). */
  readonly code: string;
  readonly severity: TouchKeyFindingSeverity;
  /** The key or rule this finding anchors to, in `touchKeyAddress` form. */
  readonly address: string;
  readonly fields: Readonly<Record<string, unknown>>;
  /** At least one fix descriptor, per FR-041 — opaque here, T113 owns the shape. */
  readonly fixes: readonly unknown[];
}

const EMPTY_FINDINGS: readonly TouchKeyFinding[] = [];
const EMPTY_FINDINGS_MAP: ReadonlyMap<string, readonly TouchKeyFinding[]> = new Map();

// ---------------------------------------------------------------------------
// The view model
// ---------------------------------------------------------------------------

export interface KeyGridCellViewModel {
  /** Stable `touchKeyAddress(platform, layerId, key.id)` — never hand-rolled. */
  readonly address: string;
  readonly id: string;
  /** The keycap label (`TouchKeyIR.text`), defaulted to `""` when absent. */
  readonly keycap: string;
  /** Raw `TouchKeyIR.sp`, undefined meaning the implicit letter class (0). */
  readonly sp: number | undefined;
  readonly nextlayer?: string;
  /** `pad ?? DEFAULT_KEY_PAD_PCT` — the 100-unit model. */
  readonly padPct: number;
  /** `width ?? DEFAULT_KEY_WIDTH_PCT` — the 100-unit model. */
  readonly widthPct: number;
  /** See the module doc's "producedChars semantics" section. */
  readonly producedChars: readonly string[];
  readonly annotations: KeyGridAnnotationCounts;
  readonly provenance?: TouchKeyProvenance;
  /** Looked up from `findingsByAddress`; `[]` when the map has no entry. */
  readonly findings: readonly TouchKeyFinding[];
}

export interface KeyGridRowViewModel {
  /**
   * `layerMaxRowTotal - thisRowTotal`, both in raw `padPct + widthPct` units
   * summed across the row's keys — the gap between this row and the WIDEST
   * row in the same layer (mirroring the vendored KMW polyfill's own
   * `totalWidth`-is-the-widest-row-in-the-layer convention, spec.md §"Where
   * Developer's model is authoritative … the rule that the last key in a row
   * stretches to fill the remainder" — this field is the same gap KMW's
   * renderer silently absorbs into that stretch; FR-039 wants it rendered
   * visibly instead). A single-row layer, or a layer whose rows are all the
   * same total width, has `slackPct === 0` for every row. Not clamped: an
   * over-full row (rare, author-authored) reports a value of 0 here only
   * because it — by definition — IS the layer max; it never goes negative
   * for the max row, and no other row can exceed the max by construction.
   */
  readonly slackPct: number;
  readonly keys: readonly KeyGridCellViewModel[];
}

export interface KeyGridViewModel {
  readonly platform: string;
  readonly layerId: string;
  readonly direction: "ltr" | "rtl";
  readonly rows: readonly KeyGridRowViewModel[];
}

// ---------------------------------------------------------------------------
// Builder input
// ---------------------------------------------------------------------------

export interface BuildKeyGridViewModelInput {
  /**
   * The EFFECTIVE layout — already folded with any committed `KeyEditOverlay`
   * (see the module doc's "Overlay folding" section). This module does not
   * fold an overlay itself.
   */
  readonly layout: TouchLayoutIR;
  /** From `buildTouchKeyRuleIndex(ir)` — built once by the caller, not here. */
  readonly ruleIndex: TouchKeyRuleIndex;
  readonly platform: string;
  readonly layerId: string;
  /** Default `"ltr"`. See the module doc's "`direction` — a second seam". */
  readonly direction?: "ltr" | "rtl";
  /** Default: none (every cell gets `[]`). See the module doc's "findings" section. */
  readonly findingsByAddress?: ReadonlyMap<string, readonly TouchKeyFinding[]>;
}

// ---------------------------------------------------------------------------
// Per-key derivation
// ---------------------------------------------------------------------------

/** `sk[]` / `multitap[]` lengths, plus the count of POPULATED `flick{}` directions. */
function buildAnnotations(key: TouchKeyIR): KeyGridAnnotationCounts {
  let flick = 0;
  if (key.flick) {
    for (const sub of Object.values(key.flick)) {
      if (sub) flick++;
    }
  }
  return {
    longpress: key.sk?.length ?? 0,
    multitap: key.multitap?.length ?? 0,
    flick,
  };
}

/** See the module doc's "producedChars semantics" section for exactly what this credits and why. */
function collectProducedChars(key: TouchKeyIR, ruleIndex: TouchKeyRuleIndex): readonly string[] {
  if (isSpacerKeyClass(key.sp)) return [];

  const out = new Set<string>();
  if (key.output !== undefined && key.output.length > 0) {
    out.add(key.output.normalize("NFC"));
  }
  const decoded = decodeUnicodeKeyId(key.id);
  if (decoded !== undefined) out.add(decoded.normalize("NFC"));
  for (const ch of producedByKeyId(ruleIndex, key.id)) out.add(ch);

  return [...out];
}

function buildCell(
  key: TouchKeyIR,
  platform: string,
  layerId: string,
  ruleIndex: TouchKeyRuleIndex,
  findingsByAddress: ReadonlyMap<string, readonly TouchKeyFinding[]>,
): KeyGridCellViewModel {
  const address = touchKeyAddress(platform, layerId, key.id);
  return {
    address,
    id: key.id,
    keycap: key.text ?? "",
    sp: key.sp,
    ...(key.nextlayer !== undefined ? { nextlayer: key.nextlayer } : {}),
    padPct: key.pad ?? DEFAULT_KEY_PAD_PCT,
    widthPct: key.width ?? DEFAULT_KEY_WIDTH_PCT,
    producedChars: collectProducedChars(key, ruleIndex),
    annotations: buildAnnotations(key),
    ...(key.provenance !== undefined ? { provenance: key.provenance } : {}),
    findings: findingsByAddress.get(address) ?? EMPTY_FINDINGS,
  };
}

// ---------------------------------------------------------------------------
// Row / layer assembly
// ---------------------------------------------------------------------------

function rowTotalPct(keys: readonly KeyGridCellViewModel[]): number {
  let total = 0;
  for (const key of keys) total += key.widthPct + key.padPct;
  return total;
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

/**
 * Build the key grid view model for one (platform, layer) pair. Pure: reads
 * `input.layout` / `input.ruleIndex` / `input.findingsByAddress` without
 * mutating any of them, and returns fresh objects on every call — calling it
 * twice with equal inputs produces deeply-equal (not reference-equal)
 * results.
 *
 * Returns `undefined` when `platform` or `layerId` does not resolve against
 * `layout` — the same never-throw convention `parseTouchKeyAddress` /
 * `resolveKeyAddress` already use for an unresolvable address; an unknown
 * selector is an ordinary, reportable outcome for the caller, not a crash.
 */
export function buildKeyGridViewModel(
  input: BuildKeyGridViewModelInput,
): KeyGridViewModel | undefined {
  const { layout, ruleIndex, platform, layerId } = input;
  const direction = input.direction ?? "ltr";
  const findingsByAddress = input.findingsByAddress ?? EMPTY_FINDINGS_MAP;

  const platformEntry = layout.platforms.find((p) => p.id === platform);
  if (!platformEntry) return undefined;
  const layerEntry = platformEntry.layers.find((l) => l.id === layerId);
  if (!layerEntry) return undefined;

  const rowKeys = layerEntry.rows.map((row) =>
    row.keys.map((key) => buildCell(key, platform, layerId, ruleIndex, findingsByAddress)),
  );
  const rowTotals = rowKeys.map(rowTotalPct);
  const layerMax = rowTotals.length > 0 ? Math.max(...rowTotals) : 0;

  const rows: KeyGridRowViewModel[] = rowKeys.map((keys, i) => ({
    slackPct: layerMax - (rowTotals[i] ?? 0),
    keys,
  }));

  return { platform, layerId, direction, rows };
}
