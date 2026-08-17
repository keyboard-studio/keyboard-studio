# Research: why context tolerance is solved at source level, not in the engine

Companion to [spec.md](spec.md). This document answers the second half of the
original question — *how would we fix this globally in the Keyman Engine without
upsetting the keyboard developer's preferred composition?* — and records why the
feature is nevertheless specified at source level.

The campaign-facing version of this material, written to be read by people
deciding whether to push for the engine change, is
[docs/design-notes/keyman-normalization-campaign.md](../../docs/design-notes/keyman-normalization-campaign.md).
This document is the evidence; that one is the argument.

**Evidence base.** Keyman `19.0.241` (commit `9cfb74eb`, 2026-06-02), the
`help.keyman.com` source checkout (June 2026), the CLDR 46 LDML keyboard schema
vendored in the Keyman tree, and the live `keymanapp/keyman` issue tracker.
Anything not verified first-hand is flagged at the end.

## 1. `.kmn` has no normalization directive, and the documented workaround is ours

Verified three independent ways.

**The documentation says so outright.** `developer/language/guide/unicode.md`,
published at <https://help.keyman.com/developer/language/guide/unicode>, section
"Normalisation":

> Keyman does not do any normalisation. The codes specified in a keyboard are the
> exact codes that are used. However, some applications internally normalise the
> text store as users type. This can lead to rules unexpectedly failing to match.
> One appropriate solution is to include both normal Unicode normalisation forms
> (NFC and NFD) in the context of rules. Make sure that your output always
> targets a single normalisation form.

That final sentence is the uniformity invariant, and the sentence before it is
context tolerance. Upstream's documented advice **is** the invariant split
[spec.md](spec.md) names — offered as manual labour. This feature automates the
advice Keyman already gives.

**No such store exists.** The reference index carries 50 statement and store
pages; there is no `normalize` page, and the header-store list runs from `&Name`
straight to `&OldCharPosMatching`.

**No slot in the binary format.** `common/include/kmx_file.h` ends the system
store enumeration at `TSS_DISPLAYMAP 44`, with `TSS__MAX 44`. A new store needs a
new `TSS_` constant and a format-version bump.

## 2. Keyman Core already implements this — for LDML keyboards only

This is the finding that reframes the question. The machinery is built, shipped
and marker-safe. It is gated behind a single virtual, and the KMX processor
answers `false`.

| Location | What it establishes |
|---|---|
| `core/src/processor.hpp:126` | `virtual bool supports_normalization() const = 0;` — the gate |
| `core/src/kmx/kmx_processor.hpp:84-86` | KMX returns **`false`** |
| `core/src/ldml/ldml_processor.hpp:80-82` | LDML returns `!normalization_disabled` |
| `core/src/km_core_state_context_set_if_needed.cpp` | on input: `if (should_normalize(state))` → `normalize_nfd(...)`; otherwise the cached context is the app's text verbatim |
| `core/src/state.cpp:122-126`, `core/src/actions_normalize.cpp` | on output: actions converted NFD → NFC across the context\|output boundary, within a normalization-safe segment |

Core maintains two contexts, documented in `developer/core/19.0/keyboards.md`:

- `KM_CORE_DEBUG_CONTEXT_APP` — an exact copy of what the application supplied,
  described as **"NFU — normalization form unknown, and may be mixed
  normalization"**.
- `KM_CORE_DEBUG_CONTEXT_CACHED` — the internal context, which *may be
  normalized* and may contain markers.

For a `.kmn`/KMX keyboard the cached context is byte-identical to the app's NFU
text. Every rule in every Keyman keyboard ever written matches against whatever
the host happened to hand over. That is the defect, stated in upstream's own
terms.

Context-caching semantics that constrain any design here: comparison ignores
cached markers; a *shorter* cached context counts as identical, a *longer* one
forces a reset that **clears all deadkeys and markers**.

`web/src/engine/keyboard/**` contains no normalization code either, so
KeymanWeb's KMX rule processor — and therefore the mobile engines that embed it
— behaves the same way.

## 3. The LDML keyboard spec mandates what `.kmn` lacks

TR35 §keyboards requires NFD for matching and NFC on output: the source is
converted to NFD for processing; transform matching is performed in NFD
regardless of the form in the source file or the edit buffer; text is
re-normalized between transform groups; output is normalized to a specified form,
typically NFC. The single opt-out is `<settings normalization="disabled"/>`,
which the spec accompanies with a caution that the author then owns NFC, NFD and
mixed forms themselves.

