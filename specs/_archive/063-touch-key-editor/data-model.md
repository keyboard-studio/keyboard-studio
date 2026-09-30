# Data model: key-level touch layout editing

Companion to [plan.md](plan.md). Entities this feature introduces or reshapes, with the fields, relationships, validation rules, and state transitions the requirements imply. Illustrative TypeScript — the normative shapes live in [contracts/](contracts/); names are settled at implementation.

Read alongside [research.md](research.md) **R10**, which corrects several assumptions the spec and the contract documents make about existing types.

---

## 1. Reshaped: `TouchKeyIR` (locked type, §18 sign-off recorded 2026-08-03)

Two additive optional fields join the existing interface in [keyboard-ir.ts](../../packages/contracts/src/keyboard-ir.ts). Both must land in **one** commit across five sites: the interface, the zod mirror in [schemas.ts](../../packages/contracts/src/schemas.ts), the drift guard beside `_TouchKeyIRGuard`, `convertKey` in [parseTouchLayout.ts](../../packages/contracts/src/parseTouchLayout.ts), and the emitter in [parse-touch.ts](../../packages/engine/src/codec/parse-touch.ts).

| Field | Type | Semantics | Absent means |
|---|---|---|---|
| `layer` | `string?` | Per-key **modifier override** for the emitted key event — the modifier state the rule is evaluated under. Distinct from `nextlayer`, which switches the *displayed* layer. 11,593 corpus keys carry it. | No override; the containing layer's combo applies. |
| `default` | `boolean?` | On a **sub-key** (longpress `sk` entry): this entry is preselected. The wire writer strips only an explicit `false`, so a `true` is a real intentional value. | Not preselected. |

**Two consequences beyond round-trip.** `layer` is what makes two keys sharing an id within one layer distinguishable, so it is the precondition for both the duplicate-id check (§5.3 of the join contract) and stable addressing. And when `key.layer` is present it **supersedes** the containing layer in any derived "Sends:" display (FR-030) — the field exists precisely for the keys where the two differ.

**Also corrected in the same change (not a schema change):** `TouchKeyIR.sp`'s doc comment currently reads `8 spacer`, which is wrong in the same direction as `SPACER_SP_VALUES`. Upstream is `deadkey=8, blank=9, spacer=10`.

---

## 2. New: the touch key ↔ rule join

Normative shapes in [contracts/touch-key-rule-join.md](contracts/touch-key-rule-join.md) §2. Lives in `packages/contracts` because Layer C lint cannot import engine.

```
TouchKeyRuleBinding        one .kmn rule keyed on one touch key id
  ruleNodeId, groupName, usingKeys
  keyIdAsWritten           case preserved — feeds the case-mismatch hint
  modifiers[]              raw uppercased/deduped/sorted; NOT canonical combos
  role                     produces | guard | suppresses | transitions | opaque
  produced[]               NFC, one JS char per entry; non-empty only when role = produces
  producedText?            leading char-run, verbatim; absent when store-driven
  contextGuarded           true when pre-context extends beyond the struck key
  storeRefs?

TouchKeyRuleIndex          bindings grouped by normalized (upper-cased) id
  byId                     Map<NormalizedTouchKeyId, TouchKeyRuleBinding[]>
  spellings                Map<NormalizedTouchKeyId, string[]>   as-written forms
  producingIds             Set<NormalizedTouchKeyId>
  opaqueFragmentCount      ir.raw.length — consumers degrade when > 0
```

**Relationships.** A binding points at exactly one rule and one struck key id; an index groups every binding by normalized id. The index is derived purely from a `KeyboardIR` and holds **no** layout reference — layout is joined at the consumer (coverage, reachability, the checks), which is what lets the same index serve all of them.

**Validation / classification rules.** Role is decided in a fixed order (suppresses, guard, transitions, opaque, else produces) so Cameroon's guard-then-producing idiom classifies correctly without special-casing a store name. Ids normalize case-insensitively, matching `kmcmplib` interning, while every as-written spelling is retained so the case asymmetry against Developer's case-sensitive validator stays reportable. Production collection **must** reuse the exported `collectFromElements` walk so store expansion and NFC run-merging cannot drift from `buildProducedSet`.

---

## 3. New: the reachability view (sibling, not an option)

```
ReachableProducedSetResult
  reachable      Set<string>   produced by a rule whose struck key is reachable
  orphaned       Set<string>   produced ONLY by unreachable-key rules — the honest delta
  orphanBindings TouchKeyRuleBinding[]
```

