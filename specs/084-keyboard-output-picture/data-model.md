# Data model: Keyboard output picture (spec 084)

Everything here is **derived**, except the four items marked *stored*. Derived values are recomputed from the IR and the reference data and never persisted (FR-010).

## Reference data (contracts, `@keyboard-studio/contracts/host-layouts`)

### BaseKeyboardData *(stored as generated data)*

This already exists as `hostLayouts.generated.json` (PR #1854); it moves to `packages/contracts/data/host-layouts.generated.json`.

| Field | Type | Notes |
|---|---|---|
| `source.commit` | `string \| null` | Keyboards corpus commit. Provenance only. |
| `source.files` | `Record<keyboardId, sha256>` | Staleness check input. |
| `hosts[id].keyboard` | `string` | e.g. `basic_kbduk` |
| `hosts[id].base \| shift \| altgr \| shiftAltgr` | `Record<VKEY, Cell>` | `Cell = string \| "deadkey"`. An absent key means unknown. |

- **Validation:** keys are upper-cased `K_` ids. Every value is a non-empty string, or the `deadkey` sentinel.
- **Versioning:** `REFERENCE_DATA_VERSION` bumps when a regeneration changes a cell.
- **v1 host ids:** `us`, `us-intl`, `azerty`, `qwertz`, `uk`, plus `arabic-101`, `arabic-102` and `arabic-102-azerty` (D11). Ids are additive and never renumbered.

### HostFamily

`HOST_FAMILY: Record<HostLayoutId, FamilyId>`, with `FamilyId = "qwerty" | "qwertz" | "azerty" | "arabic"` (extensible).

### PhysicalKeySet

`KEY_SETS: Record<KeySetId, ReadonlySet<VKEY>>`, with `KeySetId = "ansi" | "iso"`. ISO = ANSI plus `K_OE2`.

`HOST_TYPICAL_HARDWARE: Record<HostLayoutId, KeySetId>`: `us` and `us-intl` are ANSI; the others are ISO.

### MnemonicAssociation

`MNEMONIC_ASSOCIATIONS: readonly { legend: string; mark: string; label: string }[]`

Entries: `^` → U+0302 circumflex, `'` → U+0301 acute, `` ` `` → U+0300 grave, `~` → U+0303 tilde, `"` → U+0308 diaeresis, `,` → U+0327 cedilla. A precomposed output such as `ê` matches through its NFD mark.

## Studio reference data (`packages/studio/src/lib/referenceHostLayouts.ts`)

### MarketMapping *(stored, versioned, source-cited)*

`MARKET_MAPPING: Record<CommunityKey, MarketEntry[]>`, with `MARKET_MAPPING_VERSION`.

| Field | Type | Notes |
|---|---|---|
| `keySet` | `KeySetId` | Typical hardware in use. |
| `baseKeyboard` | `HostLayoutId` | Defaults to the hardware's own layout. |
| `weight` | `"primary" \| "secondary"` | Ordering only. |
| `source` | `string` | Required citation. |

`CommunityKey` is a BCP47 region subtag in v1 (a coarse proxy, FR-001a). v1 ships empty or seed-only (D7).

### LikelyBaseKeyboardSet

This extends today's `useLikelyHostLayouts` result.

| Field | Type | Notes |
|---|---|---|
| `hosts` | `HostLayoutRef[]` | Resolved base keyboards (unchanged). |
| `source` | `"layout-family" \| "market" \| "bcp47" \| "default"` | `market` is new. Returned explicitly, not inferred. |
| `keySets` | `KeySetId[]` | Likely underlying keyboards. Empty means the union. |
| `pairs` | `{ keySet: KeySetId; baseKeyboard: HostLayoutId; mismatch: boolean }[]` | `mismatch` is true when `baseKeyboard` isn't `HOST_TYPICAL_HARDWARE[...]` for that key set's market (FR-001c). |
| `families` | `FamilyId[]` | `HOST_FAMILY` of `hosts`, deduplicated. |

### Survey answers *(stored, existing slot)*

- `layout_family` (existing radio): the primary target family.
- `layout_family_combine_qwertz` (new boolean, same `"layout"` slot): combines QWERTY and QWERTZ into one target (FR-001e). It is declared in the carve step's writes (FR-019).

## Engine derived views (`packages/engine/src/output-picture/`)

### ComboId

`` `${VKEY}@${PictureLayer}` ``, with `PictureLayer = "base" | "shift" | "altgr" | "shiftAltgr"`. It is produced by `pictureLayer(modifiers)`, which returns `null` for Ctrl-only and Alt-only combos (D2).

### DefinedCombo (from `buildDefinedComboMap(ir)`)

| Field | Type | Notes |
|---|---|---|
| `status` | `"defined" \| "uncertain"` | See D3 for the uncertain triggers. |
| `outputKind` | `"char" \| "deadkey" \| "nul" \| "context" \| "beep" \| "other"` | From the first unconditional rule. |
| `output` | `string \| undefined` | Leading character run, when `char`. |
| `ruleNodeIds` | `string[]` | Every rule that touches the combo. |
| `uncertainReasons` | `UncertainReason[]` | `context`, `guard`, `readonly-group`, `caps`, `raw-fragment`, `not-entry-group`. |

A combo absent from the map is **undefined**. AltGr equivalence: rules on `RALT`, `CTRL ALT`, `CTRL RALT`, `LCTRL ALT` and `LCTRL RALT` all map to `altgr` (D4).

### OutputPictureCell (from `computeOutputPicture`)

| Field | Type | Notes |
|---|---|---|
| `combo` | `ComboId` | |
| `yours` | `DefinedCombo \| undefined` | Your keyboard's handling. |
| `perBase` | `Record<HostLayoutId, Cell \| "nothing" \| "unknown">` | Filled when `yours` is absent or uncertain (FR-003). `nothing` means the table maps the key but not on this layer. `unknown` means the table doesn't map the key at all. |
| `keyMissingOn` | `KeySetId[]` | Key sets that lack this physical key (FR-001a label). |

### HandlingSetEntry (from `computeHandlingSet`)

This covers cells where `yours` is absent or uncertain, and at least one `perBase` value is a character or `deadkey` (FR-005).

| Field | Type | Notes |
|---|---|---|
| `combo` | `ComboId` | |
| `perBase` | as above | |
| `status` | `"newly-opened" \| "already-leaking"` | D6 |
| `startingPointOutput` | `DefinedCombo \| undefined` | Present when newly opened. |
| `uncertain` | `boolean` | True when your keyboard's handling is uncertain. |
| `wanted` | `boolean` | True when a leaked character's NFC form is in `confirmedInventory` (FR-001g). |
| `families` | `FamilyId[]` | Families whose base keyboards leak here. |
| `mnemonicBreaks` | `MnemonicBreak[]` | FR-001f |

- **Excluded:** combos on keys absent from every likely key set (FR-001a), and combos with an `allow-host` disposition when the list feeds `swallowUndefined` (FR-013).
- **State transitions:** an entry leaves the set when your keyboard defines the combo (block rule, new rule), and joins it when a carve removes the combo's definition.

### FamilySupport

One per `FamilyId` among the likely families. It holds the count of combos (on existing keys, on the four layers) that are defined, blocked (`nul`/`context` owned by suppression), falling through (handling set), and unknown (FR-001d).

### LayoutDistance

One per pair of likely base keyboards: `Record<Category, number>`, with `Category = letters | digits | punctuation | numberRowSymbols | altgr` (FR-001f).

### MnemonicBreak

`{ combo: ComboId; association: MnemonicAssociation; brokenOn: HostLayoutId[] }`. Raised when your keyboard's rule on `combo` outputs or arms the associated mark, and a listed base keyboard has a different legend character on that key.

## Carve disposition *(stored, existing)*

`CarveDispositionProvenance` gains the additive member `"inventory-fallthrough"` (D9). Its zod mirror in `packages/contracts/src/schemas.ts` and its `PROVENANCE_LABELS` entry land in the same change. This is not the locked `Pattern` schema.