Corroborated locally: `resources/standards-data/ldml-keyboards/46/ldml-keyboard3.schema.json:437-441`
declares `settings.normalization` as an enum whose **only legal value is
`disabled`** — normalization is the mandated default and `disabled` is the sole
escape hatch. Keyman's own LDML compiler emits a hint when an author takes it
(`HINT_NormalizationDisabled`, `developer/src/kmc-ldml/src/compiler/ldml-compiler-messages.ts:16`).

So Keyman already ships this behaviour, already has the author-facing opt-out
shape, and already treats disabling it as worth warning about. The `.kmn` gap is
not a capability gap; it is a coverage gap.

## 4. Upstream has tracked it since 2020, with our exact scenario

Keyman uses a dedicated `m:normalization` label. Open issues:

| Issue | Title | Opened |
|---|---|---|
| **3306** | `feat(core): Normalisation in Keyman Core` | 2020-07-02, milestone *Future* |
| **5809** | `feat: support normalization in keyboards` | 2021-10-07 |
| 9466 | `feat(web): identify browser versions: for regex and normalization support` | 2023-08-15 |
| 9598 | `chore(web): global input normalization in lexical models` | 2023-09-20 |

**#3306 is a FieldWorks bug report.** Its body describes Galaxie Greek Mnemonic
with FLEx: the keyboard emits precomposed U+1F01, FLEx decomposes it internally,
so on Windows Keyman sees a decomposed context its rules do not match — and on
Linux, where Keyman cannot read the text store, it emits a backspace for a
character that is no longer there. The direction recorded on the issue:

> A far better solution (which is in the roadmap, at least in theory) is adding
> support for composition and decomposition internally to Keyman Engine… Keyman
> would always emit a consistent normalisation form, but would transparently
> handle either form in the context for keyboard rules. **The keyboard compiler
> would be updated to ensure that keyboards are internally consistent with NFC or
> NFD (probably configurable on the part of the keyboard author, for a number of
> legacy reasons).**

That parenthetical is upstream's own sketch of an author-declared normalization
store, and it matches the write-back policy in [spec.md](spec.md) FR-007.

**#5809** states the requirement and the reason manual work does not scale:

> It is possible to define multiple rules that handle NFC and NFD context, but
> tedious. It is more difficult to handle partially normalized context by
> defining multiple rules — somewhat impractical.

Completed work that built the LDML machinery, available as implementation
precedent: epic **#9999** `feat(core): support normalization in Core`, plus
#9468 (normalization per spec for transforms), #10468 (LDML processor reports
normalization support to Core), #10421 (app context tracking when normalization
is *not* used), #10369 and #10320 (marker normalization), #10516 (reorders must
be normalization-safe), #10554, #10317. Recent maintenance — #15505, #15491 —
shows the code is live, not abandoned.

## 5. Why the engine fix is not simply "flip the `false`"

Setting `kmx_processor::supports_normalization()` to `true` would NFD-normalize
the cached context for every KMX keyboard. That breaks every NFC-authored
keyboard immediately, because **KMX rules are authored against literal
codepoints**: a rule matching U+1ECD stops matching a context that Core has just
decomposed to `o` + U+0323. To match an NFD cached context, an NFC-authored
keyboard's *contexts* must also be projected into NFD.

That projection is exactly the source-level transform [spec.md](spec.md)
specifies.

**Which makes the ordering an argument rather than a coincidence.** The
source-level work is not a stopgap that the engine change would render
pointless; it is the transform the engine change needs in order to be safe, and
upstream's own note on #3306 says the compiler would have to do it. Whether or
not the campaign succeeds, the same expansion is required.

Three further blockers, which are the honest reason this has sat since 2020:

1. **`context(N)` and `index(store,N)` offsets are defined over the context
   buffer.** Renormalizing the buffer silently changes what offset `N` denotes —
   a decomposed character occupies two positions where a composed one occupied
   one. This is a correctness hazard across the entire installed base of
   keyboards, and it is why any such feature must be opt-in and default to
   today's behaviour.
