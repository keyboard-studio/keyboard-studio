# Research: Live extraction from the starting point (specs/092-live-extraction)

Phase 0 of `/speckit-plan`. Every finding below was verified against the code on
this branch (`km/live-extraction` @ 07356c2f, i.e. `main` 18e63aa4 + the
088–093 spec split). Where a predecessor spec (088–091) changes the ground
under a finding, that is stated — this branch is stacked, and 088–091 are
planned but not yet implemented, so the code references below describe the
pre-series state the implementation starts from after its predecessors land.

## R1 — `extract()` exists, is correct, and never runs live (HANDOFF G2, verified)

**Decision:** reuse the existing runner semantics; do not write a second
extraction engine. The work of this spec is *wiring* — a live runner invoked
once after working-copy setup — plus converting the step seeders (R3).

**Evidence:**
- Five modules carry a real `extract`: `il_language_english`,
  `il_language_code`, `il_target_script`, `il_copyright_holder`
  (`packages/studio/src/survey/questions/a/`) and `pb_character_inventory`
  (`packages/studio/src/survey/questions/b/`, in no flow).
- The only runner is `runDecisionFlow`
  (`packages/studio/src/decisions/decisionFlow.ts`). Its non-test callers are
  `DecisionsDemo.tsx` (DEV-only) and `decisions/spikeRunner.ts` (a thin adapter
  over it, also demo/test-facing), plus `decisions/corpusMine.ts` (tests only).
  Nothing in the live wizard calls it.
- `runDecisionFlow` already implements the exact semantics FR-001/US2 need:
  modules are walked in derived order; an `extract(ctx)` result that passes
  `validate()` becomes `{ provenance: "extracted", source: <catalog id,
  falling back to IR header keyboardId/name> }`; a value `validate()` rejects
  is treated as absent (087 fix 4); a `null` extract normalises to absent; a
  throwing extract/validate aborts with the module id named.
- The bundle already exists: `buildExtractContext(baseIr, baseKeyboard)`
  (`decisions/extractContext.ts`) builds the `ExtractContext`
  (parsed IR + catalog entry + langtags resolver) from the working-copy
  store's canonical slots. No new store, no new fetch.

**Gap the live runner must close:** `runDecisionFlow` resolves a whole flow
in one pure pass (extract → stub answer → default) and returns a `DecisionSet`;
it does not merge into a live, partially-answered `decisionStore` (088), does
not preserve author answers, and has no `offered` concept. The live runner is
therefore a new, thin function over the same primitives (`orderDecisions`,
per-module `extract` + `validate`, `buildExtractContext`) with the merge rules
of data-model.md — not a fork of `decisionFlow.ts`'s semantics. Whether the
implementation refactors `runDecisionFlow` to share the per-module core is an
implementer's choice; the semantics must not diverge.

**Alternatives considered:** calling `runDecisionFlow` wholesale after setup
and adopting its output as the store (rejected — it would overwrite author
answers given before setup completes, violating US2 scenario 2 and the
never-silently-applied principle); leaving extraction in the demo (rejected —
that is the defect being fixed).

## R2 — Identity is asked before any starting point exists (HANDOFF G2, verified)

**Evidence:** `stepDependencies.ts` on this branch:
`choose_base: { settles: ["base-keyboard"], requires: ["language-code",
"target-script"] }` and `track: { requires: ["base-keyboard"] }`. The identity
questions therefore complete before `choose_base`, so even a wired runner
could not fire the `il_*` extractors at ask time. This is why extraction must
run **after setup** and seed/merge into records for questions already asked —
for an already-answered decision the extracted value lands in `offered`
(088 FR-001), it does not replace the answer. US1's placement change
(FR-005, `requires: ["authoring-track"]` on `il_copyright_holder`) is what
moves that one question after the track choice, where extraction has already
run and the pre-fill is visible at ask time.

## R3 — FR-002 seeder inventory, verified site by site

Every seeder the spec names exists on this branch, at the site the handoff
gave. Disposition per site (all become an `extract` on the owning module, or a
lookup default producing the same record shape — `{ provenance: "default",
source: <lookup named> }`):