`buildProducedSet`'s existing default semantics are **frozen**; a regression test pins that it still counts an orphan `T_` rule. Reachability is by id prefix: `K_` always reachable (a physical key exists regardless of the layout), `T_` / `U_` reachable only when carried by a key on a layer the `default` BFS reaches, and **everything** reachable when the IR has no touch layout — in which case the result equals `buildProducedSet` exactly. Two documented limits: no group-reachability check via the `use()` chain, and no layer↔modifier cross-check.

**Adopters are normative** ([contracts/touch-key-rule-join.md](contracts/touch-key-rule-join.md) §4.4) and repeated in both module headers, because the whole risk here is a future contributor unifying the two views. The facet classifiers, `producedGlyphs`, and facet-transform verify keep the **plain** view; `docs/keyboard-facet-index.json` is regenerated and asserted byte-identical.

---

## 4. New: `TouchCoverageOptions` (additive third argument)

`computeTouchCoverage` is `(layout, inventory)` today at all four call sites — no options bag (R10.7). The join threads in as an optional third argument, so absent it behaviour is byte-identical:

```
TouchCoverageOptions
  ruleIndex?          TouchKeyRuleIndex   absent ⇒ today's semantics exactly
  stripDottedCircle?  boolean             default true; additive-only U+25CC strip
```

The strip only ever **adds** a credited form, and only when the remainder after removing every U+25CC is non-empty and consists solely of combining marks — so a bare `◌` keycap is never stripped to empty (U+25CC is a real inventory character on at least one corpus keyboard).

---

## 5. New: the key edit overlay

Normative in [contracts/key-edit-overlay.md](contracts/key-edit-overlay.md). The central new entity, and the unit of undo, persistence, and projection.

```
KeyEditOverlay = { ops: KeyEditOperation[] }     an ORDERED LOG, not a keyed snapshot

KeyEditOperation (discriminated union on `kind`)
  seq          number            monotonic commit order
  kind         "set" | "rename" | "add" | "remove" | "suppress" | "setSubKey" | "removeSubKey"
  address      string            the existing touchKeyAddress scheme
  scope?       "key" | "family"  family-wide application (FR-065)
  payload      per-kind fields (see the contract)
```

**Ordering is semantic, not cosmetic** (FR-033a): an operation's address resolves against the layout state produced by the operations *before* it, so rename-then-edit is coherent by construction and a keyed snapshot cannot express it.

### State transitions

```
proposed ──confirm──▶ committed (appended to ops, seq assigned, undo entry pushed)
committed ──undo──▶ removed from ops (chronological, shared with by-character work)
committed ──re-derive seed──▶ resolvable | ORPHANED (reported, never silently dropped)
```

The orphaned transition is the one with teeth. `touchKeyAddress`'s documented silent-miss behaviour is correct for the deletion overlay, where a stale address is harmless; for this overlay it is data loss, so a resolution failure must surface, name the affected keys and any characters whose placement is lost, and offer either discarding the orphaned edits or re-placing the characters through the FR-062 worklist.

### Relationships

- **to the layout** — applied as a raw-JSON pass over the derived layout at projection time (new step 1.7, after `applyTouchKeycapRemovalsToVfs`), which is what gives Case B byte-preservation for untouched keys on both cases.
- **to the `.kmn`** — a `set`/`rename`/`remove` may carry synthesized rules, which travel a **second** projection pass (parse → apply → re-emit). Per R10.2 the working IR never reaches the artifact, so this pass is required rather than inherited.
- **to provenance** — every committed operation promotes the key to `hand-set` through a new **address-matched** path, beside (never replacing) the existing id-matched `promoteKeyToHandSet`, whose all-platforms/all-layers semantics are intentional for the by-character flow.
- **to undo** — one entry per committed operation in the existing `UndoEntry` union, in the single chronological stack shared with by-character work.

---

## 6. New: touch key address parts (the missing inverse)

```
TouchKeyAddressParts
  platform  string
  layerId   string
  keyId     string
  sub?      { kind: "sk" | "multitap"; subId: string } | { kind: "flick"; direction: string }
```

The three builders exist; **no parser does** (R10.5). It belongs beside them so format and parser cannot drift. Note that `TouchLayoutIR.nodeIds` is minted for main keys and `sk` only — never multitap or flick — so an operation addressing those nodes must resolve through this parser and the shared resolver, not through `nodeIds`.

