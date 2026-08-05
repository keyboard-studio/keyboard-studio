# Data Model: Identity in the package

Entities this feature introduces or reshapes. Field names are the ones the implementation must
use — where an identifier already exists in the codebase it is reused verbatim rather than
renamed.

---

## 1. `PackageDescriptorIdentity` *(new — `packages/engine/src/package-descriptor/`)*

The identity the descriptor writer consumes. This is the writer's whole input surface for the
fields this feature adds; everything else it needs (`<Files>`, `<Version>`) it already derives.

| Field | Type | Required | Notes |
|---|---|---|---|
| `displayName` | `string` | yes | Drives `<Info><Name>`, `<Info><Description>`, `<Keyboards><Keyboard><Name>` (FR-003). |
| `languageTag` | `string` | no | The composed BCP47 tag, taken whole from `IdentityLiteResult.bcp47`. Never re-composed or re-parsed (FR-001). |
| `languageName` | `string` | no | Display text for the `<Language>` element — the English name from `IdentityLiteResult.english` (FR-002, spec Assumptions). |

**Validation / fallbacks.**
- `languageTag` absent or empty → declare the same well-formed placeholder the current writer
  already emits when a base has no language: a single `<Language ID="und">und</Language>`. It must
  **never** fall back to the base keyboard's tags (FR-007, SC-002). This is the blank-code edge
  case (US1-3) and introduces no new placeholder convention.
- `languageName` absent or empty → the tag stands in as display text, which is what the current
  writer already does for every tag (FR-002, spec Edge Cases).
- `displayName` is always present in practice (both tracks set it at instantiation); the writer
  still falls back to the keyboard id rather than emitting an empty `<Name>`, since an empty
  `<Info><Name>` fails `kmc`.

**Not in this entity.** Keyboard version and the `<Files>` list. Both are already derived by the
builder from the keyboard id, the emitted `.kmn`, and the caller's version argument, and FR-008
requires the version to keep agreeing with the source — so it stays where it is rather than
becoming an identity field that could be set independently.

---

## 2. `IdentityOverlay` *(existing — `packages/studio/src/lib/projectWorkingCopyVfs.ts`)*

The projection's identity input. Gains one field.

| Field | Type | Status | Notes |
|---|---|---|---|
| `displayName` | `string?` | existing | |
| `copyright` | `string?` | existing | `.kmn` only. |
| `version` | `string?` | existing | `.kmn` only; the adapt path's bumped version. |
| `bcp47` | `string?` | existing | Today consumed only by `resetIdentity` during the id-rename pass. **Now also** the descriptor's `languageTag`. |
| `languageName` | `string?` | **new** | The descriptor's `<Language>` display text. Not written to the `.kmn` — the codec does not serialize a language name, and teaching it to is out of scope. |

---

## 3. `IdentityPatch` *(existing — `packages/studio/src/stores/workingCopyStore.ts`)*

The store's post-instantiation identity overlay. Gains the same field, and gains a populated
`bcp47` on the copy track.

| Field | Type | Status | Notes |
|---|---|---|---|
| `bcp47` | `string?` | existing, **newly populated on Track 1** | Set by `instantiateFromExisting` today (Track 2, from `keyboard.languages[0]`). Track 1 must now set it from `IdentityLiteResult.bcp47` (research D-03). |
| `displayName` | `string?` | existing | |
| `keyboardId` | `string?` | existing | Passed separately as `targetKeyboardId`; excluded from the overlay by design. |
| `languageName` | `string?` | **new** | From `IdentityLiteResult.english`. |

**State transition.** Track 1: `identity` is `null` immediately after `instantiateFromBase` and is
populated when the identity step's answers are committed. Track 2: `identity` is populated at
`instantiateFromExisting` from the imported keyboard's metadata, then overwritten by the author's
own answers if they revise them (US4). Neither path introduces a new lifecycle — this is the
existing `setIdentity` overlay carrying two more fields.

---

## 4. `ImpactUnavailableReason` *(existing — `packages/contracts/src/decisionRecord.ts`)*

```
"lock-gate-dependency" | "no-rederivable-write-path" | "no-working-copy-yet"
```

`"no-working-copy-yet"` is **new** (FR-012): the decision has a write path, but no working copy
exists to project, so the effect cannot be resolved *yet*. Distinct from `"none"` ("changed
nothing") and from both existing reasons. Additive union member — mirrored in
`packages/contracts/src/schemas.ts`'s `z.enum` in the same commit (CLAUDE.md contract chain;
compile-time drift guards enforce it).

`DecisionImpact` itself is **unchanged in shape**. The per-file `files: DecisionFileChange[]` that
055 introduced is what carries the descriptor's diff — no widening is needed, which is the whole
point of the spec's Problem statement.

---

## 5. `CounterfactualProjection` *(new — derivation only, `packages/studio/src/decisions/`)*

A pair of projections of the current working copy, differing in exactly one identity overlay field,
compared to attribute that field's effect.

| Aspect | Value |
|---|---|
| Inputs | the entry, its recorded value, the alternative value, and the overlay field the entry's `outputs` declaration names |
| Produces | a `DecisionImpact` — `"captured"` with per-file changes, or `"none"` |
| Lifetime | computed on expand, returned, discarded |
| Persistence | **none** |

**Never stored.** A stored counterfactual would be a second account of the artifact that could
disagree with the first (spec Key Entities). It is also not a second working copy: both projections
clone the VFS exactly as `projectWorkingCopyForOutput` already does, and the store is never mutated
(Constitution Article III).

**Volatile content** is normalized identically on both sides via the shared helpers extracted in
research D-10 (FR-013).

---

## 6. `OutputWrite` / `QuestionModule.outputs` *(new — `packages/studio/src/survey/types.ts`)*

A question's declaration that its answer reaches an output artifact. This is the declaration
FR-016 makes checkable, and the lookup the counterfactual uses to know which overlay field to vary.

```
type OutputTargetId = "package-descriptor";
type IdentityOverlayField = "displayName" | "bcp47" | "languageName";

interface OutputWrite {
  target: OutputTargetId;
  field: IdentityOverlayField;
}
```

| Field | Type | Notes |
|---|---|---|
| `outputs` | `readonly OutputWrite[]?` | On `QuestionModule`, beside the existing `inputs` / `writes`. |

**Relationship to `writes`.** They are different address spaces and neither replaces the other.
`writes` is `IRPath[]` over `KeyboardIR` and governs `mutate()` containment; `outputs` names emitted
*artifacts* the answer reaches. An identity question declaring `writes: []` is correct — it writes
no IR — and that was never the defect. The defect (E-1) was that `writes: []` was the *only*
declaration available, so "reaches an output file" had nowhere to be stated.

**Initial declarations** (spec §Governing documents pins these five ids; copy them exactly):

| Question id | `outputs` |
|---|---|
| `il_language_english` | `[{ target: "package-descriptor", field: "languageName" }]` |
| `il_language_code` | `[{ target: "package-descriptor", field: "bcp47" }]` |
| `il_language_region` | `[{ target: "package-descriptor", field: "bcp47" }]` |
| `il_target_script` | `[{ target: "package-descriptor", field: "bcp47" }]` |
| `il_language_autonym` | `[]` — collected for other purposes; not the descriptor's display text (spec Assumptions) |

Three questions declaring the same `bcp47` field is not redundancy: it is the joint attribution
FR-014 requires. They contribute to one composed tag, so a change to that tag is attributed to all
of them via 055 FR-019's `sharedWith`, and never claimed by one alone.