2. **Deadkeys live in the context buffer and are not Unicode characters.** They
   must behave as combining-class-zero blockers that nothing reorders across.
   Core already solves this for LDML markers, so the KMX path would inherit a
   solved problem — but it is not free.
3. **Hosts where Keyman cannot read the text store cannot be fixed by any of
   this.** The Linux case in #3306 is a genuine floor on what the engine change
   can deliver, and any campaign that does not say so will lose credibility when
   someone points it out.

## 6. Why we ship at source level regardless

- **It works on every Keyman version already installed.** A keyboard with
  expanded contexts is an ordinary keyboard. No engine version gate, no
  compiler version gate, nothing for a user to update.
- **It is the documented remedy.** §1 above is Keyman telling authors to do
  precisely this. We are automating advice, not inventing a mechanism.
- **It is proven in the corpus.** `sil_cameroon_qwerty` ships the technique today,
  hand-maintained; `sil_yoruba8` contains hand-written instances of the exact rule
  shape the transform generates.
- **It is a prerequisite for the engine fix**, per §5.
- **The engine fix is not ours to ship.** It is Keyman Core, in C++, in another
  organisation's repository, gated on a binary format bump.

## Caveats and what was not verified

- **TR35 wording in §3 is partly paraphrase.** The specification was fetched twice
  through a summarizing tool; the two passes agreed on substance and the quoted
  sentences, and the mandate is independently corroborated by the vendored CLDR 46
  schema. The **section number was never pinned**, and the surrounding prose
  should be re-read first-hand before any of it is quoted in a campaign document.
  Keyman pins CLDR 46; check whether a later TR35 revision changed anything.
- `ldml_processor`'s `normalization_disabled` field was confirmed to exist and to
  gate `supports_normalization()`, but the exact path by which the runtime reads
  it from the compiled keyboard's settings was not traced.
- The Android and iOS engines were not examined separately; the KeymanWeb finding
  is taken to cover their rule processors, since they embed it.
- The Keyman checkout is recent but is not necessarily today's `master`. Issue
  data was queried live and is current as of this document's date.

---

## Phase 0 — Design research (this plan)

Everything above is the campaign-facing analysis of the engine-side
alternative and is **not** what this plan implements. This section is the
[plan.md](plan.md) Phase 0 record for the source-level feature that *is*
being built — kept in this file rather than a second `research.md` because
this filename is already the one [spec.md](spec.md) links to for "research."

### Decision: reuse `nfcPostureOfInventory` as-is; do not consolidate its siblings

**Decision**: The context-variant generator calls the already-built
`nfcPostureOfInventory` / `aggregateInventoryPosture`
(`packages/engine/src/marks/nfc-posture-of-inventory.ts`, shipped by spec 071)
directly for its per-pair table. It does not refactor `mark-guards.ts`'s
`buildUnwrap()` or the blocking-rule generator to route through the same
function, even though both currently reimplement equivalent
`.normalize("NFD"/"NFC")` logic independently.

**Rationale**: The mark-composition model's "fifth consumer" framing already
treats the function as shared infrastructure other consumers *should* use;
spec 062 only needs to be a well-behaved fifth caller, not the change that
finally consolidates the other four. Touching `buildUnwrap()`'s independent
normalize logic is a refactor with its own blast radius (spec 071 is shipped
and tested) and is out of this feature's stated scope.

**Alternatives considered**: Consolidating all consumers onto one call site
was considered and rejected as scope creep — flagged here so a future cleanup
pass has the pointer, not silently dropped.

**Amendment (implementation time, km-lead review cycle)**: this decision's
premise did not survive contact with the actual generator. `nfcPostureOfInventory`
takes a `ConfirmedAlphabet`, a survey-confirmed, studio-side structure — neither
`proposeContextVariants` nor `addBackspaceUnwrap` (spec 062's actual call sites,
which must run over an ARBITRARY `KeyboardIR`, including an imported keyboard
with no confirmed alphabet at all — `sil_yoruba8` itself) has one available.
Both instead compute the same NFD/NFC relationship directly via the very
`String.prototype.normalize` mechanism the NEXT decision below already
endorses for a different reason. Spec 062 is therefore NOT the "fifth
consumer" this decision predicted — see `nfc-posture-of-inventory.ts`'s own
module doc and `context-variants.ts`'s module doc for the as-shipped account,
and `mark-guards.ts`'s `buildUnwrap()` vs. `context-variants.ts`'s
`addBackspaceUnwrap()` for the resulting (now three-way, not two-way)
duplication this decision explicitly declined to consolidate. That duplication
is tracked as a follow-up in tasks.md's Notes section, not silently dropped.

