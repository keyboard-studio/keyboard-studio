# Research: Keyboard output picture (spec 084)

Phase 0 decisions for [plan.md](plan.md). File references are to the PR #1854 branch (`km/issue-1802-spec`) where the carve code lives. Spec 084 builds on it; see D16.

## D1. Where base keyboard data lives

- **Decision:** move the generated tables to `packages/contracts/data/host-layouts.generated.json`. Add `packages/contracts/src/hostLayouts.ts` holding the types, `canonicalHostLayer`, `lookupHostOutput`, the family map and the physical key sets. Export them only through a new `@keyboard-studio/contracts/host-layouts` subpath, never the barrel. `scripts/codegen-host-layouts.mjs` writes the new path.
- **Rationale:** the engine may not import the studio (`.dependency-cruiser.cjs` `engine-not-to-studio`), and both the engine (handling set, simulator fallback) and `utilities/facet-index` (spec 040) need the data. Contracts already ships JSON the same way: `data/base-layouts.json` is read by `keyBudget.ts` with `with { type: "json" }`, and `files` in `package.json` ships `data/`. A subpath keeps the table off the barrel, so nothing that imports the barrel pays for it.
- **Alternatives considered:**
  - Keep it in the studio: the engine and facet-index can't reach it.
  - Put it in the engine: facet-index and contracts consumers would take an engine dependency.
  - Export it from the barrel: needless weight for every barrel importer.

## D2. The combo id

- **Decision:** a combo is `${VKEY}@${layer}`, with `VKEY` upper-cased (`K_OE2`, not `K_oE2`) and `layer` one of `base | shift | altgr | shiftAltgr`. `canonicalHostLayer` gets a strict variant, `pictureLayer(modifiers)`. It returns `null` for combos the picture doesn't model (Ctrl-only, Alt-only, Ctrl+Shift) and reports CAPS-conditioned modifiers so the caller can mark them uncertain.
- **Rationale:** the four layers are exactly what the basic keyboards define. Today's `canonicalHostLayer` maps bare Ctrl or Alt to `base`, which would misfile them. The engine's `modifierCombos.ts` key (`SHIFT+RALT`) is finer-grained, so a small mapping from engine combos to picture layers is needed either way.
- **Alternatives considered:** reuse the engine's `tokens.join("+")`. That splits the AltGr equivalence set (D4) into several keys and doesn't match the table layers.

## D3. Detecting what your keyboard defines

- **Decision:** add a new walker, `buildDefinedComboMap(ir)`, in `packages/engine/src/pattern-apply/modifierCombos.ts`, next to `buildComboKeyMap`. It:
  - uses the **last** vkey in a rule's context as the trigger (the IR flattens the `+` key onto the end), as `ReviewRemovedKeys.triggerKeyOf` and `keyBudget.ruleKey` already do;
  - counts every output kind (char, deadkey, `nul`, `context`, beep, other);
  - collects `ruleNodeIds`;
  - classifies each combo as `defined` or `uncertain`.
  A combo is `uncertain` when its only rules are context-bearing, guarded (`if()`, `baselayout()`, `platform()`), `targetSelector`-gated, in a readonly group, CAPS/NCAPS-conditioned, or not reached through the `using keys` entry group. It is also `uncertain` when an opaque `RawKmnFragment` may define it (`producedOutput` present, or a vkey token in its source text).
- **Rationale:** `buildComboKeyMap` drops deadkey, `nul` and beep rules (`firstRuleCharOutput`) and takes the first vkey, so it would report false leaks. Calling it four times would still miss those rules. The helpers it uses (`extractRuleModifiers`, `foldCasePairCombo`, `resolveAnyIndexEntries`, `canonicalizeCombo`) are shared rather than copied.
- **Alternatives considered:**
  - Extend `buildComboKeyMap`: its callers (layout chart, touch propagation) depend on its char-only semantics.
  - Use the studio's `occupiedHostKeys`: it only recognises simple swaps and deadkeys.

## D4. AltGr arriving as Ctrl+Alt (FR-009)

- **Verified** (help.keyman.com, virtual-keys guide): Windows translates AltGr to LCTRL+RALT. Keyman treats `RALT`, `CTRL ALT`, `CTRL RALT`, `LCTRL ALT` and `LCTRL RALT` as equivalent, and advises using only one of them in a keyboard.
- **Decision:** in the picture, a rule on any member of that set defines the combo on the `altgr` layer (or `shiftAltgr` with Shift). Whether the suppression compiler must also emit an `LCTRL LALT` form, to cover typists who enable "Simulate AltGr with Ctrl+Alt", is settled by an early verification task: a kmcmplib compile plus a KeymanWeb and Core probe. The spec 076 suppression output changes only if that probe shows a gap.
- **Rationale:** the option's default and Keyman Core's flag handling are unverified (recollection only), and changing the compiler on a guess would be worse than one probe.
- **Alternatives considered:** always emit both forms. The guide warns against mixing members of the set, so that could itself cause conflicts.

