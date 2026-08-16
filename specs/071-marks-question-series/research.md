# Phase 0 Research: Marks Question Series (046)

Codebase findings and the decisions they settle. Inputs: [spec.md](spec.md), the
[mark-composition-model design note](../../docs/design-notes/mark-composition-model.md),
and a three-area codebase survey (survey framework, inventory/picker, mechanism
gallery + strategy + facet-transform + validator).

## R1 — Where the series lives: one new spine `EditorStep`, not Phase B FlowQuestions

- **Decision**: Host the series as a single new spine step `marks` in
  `packages/studio/src/steps/manifest.ts` (with the matching `advance.ts` policy and
  `expectedSpine` update), placed between `carve` and `mechanisms`. The step component
  (`MarksSeriesStep.tsx`, a `ComponentType<EditorStepProps>`) sequences stations S1–S5
  internally; S0 is a computed gate inside the step host that completes the step
  immediately (no render) when the marks store is empty.
- **Rationale**: S1 (per-mark attachment rows) and S2 (per-class mental model) interpolate
  the designer's own glyphs and per-inventory option lists — the static `FlowQuestion`
  shape cannot express them (design note implementation note 1; spec assumption
  "card-based stations"). The custom-step mechanism already exists (`EditorStep.component`,
  `CharactersStep`/`MechanismGallery` precedents), and editors are pure (`onComplete` only,
  side effects in the manifest reducer) which matches the series' commit-at-exit shape.
  The design note places the series "between Act 3b and Act 6"; in the current spine that
  seam is after `carve` (carve operates on the base's existing content, marks on the new
  alphabet — carve's output does not feed the series).
  **Amended 2026-07-22**: the step was reordered to sit between `characters` and `carve`
  (immediately after alphabet confirmation) — how the author thinks of the combined
  letters must be known before any key work begins. The original after-carve placement
  was arbitrary by this section's own rationale (carve's output does not feed the
  series), so the reorder is a pure manifest/oracle change.
- **Alternatives considered**: (a) Extending the Phase B sub-flow with more
  `pb_*` FlowQuestions — rejected: cannot express S1/S2 dynamic content, and would bury a
  multi-station series inside the characters step, breaking the "alphabet confirmed first,
  every station derived from it" ordering (FR-024). (b) One spine step per station —
  rejected: five spine entries for stations that are usually skipped bloats
  `expectedSpine` and the reducer; internal sequencing keeps skip logic local.

## R2 — Three stores as additive contract types; `confirmedInventory` kept and derived

- **Decision**: Add a new contracts module (`packages/contracts/src/confirmedAlphabet.ts`)
  with `ConfirmedAlphabet { bases; marks; attestedStacks; declaredRoles }` plus an
  `AttestedStack` (ordered one base + one-or-more marks, NFD-decomposed internally,
  order-preserving) — surfaced as **additive optional** fields on `SurveyPhaseResult` and
  `SurveySession` with zod mirrors in `schemas.ts` in the same change. The existing flat
  `confirmedInventory: string[]` stays and is derived from the three stores (NFC graphemes,
  first-appearance order) so every current consumer (`useInventoryDiff`,
  `MechanismGallery`, merge logic) keeps working unchanged during the transition.
- **Rationale**: The inventory shape is a contracts-level type today
  (`surveyPhaseResult.ts`, `surveySession.ts`), and the documented convention for evolving
  it is additive optional fields + `makeX()` factories (`confirmedInventory` itself is
  marked "Additive"). Deriving the flat list preserves back-compat without a mixed source
  of truth: the three stores are canonical, the flat list is a projection.
- **Alternatives considered**: (a) Studio-local store split only (no contract change) —
  rejected: the worklist and posture computation are engine functions and need typed input;
  the session merge (`mergePhaseResults`) is contract-owned. (b) Replacing
  `confirmedInventory` — rejected: a locked-contract removal (major bump + joint session)
  for no gain.

## R3 — Picker decomposition and the PUA role prompt

