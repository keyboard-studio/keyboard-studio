# Research: Legible decision trail

Phase 0 for [plan.md](plan.md). Each entry is a decision the design depends on, why it was taken, and what was rejected. D-01 and D-02 resolve the spec's two deferred open questions; D-03 resolves the contract-tier reading the spec flagged as unconfirmed.

---

## D-01 — Pre-feature records are marked by record version, not by shape

**Decision.** Bump `DECISION_RECORD_VERSION` from `1` to `2`. On read, a record whose `version < 2` has its editor-action counts normalized to **absent** before anything renders. A new pure module `decisions/recordMigration.ts` owns that normalization; every consumer sees the same shape it would see for a genuinely unmeasured dimension.

**Rationale.** FR-005 makes absence mean unmeasured, but a record written by the shipped build carries a *present* `0` for dimensions that could not be measured, so absence cannot disambiguate it retroactively — the spec says so explicitly. The record already carries a version field whose stated contract is "a reader that does not recognise this reads what it can" (`decisionRecord.ts:240`), so a version bump is the mechanism the format already has for exactly this. Normalizing on read is not retroactive enrichment (which is out of scope): nothing is written back, and no activity is claimed — the opposite, activity is un-claimed.

**Alternatives considered.**
- *Present all pre-feature editor entries as unmeasured with no version mark* — indistinguishable from a v2 record whose producers genuinely failed, so it would mislabel future real failures as legacy.
- *Accept the ambiguity and state it once at the top of the trail* — a banner does not survive reading one entry, and SC-011 is measured per record, not per session. It also leaves the PR summary (which has no banner) still wrong.

**Consequence for SC-011.** "A record written before this feature loads and renders without claiming activity that build did not measure" becomes a property of the reader, testable with a v1 fixture.

---

## D-02 — A stage roll-up states the stage's net effect, from its effective entries

**Decision.** FR-023's one-line account summarizes the stage's **net effect**: for editor decisions, the latest non-superseded entry for that stage; for survey decisions, a count of the effective answers. Superseded history is not summed into the roll-up, though it stays visible inside the group (FR-026).

**Rationale.** Editor counts are **cumulative for the step**, by design — `recordEditorStep.ts`'s header states that a return visit appends a superseding entry describing the step's *new total*. Summing a stage's entries would therefore double-count every revisit: a carve of 40 revisited to 172 would roll up as 212. Taking the latest effective entry is the only reading consistent with how the counts are produced. It also aligns the roll-up with the PR summary, which already filters to `effective` entries (`prSummary.ts:179`) — which is what SC-007 requires of the two surfaces.

**Alternatives considered.**
- *Restate the entries* — reproduces the cumulative-count double-count, and makes a collapsed group longer than the entries it summarizes for exactly the sessions grouping exists to help.
- *Sum everything including superseded* — wrong for the same reason, and disagrees with the PR summary.

---

## D-03 — `EditorActionSummary` is 053's contract, not a Day-1 locked type

**Decision.** Change `EditorActionSummary` and `DecisionImpact` under ordinary drift-guard discipline: the interface in `packages/contracts/src/decisionRecord.ts` and its zod mirror in `schemas.ts` change in the same commit. No major version bump of `@keyboard-studio/contracts`, no joint engine+content session.

**Rationale.** Constitution Article I locks the **`Pattern`** interface, canonical in `pattern.ts` and specified in spec §5 / specs/005. These two types live in `decisionRecord.ts`, were introduced by spec 053, and are not referenced by Article I, spec §5, or specs/005. CLAUDE.md's contract source-of-truth chain applies to them as it does to every contracts type: the compile-time drift guards at `schemas.ts:789-793` are the machine-enforced link, and they are what makes the change safe. The spec asked for this to be confirmed before contract work begins; this is the confirmation, recorded rather than assumed.

**Alternatives considered.** *Escalate as a locked-contract change* — would be correct for `Pattern` and is wrong here; treating every contracts type as Day-1 locked would make 053's own follow-up work unshippable by its own author.

---

## D-04 — `mechanismsAssigned` reads the store, not the step result

**Decision.** Add `getMechanismAssignments: () => readonly MechanismAssignment[]` to `RecordEditorStepDeps`, wired in `StudioShell` to the existing `selectDesktopAssignments(phaseResults)` helper. `observeEditorStep`'s `mechanism_edit` branch counts from that dep instead of from `result.assignments`.