### Decision: canonical ordering and decomposability via `String.prototype.normalize`, no CCC table

**Decision**: FR-005 (canonical mark ordering) and FR-006 (decomposability
decided by decomposition, not Unicode property, for PUA correctness) are both
satisfied by the JS runtime's built-in `normalize("NFD")` / `normalize("NFC")`
— already the only mechanism used anywhere in this codebase for
decomposition (`confirmedAlphabet.ts`, `character-discovery/decompose.ts`,
`mark-guards.ts`). No combining-class data table is introduced.

**Rationale**: `normalize()` resolves canonical ordering and decomposability
internally per the Unicode canonical decomposition algorithm, independent of
general-category or script properties, which is exactly what makes it
PUA-safe (a PUA mark has no `\p{M}` property but still decomposes correctly
if it has a canonical decomposition — and if it has none, `normalize()` is a
no-op, which is the correct "not decomposable" answer). This matches the
codebase's known, previously-flagged gap (no CCC table) and closes it the
same way existing code already does, rather than opening a new gap.

**Alternatives considered**: Hand-rolling a combining-class table was
rejected — it's the gap this repo has flagged twice already and `normalize()`
already does the job without it.

### Decision: simulator context seeding — additive third parameter

**Decision**: `simulate(compiled: CompileResult, keys: SimKeyInput[])` in
`packages/engine/src/simulator/index.ts` gains an optional third parameter:

```ts
export interface SimulatorContextSeed {
  text?: string;
  caretPos?: number;
  pendingDeadkeys?: DeadkeySnapshot[]; // reuses contracts/simulation.ts DeadkeySnapshot
}

export function simulate(
  compiled: CompileResult,
  keys: SimKeyInput[],
  initialContext?: SimulatorContextSeed,
): SimulationResult
```

Implementation is localized to `index.ts:182-185`, where context is
constructed today via `new SyntheticTextStore()` (empty) and
`processor.resetContext(textStore)`. The vendored `SyntheticTextStore`
constructor already accepts `(text?, selStart?, selEnd?)`, and
`TextStore.insertDeadkeyBeforeCaret(id)` already exists — but
`resetContext()` unconditionally clears deadkeys, so seeded deadkeys must be
inserted *after* `resetContext()`, positioning the caret at each seed
position via `setSelection` before each insert, then restoring the caret to
`initialContext?.caretPos ?? text.length`.

**Rationale**: This is the smallest change that unblocks every Story 1/2/4
acceptance test (per the spec's own Dependencies note that this must be the
first task). Reusing the existing `DeadkeySnapshot` contract type instead of
inventing a new deadkey shape keeps the simulator's public surface
consistent with what callers already produce elsewhere. `runPatternTests`
(the existing `Pattern.tests` runner) passes `undefined` and is byte-for-byte
unaffected — satisfying FR-004/SC-002 by construction, not by a follow-up
regression check.

**Alternatives considered**: A separate `simulateFromSeed()` entry point was
considered and rejected — it would duplicate the whole function body for one
optional parameter, and every existing caller would need to choose between
two near-identical APIs.

### Decision: diagnostic computed in-engine, threaded into Layer C as precomputed data

See the Constitution Check Complexity Tracking table in [plan.md](plan.md)
for the full rationale. Summary: `packages/engine/src/validator/context-tolerance.ts`
runs the both-forms simulator comparison and produces a contracts-only
`ToleranceReport`; `keyboard-lint`'s new check receives that report as a new
precomputed input (alongside the existing `inventory`/`touchLayout` inputs
in `lintContext.ts`) and only classifies it into `LintFinding[]`. `keyboard-lint`
never imports `packages/engine`, so the `lint-not-to-engine` dependency-cruiser
rule is untouched.

### Decision: store-pairing safety reuses `analyzeStores`, does not reimplement it

**Decision**: Before adding decomposed members to a store, the generator
calls `analyzeStores(ir)` (`packages/engine/src/pattern-apply/applyStoreSlotRemovals.ts`)
and checks the target store's membership in `StoreAnalysis.pairSets` /
`unresolvedIndexOutputNames`. A store paired via `index()` with a *different*
store, or one with an unresolved pairing, is treated the same way that module
already treats it for slot removal: conservative, fail-closed, reported as
not-analysed rather than silently mutated.