- **Decision**: Build a `decompose(grapheme)` engine helper (NFD, order-preserving,
  combining-run split via the existing `/^[\p{Mn}\p{Mc}]$/u` test) used at pick-commit time
  in `CharacterMapPane`/`PhaseB`: picking a whole grapheme records base → `bases`,
  mark(s) → `marks`, sequence → `attestedStacks`, deduped, with a transient "just added"
  highlight built on the existing chip-indicator + `aria-live` announcer patterns. For PUA
  picks (existing `isPrivateUseCodePoint` test), an inline role prompt (letter vs mark)
  fires before commit; the answer lands as a `declaredRoles` entry that all classifiers
  read before falling back to Unicode properties.
- **Rationale**: `isDecomposableAccented` (contracts `charUtils.ts`) already proves the
  NFD approach but is limited to single-mark U+0300–U+036F pairs; the series needs
  multi-mark stacks and the full `\p{M}` range, so a general helper next to
  `characterMap.ts`'s existing classification logic is the right home. PUA guardrails and
  the `U+XXXX` escape hatch already pass PUA through the picker — only the role question is
  net-new (FR-004; the design note calls it "the one unavoidable role question").
- **Alternatives considered**: Prompting a clarifying question on every composed pick —
  already discarded by the design note (option 2): the visible decomposition *is* the
  teaching moment; no modal fires for characters with known decompositions.

## R4 — Output-form proposal: copy the `house-target-policy.ts` decision-table shape

- **Decision**: Implement the S4 proposal as an ordered, first-match-wins policy table with
  authored `explanation` text and a mandatory default row, in
  `packages/engine/src/marks/output-form-policy.ts`, mirroring
  `facet-transform/house-target-policy.ts`: row 1 — any attested/accepted pair lacks a
  ready-made form → propose base-plus-mark (FR-014, notice); row 2 (default) — all pairs
  compose and no letter-plus-mark class → propose ready-made (FR-015, notice); the open
  case (all pairs compose AND ≥1 letter-plus-mark class) renders as a radio with the
  recommendation first (FR-016). Prompt text never contains "Unicode"/"normalization"
  (SC-005 asserts this mechanically).
- **Rationale**: The design note names this exact shape; it delivers deterministic,
  authored explanation chips (defaults-first §3c) and is already tested in-tree.
- **Alternatives considered**: Ad-hoc conditionals in the station component — rejected:
  the decision must be engine-computable at S0 (the gate precomputes station visibility)
  and testable without React.

## R5 — `nfc-posture-of-inventory` as the shared pure function

- **Decision**: Build the per-pair posture table (`attested stack → has ready-made form?`)
  as one pure function in `packages/engine/src/marks/nfc-posture-of-inventory.ts`, and flip
  `content/facets/orth/mark-composition-posture.yaml`'s derivation from
  `planned:nfc-posture-of-inventory` to implemented. Its output feeds all four declared
  consumers: the facet, the S4 proposal, the stepwise-unwrap store generation, and the
  blocking rules.
- **Rationale**: The facet YAML already names this function as its `planned` derivation;
  the design note requires the single computed table so the four consumers can never
  disagree (single-source-of-truth-as-data, the spec 045 convention).
- **Alternatives considered**: Computing posture independently in the station and the
  validator — rejected: divergence between "what the survey proposed" and "what the check
  enforces" is exactly the failure mode FR-022 exists to prevent.

## R6 — Uniformity invariant: IR-level check + one new criteria row

- **Decision**: Add `checkNormalizationUniformity(ir: KeyboardIR): LintFinding[]`
  following the IR-aware `layer-a-prime.ts` convention, tagged `layer: "B"`, wired into the
  existing single-debounce validation run; reuse the combining-run/compose logic from
  `facet-transform/migrations/nfd-to-nfc.ts`. Add one `layer-c-enforce` criteria row
  (uniform mark normalization, with a `lintRuleId`) and bump the enforced counts:
  total 148 → 149, band 66 → 67, in `types.test.ts`, `schemas.test.ts`, and
  `criteria-summary.md`.
- **Rationale**: FR-022 requires the invariant be *mechanically checkable against the
  finished keyboard's design*; the design note calls it a "candidate new criteria row —
  the card proposes; the check proves". There is no Layer B module today, but
  `LintFinding.layer` is a free field and A′ established the IR-aware-check convention.
- **Alternatives considered**: Survey-side assertion only — rejected: advisory, not
  provable. A source-string (Layer A-style regex) check — rejected: normalization form of
  emitted outputs is an IR property, not a lexical one.