## D5. Where the picture is computed

- **Decision:** pure engine functions, `computeOutputPicture` and `computeHandlingSet` in a new `packages/engine/src/output-picture/`, take the target IR, the starting-point IR, the likely base keyboards and a physical key set. The studio wraps them in `useHandlingSet()`, a `useMemo` keyed on primitive-stable strings: `deletedKey`, `carveDispositionsKey`, the resolved base keyboard ids, `REFERENCE_DATA_VERSION`, and a starting-point identity. It runs outside the D3 validation cycle.
- **Rationale:**
  - The views produce no diagnostics, so D3 does not govern them (CLAUDE.md, D3 scope note).
  - Engine placement makes them testable against the corpus without React.
  - The target IR comes from `deriveCarvedIr(baseIr, overlay)`, not the store's pre-carve `ir`. One `structuredClone` per carve change is acceptable, and `deriveDesktopModifications` already does the same inside a memo.
- **Alternatives considered:**
  - Compute inside `projectWorkingCopyVfs`: that couples a view to VFS projection.
  - Compute inside D3: that would add work to a cycle meant for diagnostics.
  - Key the memo on `.size` as `TouchGallery` does: that misses edits that keep the same count.

## D6. Newly opened vs already leaking

- **Decision:** compare `buildDefinedComboMap(startingPointIr)` with `buildDefinedComboMap(targetIr)`. A handling-set combo is **newly opened** when the starting point defines it (`defined`, not `uncertain`). Otherwise it is **already leaking**. The starting point is the store's `baseIr` for both tracks.
- **Rationale:** `baseIr` is exactly the starting point (the copied keyboard, or the current release). #1810 notes the name is a misnomer; the rename is out of scope here.
- **Alternatives considered:** diff produced sets (characters). That loses the key information the handling set needs.

## D7. Market mapping and physical key sets (FR-001a/b)

- **Decision:**
  - Physical key sets `ANSI` and `ISO`, plus a `HOST_TYPICAL_HARDWARE: Record<HostLayoutId, KeySetId>`, live in the contracts host-layouts module.
  - The **market mapping** is a versioned, source-cited `MARKET_MAPPING` in `packages/studio/src/lib/referenceHostLayouts.ts`, beside `REGION_TO_HOST`. It maps a community key (a BCP47 region, as a proxy) to (underlying key set, base keyboard) pairs.
  - The market prior becomes a new step between the `layout_family` answer and the region fallback in `likelyHostLayouts`, with provenance `"market"`. `LikelyHostSource` gains that value and is returned explicitly rather than inferred.
  - v1 ships the mechanism with an **empty or seed mapping**, so every community falls back to the union of keys and today's region behaviour until the content team adds cited entries.
- **Rationale:** resolution is a studio concern, but the key-set data is needed by the engine's handling set, which receives the key set as an input. The spec requires every entry to cite a source, and no sourced data exists yet. Shipping the mechanism empty avoids inventing a mapping.
- **Alternatives considered:**
  - Seed entries from general knowledge: this repeats the uncited-table problem PR #1854 just fixed.
  - Ask the author for their hardware: rejected in clarification.

## D8. Families and combined targets (FR-001d/e)

- **Decision:**
  - A `HOST_FAMILY: Record<HostLayoutId, FamilyId>` in the contracts host-layouts module: `us`, `us-intl` and `uk` are `qwerty`; `qwertz` is `qwertz`; `azerty` is `azerty`; Arabic base keyboards are `arabic`.
  - Target families default to the `layout_family` answer.
  - A new **"combine QWERTY and QWERTZ"** toggle, a boolean answer in the existing `"layout"` survey slot, renders beside `LayoutFamilyQuestion` in the carve step and is declared in the carve step's writes.
  - An AZERTY-plus-other conflict shows a notice pointing to a family variant. The studio does not build the variant.
- **Rationale:** a single-value radio with a combine toggle covers the product lead's rule (only QWERTY and QWERTZ combine) with less surface than a multi-select, and it can't express invalid combinations such as AZERTY+QWERTY. The carve step is already a manifest step and already hosts the `layout_family` question, so principle IX is met by declaring the new input there (FR-019); no new step is needed.
- **Alternatives considered:**
  - Turn `layout_family` into a multi-select: that allows AZERTY+QWERTY, which the product lead says needs a variant.
  - Add a new manifest step: disproportionate for one toggle.

## D9. Wanted fall-through (FR-001g)

- **Decision:** a leaked character counts as wanted when its NFC form is in `session.confirmedInventory`. Such combos get the proposed disposition `allow-host` with a new provenance, `"inventory-fallthrough"`. This is an additive member of `CarveDispositionProvenance`, and its zod mirror and `PROVENANCE_LABELS` entry land in the same change. `retainedConvenienceChars` does **not** count: convenience letters are kept deliberately outside the inventory, and their leak is shown but not pre-approved.
- **Rationale:** `confirmedInventory` is the author's confirmed orthography, already NFC and deduplicated, and read by the carve gallery. Proposing allow keeps §3c (propose, then confirm).
- **Alternatives considered:** also count convenience characters. That is flagged for review as the one debatable call here.