| Seeder (spec wording) | Verified site | What it seeds today | Disposition |
|---|---|---|---|
| `IdentityLite.tsx` (langtags and GitHub profile) | `packages/studio/src/survey/IdentityLite.tsx`, `getSeedValue`/`getSeedProvenance`/`getSeedSource` (~lines 385–470) | `il_language_autonym` (langtags `localNames[0]`, else the Q1 English answer), `il_language_code` and `il_target_script` (resolved langtags entry), `il_author_name` / `il_author_email` (stored GitHub author profile; deliberately `undefined` when the profile has no name — never the login handle) | Lookup defaults, provenance `default`. Sources already named by `getSeedSource`: `"langtags"` for langtags-backed seeds, `"identity"` for profile-backed seeds. Note the deliberate exclusion already in the code: `il_copyright_holder` is **not** seeded here (blank = "same as the author", D1) — see R5. |
| `Prefill.tsx` | `packages/studio/src/survey/Prefill.tsx` (`buildPrefillRows`, `buildScriptAlignmentRows`), consumed by `CharactersStep.tsx` | Script-alignment confirmations (spec 038: `q_sa1_target_script_spread`, `q_sa2_base_script_mismatch`, `q_sa3_latin_flavor`) and base-derived prefill rows shown as accept-or-go-back confirmations before the characters step | The fired-question prefill values (`adaptation/firing.ts`) become `extract`s on the modules that provide `sa1-target-script-spread` / `sa2-base-script-mismatch` / `sa3-latin-flavor`; the component keeps rendering rows, reading values + source labels from decision records instead of computing them. |
| `CharactersStep.tsx` | `packages/studio/src/survey/CharactersStep.tsx`, `confirmPrefill(identity, base)` (~lines 93–135) + the `phaseBDraftStore` seeding around it | Builds/resets the Phase B alphabet draft from identity + starting point; carries author additions over a shape change, re-proposing out-of-script additions as `reproposed{outside-script}` via `surveyAnswerStore` | The starting-point-derived alphabet proposal becomes the `extract` of `pb_character_inventory` (which already has one — `extractCharacterInventory`, currently in no flow); the author-additions carry-over is answer preservation, which the live runner's merge rules (R1/data-model) now own. The `phaseBDraftStore` itself is deleted by 090, so this conversion lands on 090's decision-value shape. |
| `prefillCarveDispositions` | Store action `workingCopyStore.prefillCarveDispositions` (declared ~line 967, implemented ~line 1975 in `packages/studio/src/stores/workingCopyStore.ts`); sole live caller `editors/carve/CarveGalleryV2.tsx` (~lines 825–836, a `useEffect` over recommended combo ids) | Per-combo carve dispositions pre-filled from the bulk default (closed-keyboard card / FR-005 proposal); writes only for combos with no existing disposition, so it never re-prompts | Becomes the `derived`-provenance seeding of the `carved-layout` decision value (090 US3 owns the value shape and per-item provenance: `asked` for a hand removal, `derived` for a proposal). In 092 the pre-fill is produced by the extraction/recompute pass as per-item `derived` entries, not by a store action called from a component effect. The store action is deleted (SC-003). |
| `PHASE_F_SEEDS` | `packages/studio/src/editors/adapters/flowStepOptions.tsx` (~lines 336–390), read by `getSeedValue`/`getSeedSource` in the same file | `pf_welcome_paragraph` (source `"base"`), `pf_contact_info` (`"identity"`), `pf_more_detail_gate` (plain default, no source), `pf_doc_language` (`"identity"`), `pf_history_entry` (`"analysis"`), `pf_project_url` and `pf_provenance_basis` (`"base"`, via `lib/phaseFSeeds.ts`). `pf_credits` is deliberately absent (thanking ≠ owning) and stays absent. | Each entry becomes an `extract` (for `"base"`-sourced proposals, reading the starting point via `lib/phaseFSeeds.ts` helpers) or a lookup default (identity/analysis/plain default) on the corresponding `pf_*` module, keeping each entry's documented source name. The registry table is deleted (SC-003). |

**Cross-cutting finding:** the seed *plumbing* already speaks the target
vocabulary. `SurveyRunner` takes `getSeedValue` / `getSeedProvenance` /
`getSeedSource` props (~lines 277–308 of `SurveyRunner.tsx`), seeds carry a
`DecisionProposalSource` (`packages/contracts/src/decisionRecord.ts`:
`"langtags" | "cldr" | "corpus" | "axis-fill" | "base" | "identity" |
"region" | "derived-from-axis" | "analysis"` — contracts-owned, **not**
changed by this spec), and `DecisionsDemo` already renders an extracted
record's source as `from {source}`. 092 replaces the per-step plumbing with
decision records; it does not invent new source names.

## R4 — The setup-order hazard (HANDOFF G7 / US3), verified and localised