**Rationale.** This is D-1's root cause: `observeEditorStep` counts `result.assignments`, and the mechanisms adapter calls `onComplete(undefined)` (`addPhysicalAdapter.tsx:38`), so the count is structurally always zero. The assignments themselves are in the store at `phaseResults.find(p => p.phase === "C").assignments`, and there is already a shared, documented selector for exactly that read — `selectDesktopAssignments` in `lib/unimplementedInventory.ts`, whose docstring names it the single source of truth and says "do not fork this definition". Using it means the trail and the studio cannot disagree about how many assignments exist, which is FR-002's actual requirement.

This also follows the spec's stated assumption: the fix is a new dep alongside the existing ones, not a change to any adapter's prop shape. `getDeletionCounts` already establishes the pattern.

**Alternatives considered.** *Change `addPhysicalAdapter` to pass assignments through `onComplete`* — makes the editor aware of the audit, which FR-006 forbids, and duplicates state that already lives in the store.

**Note on scope.** `selectDesktopAssignments` filters `modality === "physical"` only. That is the right filter for "mechanisms assigned" — `deriveDesktopModifications` adds `scope === "individual"` for its own placement derivation, and the helper's docstring explicitly says callers needing a narrower filter re-derive locally. The audit wants the broad count.

---

## D-05 — `keysAdded` is newly-occupied host keys, measured against the carve-projected IR

**Decision.** A new pure helper `lib/occupiedHostKeys.ts` exposes `occupiedHostKeys(ir: KeyboardIR): ReadonlySet<string>`. At mechanisms-step completion the recorder computes:

```
before = occupiedHostKeys(applyCarveMutate(baseIr, deletedNodeIds, deletedItemIds))
after  = before ∪ { hostKey of each phase-C physical assignment }
keysAdded = |after \ before|
```

The host key comes from the existing `extractMechanismHostKey(mechanism)` — the same extraction `deriveDesktopModifications` and `TouchGallery` already use. An assignment whose mechanism yields no host key contributes nothing rather than an empty-string key.

**Rationale.** FR-003 defines "added" as newly occupied — no character before the stage, one after — and explicitly excludes reassignment of an already-occupied key so `keysAdded` and `mechanismsAssigned` never double-count the same edit. That needs a *before* state. Reconstructing it from `applyCarveMutate(baseIr, …)` rather than snapshotting one at stage entry is what keeps this store-derived (FR-006) and free of new lifecycle: carve is the only stage between instantiation and mechanisms, `applyCarveMutate` is the existing pure carve projector, and the store holds all three inputs at completion time.

**Alternatives considered.**
- *Snapshot key occupancy on stage entry* — introduces per-stage lifecycle state the recorder does not otherwise have, and a missed entry event silently reports every key as added.
- *Remove the field* — FR-004 permits it, and the recorded clarification explicitly chose the producer instead, retaining the field, its mirror, and the PR-summary formatting.

**Risk.** `occupiedHostKeys` is the one derivation with no shipped precedent — `buildProducedSet` answers "which characters", not "which keys". This is the highest-uncertainty task in the plan and should be built and tested first within its phase.

---

## D-06 — Unmeasured is `number | undefined`, and every consumer is forced to handle it

**Decision.** The four counts on `EditorActionSummary` become optional. The zod mirror uses `.optional()`, not `.default(0)`. Every consumer — `headline.ts`, `prSummary.ts`, the stage roll-up, the packaged record — reads them through an explicit absent branch that renders words, never a number.

**Rationale.** FR-005/FR-005a. The point is not the shape, it is the typecheck: with the counts non-optional, an unwired producer compiles and silently reports `0` — which is precisely the D-1/D-2 failure mode this feature exists to make impossible. Making them optional means a consumer that forgets the absent case fails to build. Choosing `.optional()` over a zod default is load-bearing for the same reason: a default would re-introduce the coercion at the record boundary.

**Alternatives considered.** *A parallel `measured: { keysAdded: boolean, … }` sidecar* — two structures that can disagree, and nothing forces a consumer to consult the second one.

**Stated limit.** Records already written carry a present `0`. D-01 handles them; absence alone does not.

---

## D-07 — Headlines name questions from the flow-question catalog, through an injected lookup

