# Interface contracts: Keyboard output picture (spec 084)

These are the identifiers and signatures that tests and consumers code against. Types are defined in [data-model.md](../data-model.md).

## 1. `@keyboard-studio/contracts/host-layouts` (new subpath)

This is a subpath export only, never the barrel. It must not be imported from `/api` code (`api/bundle-safety.test.ts`).

```ts
export const DEADKEY: "deadkey";
export type HostCell = string | typeof DEADKEY;
export type HostLayoutId =
  | "us" | "us-intl" | "azerty" | "qwertz" | "uk"
  | "arabic-101" | "arabic-102" | "arabic-102-azerty";
export type PictureLayer = "base" | "shift" | "altgr" | "shiftAltgr";
export type FamilyId = "qwerty" | "qwertz" | "azerty" | "arabic";
export type KeySetId = "ansi" | "iso";
export const REFERENCE_DATA_VERSION: number;
export const REFERENCE_HOSTS: Record<HostLayoutId, Record<PictureLayer, Record<string, HostCell>>>;
export const HOST_FAMILY: Record<HostLayoutId, FamilyId>;
export const KEY_SETS: Record<KeySetId, ReadonlySet<string>>;
export const HOST_TYPICAL_HARDWARE: Record<HostLayoutId, KeySetId>;
export const MNEMONIC_ASSOCIATIONS: readonly { legend: string; mark: string; label: string }[];

/** Strict layer for the picture. null = not modelled (Ctrl-only, Alt-only…). */
export function pictureLayer(modifiers: readonly string[]): { layer: PictureLayer; caps: boolean } | null;
/** Kept for PR #1854 callers: altgr for the AltGr set, shift, base. */
export function canonicalHostLayer(modifiers: readonly string[]): PictureLayer;
export function lookupHostOutput(host: HostLayoutId, key: string, modifiers?: readonly string[]): HostCell | undefined;
export function comboId(key: string, layer: PictureLayer): string; // `${KEY.toUpperCase()}@${layer}`
export function layoutDistance(a: HostLayoutId, b: HostLayoutId): Record<
  "letters" | "digits" | "punctuation" | "numberRowSymbols" | "altgr", number>;
```

The studio's `referenceHostLayouts.ts` re-exports these for existing callers, and keeps `likelyHostLayouts`, `REGION_TO_HOST` and the new `MARKET_MAPPING`.

## 2. Engine (`packages/engine/src/output-picture/`, exported from `@keyboard-studio/engine`)

```ts
export function buildDefinedComboMap(ir: KeyboardIR): Map<string /* ComboId */, DefinedCombo>;

export interface OutputPictureInput {
  target: KeyboardIR;              // deriveCarvedIr(baseIr, overlay).ir
  startingPoint: KeyboardIR;       // baseIr
  baseKeyboards: readonly HostLayoutId[];
  keySets: readonly KeySetId[];    // [] = union of every mapped key
  inventory?: ReadonlySet<string>; // NFC confirmedInventory, for `wanted`
}
export function computeOutputPicture(input: OutputPictureInput): OutputPictureCell[];
export function computeHandlingSet(input: OutputPictureInput): HandlingSetEntry[];
export function familySupport(picture: readonly OutputPictureCell[], families: readonly FamilyId[]): FamilySupport[];
```

These functions are pure. They never mutate their inputs, and the same input gives the same output (deterministic ordering: by layer, then VKEY).

### Simulator fallback (engine)

```ts
// packages/engine/src/simulator/index.ts: new optional option
simulate(ir, input, { fallback?: (vkey: string, layer: PictureLayer) => HostCell | null });
```

It is implemented by a non-vendored `DefaultOutputRules` subclass that overrides `forBaseKeys`. The vendored KeymanWeb code is untouched.

## 3. Spec 040 facets (`utilities/facet-index/base-layout.ts`)

```ts
export function leakedChars(ir: KeyboardIR, families?: readonly string[]): string[];
// default families = [DEFAULT_BASELAYOUT] ("kbdus"): output byte-identical to today
```

## 4. Studio

```ts
// packages/studio/src/hooks/useHandlingSet.ts
export function useHandlingSet(): {
  picture: OutputPictureCell[];
  handlingSet: HandlingSetEntry[];
  familySupport: FamilySupport[];
  likely: LikelyBaseKeyboardSet;
};

// packages/studio/src/lib/layoutFamily.ts: extended return
useLikelyHostLayouts(bcp47?: string): LikelyBaseKeyboardSet;

// packages/studio/src/stores/workingCopyStore.ts
prefillCarveDispositions(comboIds: string[], opts: {
  sparseLatinOverlay: boolean;
  deadkeyComboIds?: ReadonlySet<string>;
  inventoryAllowComboIds?: ReadonlySet<string>; // new: forces allow-host, provenance "inventory-fallthrough"
}): void;
```

### Test pane message (`packages/studio/public/osk-frame.js`)

```ts
{ type: "SET_BASE_LAYOUT", hostId: HostLayoutId, table: Record<PictureLayer, Record<string, HostCell>> }
```

This is added to the existing `SET_KEYBOARD | SET_OSK_MODE | SET_STRINGS` protocol. The frame produces the table's output for keystrokes the loaded keyboard does not handle.

### i18n message ids (new)

- `output-picture.*`: grid, cell states, captions ("on Windows", "unknown on this base keyboard", "deadkey on this base keyboard", "only where the key exists")
- `output-picture.family.*`: per-family support summary
- `output-picture.distance.*`: layout distance and broken mnemonics
- `output-picture.mismatch.*`: mismatched pair and family-conflict notices
- `carve.review-removed.newly-opened` / `carve.review-removed.already-leaking`: section headings
- `carve.provenance.inventory-fallthrough`
- `layout-family.combine-qwertz.*`: the combine toggle
- `test-pane.base-keyboard.*`: the test pane selector

## 5. Codegen

`scripts/codegen-host-layouts.mjs`:
- `OUTPUT_PATH` becomes `packages/contracts/data/host-layouts.generated.json`.
- `HOST_KEYBOARDS` gains `arabic-101: basic_kbda1`, `arabic-102: basic_kbda2` and `arabic-102-azerty: basic_kbda3`.

The staleness test moves with the data.