**Evidence:**
- Order: `choose_base` settles `base-keyboard` requiring only
  `language-code` + `target-script`; `track` requires `base-keyboard`. The
  track is therefore answered **after** the starting point is confirmed.
- Instantiation: `StudioShell.tsx`'s `doCommit` (reading
  `useSurveySessionStore.getState().selectedTrack` at ~line 979) is invoked
  from an effect on `baseConfirmed` (~lines 1142–1161). At that moment
  `selectedTrack` is still `null`, so the first commit always sets the working
  copy up as new-from-base; the adapt track only takes effect on a second
  commit.
- `StudioShell.tsx` ~lines 645–655 documents the downstream damage verbatim:
  on a restoring boot, `doCommit` re-derives the mode from the *advanced*
  `selectedTrack`, reads same-id/different-mode as a genuine base switch, and
  `resolveInstantiationCase` clears `phaseResults` — "A refresh silently
  discarded the survey."
- HANDOFF G7 names the structural fix, and FR-004 adopts it: *"A decision
  graph with `instantiate requires authoring-track` fixes this
  structurally."*

**Decision:** model setup as the `apply` (089) of a setup decision —
`instantiate` in the handoff's wording — that `requires:
["base-keyboard", "authoring-track"]`. The starting-point *selection*
(the `base-keyboard` decision, 090's `choose_base` module) is unchanged and
keeps its own placement; *instantiation* runs exactly once, when both its
inputs have settled, with the track known, through the same patch runner as
every other decision (089 FR-002). `doCommit`'s mode re-derivation and the
second-commit adapt behaviour are deleted, not patched.

**Vocabulary note:** if the implementation gives `instantiate` a `DecisionId`,
that addition goes through the existing exhaustive machinery
(`decisionIRPaths` in `decisions/decisionTypes.ts` is a total `Record` over
`DecisionId`; the consistency lint will fail until it is declared) — it is a
`packages/studio` change only. Whether `instantiate` is a distinct decision
id or the `base-keyboard` module's own deferred `apply` is left to
implementation, provided FR-004's observable behaviour holds: setup is an
`apply`, it requires `authoring-track`, it runs once. Recorded as open
question OQ-2 for the implementer, not the owner — both shapes satisfy the
spec.

**Cycle check:** `authoring-track` is provided by the track question module;
nothing in the track module requires `base-keyboard` at module level (the
`track requires base-keyboard` edge on this branch is a *step-level* edge in
`stepDependencies.ts`, which 091 deletes). After 091 there is no cycle:
`instantiate` sits after both, and `orderByDependencies`' existing cycle
error is the guard if an edge reintroduces one.

## R5 — `il_copyright_holder`: the acceptance test's exact mechanics (US1/FR-005)

**Verified current state** (`survey/questions/a/il_copyright_holder.ts`):
`provides: ["copyright-holder"]`, `requires: ["author-name"]`,
`extract: extractCopyrightHolder` reading `ctx.ir.header.copyright`. No
`validate()` (blank means "same as the author", D1). IdentityLite
deliberately does not seed it (R3).

**Decision:** FR-005 is literally a one-line change — `requires` becomes
`["author-name", "authoring-track"]` — plus the track-dependent seeding the
spec's US1 states verbatim:

- **Adapt track:** the question appears after the track choice, pre-filled
  from the keyboard's own copyright and labelled "from <keyboard>".
- **Copy track:** it defaults to the author, because the copied keyboard's
  notice is kept automatically.

Mechanically: the live runner's extraction pass is track-aware for this
decision because `authoring-track` is now one of its `inputs` (088 FR-001
records the `requires` values seen when a decision was decided). On the adapt
track the extracted copyright seeds the record
(`{ provenance: "extracted", source: <keyboard id> }`); on the copy track no
extracted seed is written and the D1 default-to-author applies
(`{ provenance: "default", source: "author-name" }` in record terms — the
value the author confirms is the author name, and the copied notice is
retained by the existing attribution machinery, not re-entered). This
preserves the module's existing correctness guard: the author is never
invited to re-type a holder that dedupes by exact match (the module's own
header comment documents the double-space duplicate-holder failure).

**No other module changes for US1.** That is the point of the acceptance
test: if any other edit is needed to make it pass, the series has failed and
the implementation stops and reports, rather than quietly making the second
edit.

## R6 — The starting-point log entry (US4), mechanism verified

**Evidence:** `decisions/recordBaseContribution.ts` returns `null` — "never a
fabricated zero baseline" — when `getBaseKeyboard()`, `getBaseIr()` or
`getInstantiationMode()` is null at call time. It is called from
`createDecisionRecorder.ts`'s `recordDecision` on `choose_base` completion.
Ordering on this branch: `StepHost.tsx` `handleComplete` runs
`applyStepCompletion` (line ~442) before `recordStepCompletion` (line 451) —
but `choose_base` is the exception the reducer's own header documents:
it "fires it from an async instantiation callback instead"
(`steps/reducer.ts` ~lines 549–567), i.e. instantiation runs through
`StudioShell`'s `doCommit` effect (R4), not synchronously in the completion
path. Whether the entry is written therefore depends on the race between
that effect and completion recording; HANDOFF G7 (verified 2026-10-06 on
`main`) records the outcome: the entry is probably never written.

**Decision:** under FR-004, setup is an `apply` executed by the decision
runner, and the extraction pass runs after it (FR-001). The recorder call is
moved to (or repeated at) the same post-setup point in the live runner, so
by construction the base keyboard, base IR and instantiation mode all exist
when `recordBaseContribution` runs. The `null` return stays as a guard; the
fix is that the null path is no longer reachable on a completed setup.
SC-005's check is the live walk asserting the entry's presence — not a unit
test of the recorder in isolation.

## R7 — Verification must be live (series lesson from 087)

**Decision:** all five success criteria are verified in the live wizard.
The acceptance walk is a Playwright spec under `packages/studio/e2e/`
(Playwright `^1.61.1`, `pnpm --filter @keyboard-studio/studio test:e2e`,
config `packages/studio/playwright.config.ts`) driving `pnpm dev`, in the
style of the existing e2e walks (`copy-edit.spec.ts`,
`switch-base-rebase.spec.ts`, `exemplar-prefill.spec.ts`). Store-level tests
drive the real `StepHost` where the spec allows (088's standard). Results
from `DecisionsDemo` or `src/test/sc004Harness.ts` do not count toward any
SC in this spec — stated in 088's spec, repeated here because 087's SC-001
was measured in the demo and 092 SC-002 explicitly replaces that measurement.

**SC-002 measurement definition:** after choosing `basic_kbdfr`
(`docs/keyboard-index.md`: French Basic, `fr`, "(c) 2009-2019 SIL
International", `../keyboards/release/basic/basic_kbdfr`) as the starting
point in the live wizard, count the decisions the extraction pass seeded —
records with provenance `extracted` or lookup-`default` written by the pass,
over the decisions applicable (not gated off) at that point. The spec
requires the share to be **measured and reported**; it sets no target
percentage, and this plan invents none. The measured number is reported in
the implementation PR and recorded in the spec's evidence, replacing 087
SC-001's demo measurement.

**Golden walk:** 089 SC-001 establishes the scripted golden walk (copy track
from `basic_kbdfr`, fixed answers, byte-identical source zip against a
baseline captured from `main`). 092 must keep it byte-identical (the seeders
change where values come from, never what the author ends up confirming).

## R8 — Renderer source labels (FR-003)

**Decision:** no new label machinery. After 090, `DecisionRendererProps`
carries `provenance` and `source` (090 FR-001) precisely so any renderer can
show "from <keyboard>"; the default (question) renderer path already renders
seed provenance captions through SurveyRunner's seed props (R3). 092's work
is to feed both paths from decision records: the default renderer reads the
record's `provenance`/`source`/`offered`; custom renderers receive them as
props. The rendered label names the source — for an extracted value, the
starting-point keyboard id (the demo's existing rendering is literally
`from {source}`); for a lookup default, the lookup (`langtags`, the GitHub
profile). When the author has overridden an extraction, the `offered` value
renders beside the author's value (US2 scenario 2) — beside, never instead.
**i18n:** no existing message id changes. Any genuinely new label string is
added under the existing survey provenance caption pattern with a new id;
moving or re-sourcing a question never renames its id (091 FR-006 carries
into this spec).

## Open questions

- **OQ-1 (owner, not blocking plan):** none outstanding at plan time. The
  series' unsettled owner questions sit in 090 (carve per-item provenance
  shape) and 093 (starting-point change semantics; perf budgets) — neither
  blocks 092.
- **OQ-2 (implementer):** whether setup is a distinct `instantiate` decision
  id or the `base-keyboard` module's deferred `apply` (R4). Both satisfy
  FR-004; the choice is recorded in the implementation PR.
- **OQ-3 (implementer):** whether the live runner shares a per-module core
  with `runDecisionFlow` or stands alone over the same primitives (R1).
  Semantics must not diverge either way; a divergence is a defect.