## R7 — Blocked combinations and backspace unwrap: net-new IR rule generation

- **Decision**: Generate, in `pattern-apply`, (a) blocking behavior for every mark × base
  left unchecked — the mark key path simply produces no composed result (swallow), the
  minimal A6 pull-forward the design note anticipates; and (b) the stepwise backspace
  unwrap stores per the design note's recipe (enumerate valid combinations from the
  attachment matrix, pair each composed form with its one-mark-shorter predecessor).
  Both are generated, never hand-authored, and derive from the same posture/attachment
  tables (R5).
- **Rationale**: No blocking generator exists today (confirmed net-new);
  `collectCharContributors` (commit e7184913's coordination-aware guard) is the analysis
  shape to invert, and `nfd-to-nfc.ts`'s `isUnreachableBackspaceOverride` already
  recognizes the unwrap rule shape from the consuming side. Swallow-vs-feedback is the
  Phase-C-gated A6 loudness axis — shipping swallow as the fixed minimal behavior defers
  the axis without blocking FR-021.
- **Alternatives considered**: Full A6 axis (loud feedback option) now — rejected as scope
  creep; recorded so the axis can layer on later. Pairwise N×N exclusion UI — rejected;
  attested-stack confirmation (S5) covers mark×mark per the spec assumption.

## R8 — Question retirement and S3 relocation

- **Decision**: Remove `pb_accent_marks_gate`, `pb_diacritic_select`, `pb_mark_style`,
  `pb_capitals_marks`, `pb_stacking_marks` from `content/flows/phase_b_characters.modular.yaml`
  and `questions/registry.b.ts`, retargeting the surrounding `next` routing; update the
  flow-parity snapshot. Relocate `pb_mark_input_order`'s content (prefix/postfix radio,
  prefill from `detectMarkInputOrderFromImport`) into the S3 station, preserving wording
  and prefill behavior (FR-025), shown only when ≥1 class is letter-plus-mark (FR-012).
  Case pairs derive from the confirmed alphabet's case data at S1 (FR-009), which is what
  retires `pb_capitals_marks`.
- **Rationale**: The registry fan-out rule (module + registry + thin YAML) makes retirement
  a three-place mechanical edit with an existing precedent (spec 022 library-demote,
  spec 036 order change); `import-mark-order.ts` is already the seeded prefill authority
  for mark order, so S3 consumes it unchanged.
- **Alternatives considered**: Keeping the old questions hidden-but-registered — rejected:
  FR-025 says "remove from active use", and dead flow entries are what the parity snapshot
  exists to catch.

## R9 — Mental-model prefill signals and the MVP degradation

- **Decision**: Compute S2 prefill per mark-class from three signals (FR-011):
  productivity spread (attested base count per mark), the base keyboard's
  deadkey-vs-direct mechanism (a sibling detector next to `import-mark-order.ts`,
  informed by the existing `diacritic-mechanism` facet classification approach), and the
  spare-key budget (reusing the `spare-key-budget` classifier logic; when
  attested+plausible combinations exceed spare keys, own-letter renders as unaffordable
  with the reason stated). Thresholds ship as named constants calibrated later (spec
  assumption). The MVP degradation path is kept open: one global mental-model
  confirmation covering all classes, still carrying the FR-011 signals, with per-class
  refinement as a follow-up increment.
- **Rationale**: All three signals have existing in-tree sources; the spec explicitly
  permits the MVP shape, which de-risks the hardest card (per-class dynamic radio).
- **Alternatives considered**: Blocking on full per-class grouping heuristics — rejected:
  FR-010's grouping quality is calibration work (design-note open question 4), not a
  launch gate.

## R10 — Recorded consequence, not implemented: the `nfc → nfd` transform

- **Decision**: When the designer picks base-plus-mark output while adapting a base whose
  content uses ready-made forms, record the migration need on the session (a flag the
  Track 1 instantiation path can later act on); do **not** build the reverse
  `nfc → nfd` facet-transform in this feature.
- **Rationale**: Spec assumption and design-note open question 3 both hold this as a
  separate decision; the declined-migration state is in-tree (`nfd-to-nfc` only) and
  silently implementing its reverse would reopen a resolved decline informally.
- **Alternatives considered**: Implementing the transform now — rejected per the spec's
  own scoping.