**Decision.** `headlineOf` gains an injected `lookupQuestionLabel: (questionId: string) => string | undefined` and returns a spec carrying a resolved **label**, never an id. The lookup resolves, in order: the question's `audit_label` from the flow-question catalog, then its `prompt`, then `undefined` — at which point the spec selects the FR-014 fallback message. Both fields resolve through the existing `resolveContentString("flowQuestions", id, field, englishValue, i18n)` seam that `QuestionField.tsx` already uses, so localisation is the mechanism already in place rather than a second one.

Editor headlines carry a stage **code** (the existing `EditorActionType`) plus a list of only the non-zero dimensions; the component maps the code to a studio catalog message. The engine's `EDITOR_LABEL` wording is adopted, not imported — 053 FR-016 requires the localized sentence to come from the studio.

**Rationale.** FR-008/FR-009/FR-010/FR-013/FR-014. Keeping the lookup injected preserves the existing property that headline *selection* is unit-testable without rendering, which FR-013 requires explicitly. Sourcing from the flow-question catalog rather than a new store follows the recorded clarification and the spec's stated assumption; a second per-question label store would drift.

**Alternatives considered.** *Resolve the label inside the component* — collapses the tested selection seam into JSX and makes FR-011's zero-suppression untestable without a DOM.

---

## D-08 — Per-key optional parity, so one optional field does not redden every started locale

**Decision.** Teach `utilities/content-i18n-lint/index.js` a per-key optionality rule: a target-locale catalog may omit a key matching `content.flowQuestion.*.audit_label` without being reported as missing. An *extra* key still fails, and every other key remains strictly parity-checked. `utilities/i18n-content-extract/extract.ts` adds `audit_label` to the flow-question field list it already walks (`prompt`, `label`, `body`, `help_text`), extracted only when non-empty — the same guard the other four use.

**Rationale.** `flowQuestions.json` is in `PARITY_ONLY_FILES` (`content-i18n-lint/index.js:55`), and `checkTargetLocaleParity` compares whole key sets. `content/i18n/fr/flowQuestions.json` exists, so it has "started". Adding an optional field to even one question would therefore fail the lint for French immediately — the exact failure the spec's third assumption predicts. The lint change must land **before** the first `audit_label` value.

**Alternatives considered.**
- *Author `audit_label` for every question in every locale* — 204 keys today for a field the clarification deliberately made sparse, and it defeats the "content cost paid only where it buys something" reasoning.
- *Drop `audit_label` and always use `prompt`* — rejected in clarification; "What is your language called in English?" reads badly as a headline.

---

## D-09 — The attributed change spans the projected VFS, with one named volatile normalizer

**Decision.** `snapshotSource.ts` holds a baseline `Map<path, text>` over every entry of the projected VFS with `isBinary === false`, instead of one `.kmn` text. A boundary capture diffs per path and returns a captured impact carrying a **set** of per-file changes plus an aggregate magnitude. Files are compared through a single normalizer that neutralizes the one identified volatile source before diffing.

**Rationale.** FR-016/FR-017/FR-018. `VirtualFSEntry` already carries `isBinary` (`packages/contracts/src/virtualFs.ts:7`), so "every text file the projection produces" is directly enumerable from `vfs.entries()` with no maintained list — which is the clarification's stated reason for choosing whole-package comparison over a curated one. FR-018 holds by construction because the read still goes through `projectWorkingCopyForOutput`, the same function the zip and PR paths call; only the number of files read from its result changes.

**Volatile content (FR-017a).** Two candidates were examined in `serializeWorkingCopy.ts`:
- **`HISTORY.md`'s staged date** — `stageAdaptHistory` stamps `new Date().toISOString().slice(0,10)` on the adapt path. Within a session it is constant, so consecutive boundaries agree; across midnight one boundary would show a spurious one-line change. Held stable by the normalizer rather than excluding the file, so a *real* HISTORY change stays visible.
- **The `.kps` `<Version>` bump** — derived from `baseIr.header.version`, which does not change mid-session. Deterministic, therefore not volatile. No handling needed; recorded here so a future reader does not re-litigate it.

**Alternatives considered.** *Exclude `HISTORY.md` wholesale* — cheaper, and it makes a genuine history edit invisible to the audit, which is the class of hole FR-016 was written against.

---

## D-10 — One capture per boundary, attributed jointly and named

**Decision.** `createDecisionRecorder` attaches the boundary capture to **every** entry recorded at that boundary, and the captured impact gains `sharedWith?: readonly string[]` naming the co-decisions' `entryId`s. The single-decision case is unchanged: `sharedWith` is absent, and the entry claims the change outright.