**Rationale**: This is exactly the detection the spec's "Stores used with
paired `index()`" edge case calls for, and the mechanism already exists,
tested, for a structurally identical hazard (mutating one half of a paired
store). Reimplementing the pairing graph a second time would be pure
duplication of tested logic.

**Alternatives considered**: A fresh, narrower pairing check scoped only to
decomposed-member-insertion was considered and rejected — the existing
`pairSets`/`unresolvedIndexOutputNames` shape already generalizes correctly
to "would this addition break the pairing," and a second implementation is
one more place the two could silently drift apart.

### Decision: IR mutation follows the `mark-guards.ts` idempotent-generator pattern

**Decision**: The context-variant generator (`pattern-apply/context-variants.ts`)
mirrors `mark-guards.ts`'s `applyMarkGuards`: pure IR→IR, rebuilds groups via
spread rather than mutating shared rule objects, names every generated
rule/store with a recognizable prefix (e.g. `generated_tolerance_*`) so a
re-run recognizes and replaces rather than duplicates (FR-011 idempotency),
and uses the existing `ir-insert.ts` helpers (`entryGroupOf`,
`insertBeforeTerminalRules`) to place generated rules before any terminal
`match`/`nomatch` rule in a group **and** before the existing fallback rule a
variant is meant to preempt (e.g. `sil_yoruba8`'s `+ ']' > '´'`) — ordering is
what makes Acceptance Scenario 3 of Story 1 hold (the accent rule fires, the
fallback does not).

**Rationale**: This is the only precedent in the codebase for "generate new
rules/store-members into an IR, idempotently, without a hand-authored
byte-identical round-trip test to lean on" — `roundtrip.test.ts` only covers
parse→emit fidelity with no mutation in between, so the mutate-then-emit test
shape must follow the `pattern-apply` suites' convention (build IR in memory,
run the mutator, assert on the result, then separately emit+reparse to
confirm the compiled `.kmn` is well-formed), not `roundtrip.test.ts` itself.

**Alternatives considered**: Generating variants as raw `.kmn` text spliced
into the emitted output was rejected outright — Article II of the
constitution forbids mutating anything but the typed IR.

### Decision: propose/preview/confirm follows the facet-transform seam; write-back policy lives on `DiscoveryAxisVector`

**Decision**: Applying generated context variants, and disclosing FR-008's
consequence when the write-back policy would rewrite untyped characters,
reuses the existing `packages/engine/src/facet-transform` propose/verify
pipeline and the studio's `useFacetTransform.ts` hook / `FacetTransformPanel.tsx`
UI — specifically its `output-diff` preview branch, which already renders an
explicit "output will change — review before confirming" warning. The
write-back policy itself (FR-007: echo vs. own-form, default echo) is stored
as a new optional field on `DiscoveryAxisVector`
(`packages/contracts/src/axes.ts`), set via the existing `setIrAxes`/
`setAxisFills` actions — not a new settings bag.

**Rationale**: `FacetTransformPanel`'s per-site `UserDisposition` (partial
accept) shape matches this feature's need to report rules as tolerant / made
tolerant / not-analysed without an all-or-nothing commit, and its `output-diff`
branch already implements the exact disclosure FR-008 requires, so this is
reuse rather than new UI. `DiscoveryAxisVector` is the existing mechanism for
a per-keyboard binary author choice that steers generation, and because
`WorkingCopyData` is derived generically from `WorkingCopyState`,
`draftPersistence.ts`'s snapshot/restore needs no new wiring for the new
field.

**Alternatives considered**: The lighter single-shot `ProposalBanner` pattern
(`SiblingAccentProposalBanner.tsx`) was considered for the context-variant
proposal itself, since it's simpler than a full facet transform. Rejected for
the *initial* proposal step (FR-010 requires per-rule not-analysed reporting,
which needs the heavier per-site disposition shape) but left as the candidate
shape if Phase 1 design finds the write-back-policy toggle alone (independent
of the variant proposal) is simple enough to warrant its own lighter banner
— a call deferred to [data-model.md](data-model.md) / task breakdown, not
decided here.