---

## 7. New: layer family decomposition

Normative in [contracts/layer-families.md](contracts/layer-families.md).

```
LayerDecomposition
  | { kind: "parsed";   plane: string | null;  tokens: ModifierToken[] }   null plane = base alphabetic
  | { kind: "freeform"; layerId: string }                                  its own plane, never a family member

LayerFamily
  plane    string | null
  members  string[]        every layer id sharing the plane
```

**Canonical, not round-trip** (R10.6): `comboToTouchLayerId` is not injective — both `ALT` and `LALT` render as the fragment `alt` — so the decomposition returns a canonical token set. That is sufficient, because family grouping only asks which ids share a plane.

**The freeform fallback is a silence guarantee, not a degradation** (FR-067): an unparseable layer id becomes its own plane and generates no parallelism finding. `gff_amharic`'s 53 Ethiopic-named layers must all fall to freeform, pinned by its own regression lock so a later grammar extension cannot quietly start emitting noise there.

**Parallelism is property-scoped** for frame and layer-switch keys: `sp`, `nextlayer`, `id`, and keycap `text` MAY vary across a family (that variation is correct design); **position and width MUST NOT**.

---

## 8. New: the key grid view model (pure projection)

```
KeyGridViewModel
  platform, layerId, direction: "ltr" | "rtl"
  rows: Array<{
    slackPct: number
    keys: Array<{
      address, id, keycap, sp, nextlayer
      padPct, widthPct                 from the 100-unit model: width ?? 100, pad ?? 15
      producedChars: string[]          via the rule join
      annotations                      longpress | multitap | flick counts
      provenance
      findings: TouchKeyFinding[]
    }>
  }>
```

Derived purely from layout + overlay + rule index; holds no state of its own. `padPct` / `widthPct` are what make geometry-based vertical navigation (FR-020c) computable — ↑/↓ lands on the key whose horizontal span contains the current key's centre, which index-clamping cannot do on rows of unequal key counts and widths.

---

## 9. Reshaped: studio store and persisted shape

| Where | Change |
|---|---|
| `workingCopyStore` state | `keyEditOverlay: KeyEditOverlay` (or `KeyEditOperation[]`), plus the touch step's mode-selector state beside the `galleryIntrosSeen` per-step UI precedent |
| `workingCopyStore` actions | `commitKeyEdit` / `undoKeyEdit` / `setTouchEditorMode`, following the verb-first convention; each new action name must join `WorkingCopyData`'s `Omit` list |
| Reset paths | Any new `Set`/`Map` re-created in **all four**: `INITIAL_STATE`, `reset`, `instantiateFromBase`, `instantiateFromExisting` |
| `UndoEntry` union | One new kind, with a branch in `undoDelete`, a restore-side filter, and clearing in `keepAll` |
| `WorkingCopySnapshot` | Both new fields, **optional with a tolerant fallback read** in `prepareWorkingCopySnapshot`. **`DRAFT_VERSION` stays 1** — see R10.3; a bump discards every in-progress draft |
| `useInventoryDiff` | A **third** array `producedButUnreachable`; `lettersToAdd` / `alreadyProduced` arithmetic untouched so author workload and the §18.6 denominator do not move. Three return sites, including the `baseIr === null` fallback |
| `useWorkingCopyTransform` | An optional live-layout override (R10.1), folded into the primitive memo key or the preview will not refresh |

---

## 10. New: diagnostics

```
TouchKeyFinding
  code       one of the eight FR-040 codes
  severity   "error" | "warning" | "hint"
  address    the key or rule it anchors to
  fields     structured data for studio-composed, localized copy — never English prose
  fixes      TouchKeyFix[]        at least one, per FR-041
```

**Structured only.** The engine returns fields and fix descriptors; all user-facing copy is composed and localized in the studio, following the existing method-label pattern. Findings are computed as synchronous pure joins from the already-parsed working IR and layout, composed into the **single** aggregated findings surface — no second store field, no second timer (Article IV / D3). Edit-time diagnostics and their Layer C siblings share one underlying implementation: that is what the join exists for.

A finding is the *reporting* path. Its counterpart is **rejection**: per FR-045 a mutation that would create an invalid state (a dead `T_` key, an in-layer id collision) is refused rather than committed-and-reported — except when `opaqueFragmentCount > 0`, where the hard block downgrades to warn-and-confirm because the join cannot prove a rule is not hiding inside opaque text.