**Rationale.** FR-019/FR-019a and the recorded clarification: state the sharing rather than splitting the boundary. The current code attributes only when a step produced exactly one decision (`createDecisionRecorder.ts:91`) and lets the rest fall through to the counterfactual path, where the disabled mutate seam produces four identical "cannot be shown" messages — the dead end D-3 reports. Attaching the same capture with an explicit shared-with list converts that into a joint statement without a second comparison, so 053's one-diff-per-boundary model is preserved exactly.

`attachImpact` is write-once *per entry*, so calling it once per entry in the group is within its existing contract.

**Alternatives considered.**
- *Attach the diff to each entry with no shared marker* — makes all four overstate what they did, which is the failure `createDecisionRecorder`'s own header rejects.
- *Split the boundary per answer* — violates FR-019a and would multiply projections per step.

---

## D-11 — The base baseline is recorded at `choose_base`, from the instantiated store

**Decision.** A new `decisions/recordBaseContribution.ts` appends one entry at `choose_base` completion, carrying the base chosen, the starting key count, the axes derived from the base, and the metadata inherited. It reads `useWorkingCopyStore` state — `baseKeyboard`, `baseIr`, `irAxes`, `instantiationMode` — via injected deps. If the store shows no instantiated working copy at that instant, **no entry is written**; a baseline of zero would be worse than none.

The starting key count is derived with `toRailNodes(baseIr, removalCapabilities)` — the same derivation `CarveGallery` uses to build its inventory — so the denominator is in the *same unit* as `keysRemoved` (`counts.nodes + counts.items`).

**Rationale.** FR-030/FR-031/FR-034/FR-035. `recordStepCompletion` fires from `StepHost.tsx:253` **after** `applyStepCompletion`, and the comment there states the ordering is deliberate so an editor step's summary reads state its own side effects just produced. `choose_base`'s instantiation happens inside `applyStepCompletion` (`reducer.ts:424-476`), so by the time the recorder runs the working copy exists — which is exactly what FR-035 requires, and it needs no new event.

The unit match matters more than it looks: FR-034 says a stage's counts must be interpretable against the recorded starting inventory. `keysRemoved` is `nodes + items` from the carve overlay; a starting count derived any other way (say, `buildProducedSet` cardinality) would give the author a denominator their numerator does not divide into.

**Provenance (FR-032/FR-033).** Making `base-derived` reachable is the second half of this: `recordSurveyAnswers`'s `resolveProposal` seam is fully implemented and unwired (`StudioShell` supplies no register). Supplying one seeded with the base's inherited values makes `deriveAnswerProvenance` return `{ agency: "base-derived", source: "base" }` — the existing branch at `recordSurveyAnswers.ts:84-86` — and brings the already-authored `trail.entry.headline.fromBase` message to life. This is wiring an existing seam, not new provenance design, exactly as FR-032 requires.

**Alternatives considered.** *Re-read the base keyboard's source to describe its contribution* — explicitly forbidden by FR-035, and it would describe the base rather than what the author actually started from (they differ once instantiation applies a track).

---

## D-12 — FR-028 is enforced by a rendering test, not by the static linter

**Decision.** A new `DecisionEntryRow.identifiers.test.tsx` renders one entry of **every** kind — each survey agency, each editor action type, the base-contribution entry, the shed and unavailable states — through the real component against the real English catalog, and asserts the rendered text matches no `snake_case` / `camelCase` identifier token drawn from the payload. `utilities/test-antipattern-lint` is **not** extended.

**Rationale.** FR-028 requires mechanical enforcement, not review; a test that fails CI is mechanical. It is not a job for `test-antipattern-lint`, which is a plain-node static scanner over test files (its two checks are a tautology grep and a question-order-snapshot grep) — it cannot render a component, and teaching it to would put a runtime concern in a static tool.

FR-027 and FR-029 are handled in the same movement: `reducer.decisionRecording.test.ts` currently feeds the recorder `{ answers: [], assignments: [...] }`, a payload shape the real adapter never emits, and asserts `keysAdded === 0` with a comment explaining why it should stay zero (D-6). Those tests are rewritten to drive the production completion path with real store state, and each dimension gains a test that drives it non-zero through that path — which is what makes FR-029 a guard on FR-004 rather than a promise.

**Alternatives considered.** *Assert on `HeadlineSpec` alone* — cheaper and insufficient: the spec is the selection, and FR-008 is about the rendered text, where a catalog message could still interpolate an id.
