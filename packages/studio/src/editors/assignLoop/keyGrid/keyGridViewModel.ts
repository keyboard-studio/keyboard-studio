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
 * ## `findings` — the Phase 9 seam, now closed
 *
 * This module takes an optional
 * `findingsByAddress: ReadonlyMap<address, TouchKeyFinding[]>` and looks each
 * cell's findings up by its own `address`; a cell whose address has no entry
 * gets `[]`. As of T113 the `TouchKeyFinding` type is the real,
 * contracts-owned one (re-exported below for this directory's existing
 * importers) rather than the local placeholder it was written against — a
 * type-only swap; the map-lookup wiring in `buildCell` did not change.
 *
 * The map's producer is `useTouchKeyDiagnostics` (T114,
 * `packages/studio/src/hooks/useValidatorFindings.ts`), aggregated from the
 * same working IR/layout this module already receives. "No second store field,
 * no second timer" (data-model.md §10 / Decision D3) holds because this module
 * adds neither and that hook is a `useMemo`.
 *
 * A finding whose `scope` is `"layer"` or `"rule"` is deliberately still IN the
 * map: its address matches no cell, so no cell ever looks it up, and the grid's
 * layer-level strip reads those from the flat list instead. Filtering them here
 * would just move the same decision to two call sites.
 *
 * ## Duplicate ids — every cell gets its own address
 *
 * `touchKeyAddress` is derived from the key id, and ids are NOT unique within a
 * layer: the shipped `sil_cameroon_azerty.keyman-touch-layout` carries
 * `T_BLANK` twenty-five times and `K_SHIFT` twice inside a single tablet layer,
 * and every scaffolded layout reuses one blank id for every filler slot. Blank
 * and spacer keys have nothing to name them.
 *
 * Cells therefore address by (id, OCCURRENCE) — `createKeyOccurrenceCounter`
 * (contracts), walked row-major across the layer, feeding the builder's
 * occurrence argument. `phone:default:T_BLANK` is the first blank,
 * `phone:default:T_BLANK#3` the fourth, and `resolveKeyAddress` finds exactly
 * the key the cell named.
 *
 * This module must walk in the SAME row-major order the resolver counts in.
 * That is the whole contract between them, and why the counter is a shared
 * contracts primitive rather than a tally kept here.
 *
 * Two things this fixed at once: selecting one blank no longer selects all
 * twenty-five (`isSelected` compares addresses) and no longer edits the first
 * one instead of the chosen one; and the grid can key its React children on the
 * address again, because the address is now genuinely unique among siblings.
 * A `cellKey` field briefly existed for that second job alone, when the address
 * could not do it — it is gone, rather than left as a second identity concept
 * that would immediately start drifting from the first.
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
  createKeyOccurrenceCounter,
  decodeUnicodeKeyId,
  isSpacerKeyClass,
  producedByKeyId,
  type TouchKeyFinding,
  type TouchKeyIR,
  type TouchKeyProvenance,
  type TouchKeyRuleIndex,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  DEFAULT_KEY_PAD_PCT,
  DEFAULT_KEY_WIDTH_PCT,
  computeRowMetrics,
  touchKeyAddress,
  type RowMetrics,
} from "@keyboard-studio/engine";

// ---------------------------------------------------------------------------
// Geometry — the 100-unit model (FR-022, FR-030's sibling spec text: "the
// 100-unit width grid with DEFAULT_PAD=15", mirroring the vendored KMW
// polyfill's own `ActiveKeyBase.DEFAULT_PAD` constant).
// ---------------------------------------------------------------------------

/**
 * The 100-unit model's geometry defaults.
 *
 * Declared here originally; the definitions moved to contracts' `row-metrics.ts`
 * at spec 061 T019 so the engine-side appliers could write the same numbers a
 * newly added key is measured against (T021 — an applier cannot import the
 * studio). Re-exported under the same names, so every existing import site of
 * this module is unchanged.
 */
export {
  DEFAULT_KEY_WIDTH_PCT,
  DEFAULT_KEY_PAD_PCT,
} from "@keyboard-studio/engine";

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
// Findings — the real, contracts-owned shape as of T113. The local placeholder
// this module used to declare is gone; these two lines are the type-only swap
// the module doc's "findings" section predicted. `buildCell`'s map-lookup wiring
// did not change.
// ---------------------------------------------------------------------------

export type {
  TouchKeyFinding,
  TouchKeyFindingSeverity,
} from "@keyboard-studio/contracts";

const EMPTY_FINDINGS: readonly TouchKeyFinding[] = [];
const EMPTY_FINDINGS_MAP: ReadonlyMap<string, readonly TouchKeyFinding[]> = new Map();

// ---------------------------------------------------------------------------
// The view model
// ---------------------------------------------------------------------------