## D10. The test pane (FR-014)

- **Decision:** the studio test pane is `components/OSKFrame.tsx`, which wraps a real KeymanWeb in `public/osk-frame.html` / `osk-frame.js`. Add a `SET_BASE_LAYOUT { hostId, table }` message. `osk-frame.js` uses it to produce the selected base keyboard's output for keystrokes the keyboard doesn't handle. A lifted selector, reusing `CarveHostSelector`'s options, drives it. Separately, the engine `simulate()` gains an optional `fallback` table through a non-vendored `DefaultOutputRules` subclass that overrides `forBaseKeys`, for engine tests and `facet-transform/verify`.
- **Rationale:** the engine simulator's `baseLayout: 'us'` is stored and never read. Its default output is US-only and covers base and Shift only. The iframe is what authors actually type into.
- **Open, verify in implementation:** how KeymanWeb 18 handles unmatched AltGr combos (recollection says no output), and the cleanest hook in `osk-frame.js` (a keystroke pre-handler, or a `DefaultOutputRules` override inside the frame).
- **Alternatives considered:** engine simulator only. It isn't the pane authors use.

## D11. Non-Roman base keyboards

- **Decision:** add `basic_kbda1` (Arabic 101), `basic_kbda2` (Arabic 102) and `basic_kbda3` (Arabic 102 AZERTY) to the codegen in v1, family `arabic`. Other scripts are added later with no spec change.
- **Rationale:** Ajami is the product lead's motivating non-Roman case, and `basic_kbda3` exercises a non-Roman layout on AZERTY hardware. Host ids are additive under the existing versioning policy.
- **Alternatives considered:** Roman only in v1. That leaves FR-001g's primer case untested.

## D12. Spec 040 facets (US5)

- **Decision:** parameterise `utilities/facet-index/base-layout.ts` `leakedChars(ir, families = [DEFAULT_BASELAYOUT])` and `resolveBaseLayouts`. When a family list is passed, they read the contracts host-layouts data. The default argument keeps facet-index output byte-identical, so no facet version bump is needed until a caller passes a list.
- **Rationale:** facet output is corpus-pinned, and changing it silently would break the determinism checks.
- **Alternatives considered:** replace `base-layouts.json` outright. That forces a facet re-index in the same change.

## D13. Layout distance and memory aids (FR-001f)

- **Decision:**
  - A pure `layoutDistance(a, b)` in the contracts host-layouts module counts cells that differ between two base keyboards, by category: letters, digits, punctuation, number-row symbols, AltGr.
  - A `MNEMONIC_ASSOCIATIONS` table (`^` circumflex, `'` acute, `` ` `` grave, `~` tilde, `"` diaeresis, `,` cedilla) drives broken-mnemonic flags. A flag is raised when your keyboard's rule on a combo produces, or arms a deadkey for, the associated mark, and another likely base keyboard has a different character on that key.
- **Rationale:** both are pure functions of the tables and your keyboard, cheap to compute, and easy to test.
- **Alternatives considered:** a single distance score. The product lead's examples (US/UK differ only on the number row) need the per-category breakdown.

## D14. Physical keyboards on touch devices (FR-016)

- **Decision:** the picture is offered wherever desktop rules run over a physical keyboard. For Android and iOS hardware keyboards, the Windows data stands in for the device's hardware layout, and the UI says so. A verification task checks Keyman for Android's hardware-key path (`KMKeyboard` key handling) before any UI promises this behaviour. If it does not fall through, FR-016's touch-device clause is withdrawn in a spec amendment.
- **Rationale:** research could not verify this (help pages returned 404). It is recollection only.

## D15. Spec 076 amendment

- **Decision:** edit spec 076 FR-005 to drop the RALT-only-if-used gating and point to spec 084 FR-008. Add a pointer from 076 FR-023 disposition defaulting to spec 084 FR-011. Both are prose edits in `specs/076-rule-behaviours/spec.md`.

## D16. Dependency on PR #1854

- **Decision:** implementation starts after PR #1854 merges. The branch then takes `origin/main` by merge; it is never rebased. Planning artifacts may land before that.
- **Rationale:** the host tables, carve dispositions, `swallowSet` and `ReviewRemovedKeys` all come from #1854.

## D17. Terminology

- **Decision:** the spec 084 Terminology table is the working glossary until #1810 lands. Code identifiers `host*`, `baseIr` and `baseVfs` are kept. New code uses "base keyboard" in comments and user-facing strings, and new identifiers use `baseKeyboard*` only where no `host*` counterpart exists. A rename sweep belongs to #1810, not this feature.