export interface KeyGridCellViewModel {
  /**
   * Stable `touchKeyAddress(platform, layerId, key.id, occurrence)` — never
   * hand-rolled, and unique within the layer (see the module doc's "Duplicate
   * ids"). This is both the engine-facing handle an overlay operation carries
   * and the identity the grid keys its React children on.
   */
  readonly address: string;
  readonly id: string;
  /** The keycap label (`TouchKeyIR.text`), defaulted to `""` when absent. */
  readonly keycap: string;
  /**
   * `TouchKeyIR.hint` — the small secondary label (spec 061 T035).
   *
   * Carried on the cell because the property panel edits it and the panel is
   * driven by the selected CELL, not by the layout. It is deliberately not
   * rendered on the keycap: the grid already shows the keycap, the id and the
   * annotation counts, and a fourth string per cell at 48px tall reads as noise.
   */
  readonly hint?: string;
  /**
   * `TouchKeyIR.layer` — the per-key modifier override (spec 061 T035).
   *
   * Named `layerOverride` rather than `layer` because `KeyGridViewModel`
   * already has a `layerId` meaning the CONTAINING layer, and two fields called
   * `layer*` meaning opposite things on adjacent objects is exactly the
   * confusion `TouchKeyIR.layer`'s own doc warns about ("any 'Sends:' display
   * that reads the containing layer instead of this field is wrong").
   */
  readonly layerOverride?: string;
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
  /**
   * True for the last key of its row (spec 061 T024, FR-012).
   *
   * The renderer stretches exactly this key to the layer maximum, matching
   * KeymanWeb's own last-key-fills-the-row rule. It is on the CELL rather than
   * derived from the index at the render site so the rule is stated once, where
   * the row is assembled, instead of re-derived by every consumer that draws or
   * measures a cell.
   */
  readonly isLastInRow: boolean;
}

export interface KeyGridRowViewModel {
  /**
   * `layerMaxRowTotal - thisRowTotal`, both in raw `padPct + widthPct` units
   * summed across the row's keys — the gap between this row and the WIDEST
   * row in the same layer (mirroring the vendored KMW polyfill's own
   * `totalWidth`-is-the-widest-row-in-the-layer convention, spec.md §"Where
   * Developer's model is authoritative … the rule that the last key in a row
   * stretches to fill the remainder"). A single-row layer, or a layer whose
   * rows are all the same total width, has `slackPct === 0` for every row. Not
   * clamped: an over-full row (rare, author-authored) reports a value of 0 here
   * only because it — by definition — IS the layer max; it never goes negative
   * for the max row, and no other row can exceed the max by construction.
   *
   * **Repointed at spec 061 T024 (FR-012, research D5, ADR 0002).** This used
   * to be a RENDERING input: spec 058's grid drew the gap as a visible diagonal
   * hatch, deliberately declining to absorb it. FR-012 withdraws that reading —
   * the last key of every row now stretches by exactly this much, which is what
   * KeymanWeb does and therefore what the author's keyboard will actually look
   * like. The field is unchanged and still means the same gap; what changed is
   * that its consumer is the STRETCH rather than the hatch, and the hatch is
   * gone. It also remains the input to the "declared vs rendered width"
   * distinction FR-015 asks be stated to the author.
   */
  readonly slackPct: number;
  /**
   * What this row measures, from DECLARED widths (spec 061 T024, FR-013,
   * FR-015) — computed by the shared `computeRowMetrics`, so the figures the
   * readout prints are the same ones `TOUCH_KEY_ROW_CROWDED` fires on and the
   * same ones Layer C's check 18.3 counts. `overMaximumBy` present means this
   * row is over its platform's maximum.
   *
   * Declared, never rendered: the last key renders wider than it is declared
   * (see `slackPct`), and a readout quoting the rendered figure would make the
   * author's own numbers look wrong.
   */
  readonly metrics: RowMetrics;
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
  isLastInRow: boolean,
  address: string,
): KeyGridCellViewModel {
  return {
    isLastInRow,
    address,
    id: key.id,
    keycap: key.text ?? "",
    sp: key.sp,
    ...(key.hint !== undefined ? { hint: key.hint } : {}),
    // `layer ?? layerAnnotation` — the same pair, and the same precedence, the
    // emitter and the key-edit applier both read (see `TouchKeyIR.layer`).
    ...((key.layer ?? key.layerAnnotation) !== undefined
      ? { layerOverride: (key.layer ?? key.layerAnnotation) as string }
      : {}),
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

  // ONE counter for the whole layer, advanced in row-major order — a duplicate
  // id spanning two rows (`K_SHIFT` at both ends of a row, `T_BLANK` filling
  // several) must disambiguate against every earlier occurrence, not just the
  // ones in its own row. This is the order `resolveKeyAddress` counts in; see
  // the module doc's "Duplicate ids".
  const nextOccurrence = createKeyOccurrenceCounter();
  const rowKeys = layerEntry.rows.map((row) =>
    row.keys.map((key, keyIndex) =>
      buildCell(
        key,
        platform,
        layerId,
        ruleIndex,
        findingsByAddress,
        keyIndex === row.keys.length - 1,
        touchKeyAddress(platform, layerId, key.id, nextOccurrence(key.id)),
      ),
    ),
  );
  const rowTotals = rowKeys.map(rowTotalPct);
  const layerMax = rowTotals.length > 0 ? Math.max(...rowTotals) : 0;

  // Measured from the LAYOUT's keys, not from the cells built above: the cells
  // have already defaulted `width`/`pad`, and `computeRowMetrics` applies the
  // same defaults itself. Passing the layout keys keeps one defaulting step in
  // the pipeline rather than two that agree.
  const rows: KeyGridRowViewModel[] = rowKeys.map((keys, i) => ({
    slackPct: layerMax - (rowTotals[i] ?? 0),
    metrics: computeRowMetrics(layerEntry.rows[i]?.keys ?? [], platform),
    keys,
  }));

  return { platform, layerId, direction, rows };
}
