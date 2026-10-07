# Research: Question decisions write only through `apply` (specs/089-decision-apply)

Phase 0. Every finding below was verified against the code on this branch
(`km/decision-apply` @ 07356c2f, i.e. `main` at 18e63aa4 + the 088–093 spec split) —
file and line references are to that tree. Where the spec text and the code disagree,
the code is recorded and the disagreement is named, not smoothed over.

## Verified current state

**The write path today.** `routeAnswersThroughMutate` (`steps/reducer.ts:584-601`)
iterates a completed `SurveyPhaseResult`'s answers, looks each up in
`questionRegistry`, and — only for modules with both `mutate` and non-empty `writes` —
builds a `MutateRequest` and calls `applyStepCompletion`. That function
(`steps/reducer.ts:337-352`) returns immediately when `isMutateSeamEnabled()` is false;
otherwise it merges `mutate(value, ctx)` through `applyMutatePatch` and calls the
injected `setWorkingIR`. It is called from exactly one place: `StepHost`
(`components/StepHost.tsx:435-436`), after `recordPhase` and before
`applyStepCompletion`/`recordStepCompletion`/`advance` — i.e. decision effects routed
here land **before** advance, which is the R7 ordering FR-004's deletions must preserve.

**The flag.** `flags/mutateFlag.ts` is 38 lines: `isMutateSeamEnabled()` returns
`readEnvFlag("VITE_KM_MUTATE_SEAM")` — true only for exactly `"1"`, off by default.
Its readers (non-test) are six:

| site | what the flag gates |
|---|---|
| `steps/reducer.ts:340` | the `MutateRequest` path — **089's runner, in scope** |
| `steps/reducer.ts:393` | mechanisms completion → touch `repropagate` |
| `decisions/impact.ts:101` | decision-trail counterfactual derivation returns `null` while off |
| `editors/assignLoop/TouchGallery.tsx:5372` | hand-set promotion on a manual touch-key edit |
| `lib/projectWorkingCopyVfs.ts:503` | carve projection takes the seam path (`applyCarveMutate`) while on |
| `lib/projectWorkingCopyVfs.ts:758` | add-gallery seam derivation while on |

Test files also stub the env var (`reducer.test.ts`, `successCriteria.sc004*.test.ts`,
`projectWorkingCopyVfs.flagParity.test.ts`, `serializeWorkingCopy.flagParity.test.ts`,
`workingCopyStore.test.ts`, `impact.test.ts`) — a flag deletion touches all of them.

**The `onCommit`s (FR-004).** In `editors/adapters/flowStepOptions.tsx` (589 lines):
`trackOptions.onCommit` (:79-89) calls `deps.setSelectedTrack` and, on adapt,
`deps.setScaffoldSpec(null)`; `projectNameOptions.onCommit` (:235-252) calls
`deps.setScaffoldSpec({keyboardId, displayName})` then `deps.setIdentity({keyboardId,
displayName, ...identityLanguagePatch(deps.identityResult)})`;
`phaseFOptions.onCommit` (:554-575) calls `deps.setHelpDocs(extractHelpDocs(result))`
and `deps.setHistoryEntryState(applyHistoryEntryAction(...))`. `phaseFOptions` also has
an `onMount` (:516-526) that derives the history-entry proposal state once per mount —
a derivation, not an answer write. Identity has **no** `onCommit`: its writes live in
`IdentityLiteAdapter.handleComplete` (`editors/adapters/panelAdapters.tsx:102-112`) —
`setIdentityResult`, `setSurveyContext(contextFromIdentity(identity))`,
`setAttribution(identity.attribution)`, `setIdentityPhaseResult(result)`, all before
`onComplete`. The factory (`makeFlowStepComponent.tsx:337-353`) fires
`extract → onCommit → props.onComplete(result)`; its `FlowStepDeps` (:75-135) is the
deps record the three `onCommit`s consume, including `identityResult`, `scaffoldSpec`,
and `selectedTrack` reads for the FR-031 re-entry seeds.

**Where the effects actually land.** `setIdentity`, `setAttribution`, `setHelpDocs`,
and `setHistoryEntryState` are all **working-copy store** setters
(`stores/workingCopyStore.ts:2441, 2443, 2451, 2468`) writing overlay fields —
`identity: IdentityPatch | null` (:396), `attribution: Attribution | null` (:414),
`helpDocs: HelpDocsAnswers | null` (:458), `historyEntryState: HistoryEntryState | null`
(:525) — **not** IR leaves. They are projected at output by `projectWorkingCopyVfs`.
`setSelectedTrack`/`setScaffoldSpec` are session setters (`surveySessionStore.ts:840-841`).

> **Spec-vs-code discrepancy (recorded, resolved by code):** 089's edge-case note says
> help docs "are currently session state (`setHelpDocs`, `setHistoryEntryState`)".
> They are not — both setters write `workingCopyStore`. Consequence: FR-005's help-docs
> clause needs no session-field removal; the help effect is an ordinary
> `WorkingCopyPatch` channel (R2), and FR-005's real session targets are
> `identityResult`, `identityPhaseResult`, `scaffoldSpec`, and the stored
> `surveyContext` (all `surveySessionStore.ts:300-323`, setters :837-839).

**The modules.** `track_choice` provides `authoring-track`, `writes: []`, no `mutate`.
`project_display_name` provides `project-display-name`, `writes: [header.name]`;
`project_keyboard_id` provides `project-keyboard-id`, `writes: [header.keyboardId]`,
`requires: ["project-display-name"]`. The `il_*` modules each provide one identity
decision and declare `writes: []` with `outputs` naming package-descriptor fields —
they write no IR today by design (spec 059 FR-016). The `pf_*` modules provide the
granular `help-*` decisions; the composed `help-docs` decision is settled by the help
**step** (`steps/stepDependencies.ts:139`, `settles: ["help-docs"]`), and
`decisionIRPaths` maps `"help-docs": []`. `extractHelpDocs`
(`flowStepOptions.tsx:433-475`) is the composition of the `pf_*` answers into
`HelpDocsAnswers`, returning `undefined` when `pf_welcome_paragraph` is blank.
`pb_standard_letters` (`survey/questions/b/pb_standard_letters.ts`) is the only module
with a live `mutate`: it rebuilds `stores[]` replacing the `kmStandardLetters` entry,
`writes: [stores[]]`, `inputs: [header.bcp47]`.

**Session-field readers (FR-005 blast radius).** Non-test references to
`identityResult`/`scaffoldSpec` total ~106 across 23 files; the load-bearing ones:
`hooks/useKeyboardArtifact.ts` (14 — `svc.scaffold(kb, scaffoldSpec.keyboardId,
scaffoldSpec.displayName, …)` at :776, compile-id selection), `lib/draftPersistence.ts`
(draft envelope carries the session fields; project label), `lib/projectLabel.ts`
(name fallback chain), `components/StepHost.tsx` (advance inputs),
`lib/confirmRebase.ts:149-157` (`identitySeedFromSession` — seeds the working copy's
identity overlay at instantiation from `identityResult`), `StudioShell.tsx`,
`CharactersStep.tsx`, `BaseResolutionAdapter` (`panelAdapters.tsx:188` — suggest target
from `identityResult.prefill.script`/`bcp47`). `surveyContext` is read by 13 files
(flow contexts, step components, `useWorkToDo`).

**The 088 dependency.** `decisionStore` does not exist on this branch (zero source
references) — it is 088's deliverable (088 FR-001: a store holding the live
`DecisionSet`; record shape `{ id, value, provenance, source?, inputs?, offered?,
step }`; 088 FR-003: every survey-question completion writes its decisions there;
DRAFT_VERSION 1 → 2). 089's plan therefore specifies everything against 088's spec'd
record shape and treats the store's exact action names as an integration point to be
read from 088's landed code at restack time, not invented here.

**Golden-walk assets.** Two oracles exist today: the store-level golden walk
(`packages/studio/tests/steps/stepHost.goldenWalk.test.tsx`, fixtures
`tests/steps/__fixtures__/goldenWalk/{copy,adapt}.json`) asserting the store-mutation
**sequence**, and the Playwright suite (`packages/studio/e2e/`) with flow helpers in
`e2e/helpers/surveyFlow.ts` (identity driving, `survey-advance`, returning-visitor
seed) and a source-zip download pattern in `e2e/carve.spec.ts:249-270`. No existing
test byte-compares a full copy-track walk's source zip — SC-001's script is new.
`basic_kbdfr` is codec-clean and catalogued (`docs/keyboard-index.md:170`, French
Basic, `fr`, `../keyboards/release/basic/basic_kbdfr`).

## Decisions

### R1 — `apply` supersedes `mutate` on `QuestionModule`; `applyMutatePatch` stays

**Decision:** add `apply(value, ctx) → WorkingCopyPatch` to `QuestionModule`
(`survey/types.ts`, beside `mutate` at :285) and retire the `mutate` field.
`pb_standard_letters`' `mutate` body becomes its `apply`, returning `{ ir: <the same
Partial<KeyboardIR>> }`. The only other non-test `mutate` consumer,
`decisions/impact.ts` `deriveCounterfactual`, re-derives from `apply`'s `ir` channel.
`steps/mutateApply.ts` (`applyMutatePatch`, `MutatePatchContainmentError`) is **not**
renamed or changed: it is the shared containment helper also consumed by deadkey
writes, context tolerance, and carve/add-gallery projection — spec 090's surface.

**Rationale:** FR-001 names a new member with a strictly wider job than `mutate`
(overlay channels, R2); keeping both would leave two write hooks per module — the
exact duplication the series exists to remove. The containment helper, by contrast,
is mechanism, not a per-module hook, and renaming it would churn 090's files for no
behaviour.

**Alternatives considered:** keep `mutate` and let `apply` wrap it (rejected — two
hooks, and new modules would have to guess which to implement); rename
`mutateApply.ts` to `applyPatch.ts` in 089 (rejected — touches deadkey/carve/context-
tolerance call sites that belong to 090).

### R2 — `WorkingCopyPatch` is a channelled patch over the working copy's existing setters

**Decision:** `WorkingCopyPatch` (new, `survey/types.ts`) is a partial record with five
optional channels, each mapping 1:1 to an existing working-copy setter:

| channel | type | setter |
|---|---|---|
| `ir` | `Partial<KeyboardIR>` | merged via `applyMutatePatch(base, ir, writes)` → `setWorkingIR` |
| `identity` | `IdentityPatch` | `setIdentity` |
| `attribution` | `Attribution \| null` | `setAttribution` |
| `helpDocs` | `HelpDocsAnswers \| null` | `setHelpDocs` |
| `historyEntryState` | `HistoryEntryState \| null` | `setHistoryEntryState` |

An absent channel means "no write". `{}` is a valid patch (the track decision's
`apply`, R4). Overlay channels are whole-value replaces, matching today's setter
semantics exactly. Containment: the `ir` channel is checked by `applyMutatePatch`
against the module's `writes` (M3 — whole-patch rejection, `MutatePatchContainmentError`,
SC-003). Overlay channels have no IRPath to check; their containment analogue is the
channel-authorization table in [data-model.md](data-model.md) — the runner rejects an
overlay channel from a module that provides no decision mapped to that channel, with
the same named-error discipline. All channels of one patch apply atomically from the
runner's perspective: the `ir` channel is merged/checked **first**, and if it throws,
no overlay channel is written (the working copy is untouched, US1 scenario 3).

**Rationale:** verified above, none of identity/attribution/help effects are IR
leaves — a `Partial<KeyboardIR>` return (the spec's literal `WorkingCopyPatch` name
left undefined) cannot express FR-004/FR-006. Channelling over the existing setters
keeps projection, draft, and output behaviour bit-for-bit the same while changing
only *who may call them*.

**Alternatives considered:** express identity/attribution as IR patches (rejected —
the overlay fields are not in the IR; `identity` is applied at projection, and moving
it into the IR would change output bytes); give each overlay its own per-module hook
(rejected — five hooks is the `onCommit` sprawl again, typed).

### R3 — The runner: `routeAnswersThroughMutate` becomes `applyDecisionEffects`, unconditional

**Decision:** in `steps/reducer.ts`, `routeAnswersThroughMutate` is renamed
`applyDecisionEffects` and becomes the single runner: for each answer in a completed
result, resolve the module, skip it if it declares no `apply`, otherwise build the
`ApplyContext` and execute the patch through the channel rules of R2. The
`MutateRequest`/`isMutateRequest` indirection is deleted (it existed to smuggle the
module's `mutate` through `applyStepCompletion`'s step-id switch; the runner calls
the patch sink directly). The flag check at `reducer.ts:340` is removed here; the
flag *file* deletion is R7. The runner keeps the reducer's boundary discipline:
`steps/` imports no stores — the patch sink is a new injected `ReducerDeps` entry,
`applyWorkingCopyPatch?: (patch, writes) => void`, wired where `ReducerDeps` is built
(`StudioShell`/`StepHost`), composing `getWorkingIR`/`setWorkingIR` and the four
overlay setters. With no working IR yet, the `ir` channel is skipped exactly as today
(`base === null ⇒ return`, `reducer.ts:342`) and overlay channels still apply —
matching today's identity behaviour, where `setAttribution` fires before any IR
exists for the step.

**Rationale:** FR-002 says the existing function "becomes that runner and runs
unconditionally" — this is the smallest change that satisfies it, and it keeps the
call site (`StepHost.tsx:436`, before advance) that R7 ordering depends on.

**Alternatives considered:** run applies from 088's recording path instead of the
completion path (rejected — recording is audit-shaped, and 088's FR-003 recording
must stay side-effect-free per the reducer's own D-02 note); keep the
`MutateRequest` shape with an `apply` payload (rejected — a discriminator whose only
job was flag-era routing).

### R4 — Composed applies live on the last module of each composition; track's `apply` is empty

**Decision:** three effects today are compositions over several answers, and each
gets exactly one owner module whose `apply` reads its siblings from `ctx.decisions`
(the recorded `DecisionSet`, data-model.md):

- **Identity patch** (`setIdentity` at project_name): owner `project_keyboard_id`
  (it already `requires: ["project-display-name"]`). Its `apply` returns
  `{ identity: { keyboardId, displayName, ...identityLanguagePatch(identity) } }`,
  where `identity` is the derived identity (R6 selector) — the same composition
  `projectNameOptions.onCommit` performs today, including the spec 059 language
  overlay. It does **not** return an `ir` channel: FR-001/US1 scenario 2's
  "`header.name` and `header.keyboardId` are set by `apply`, matching the module's
  declared `writes`" is satisfied through the identity overlay, which is where those
  header values are actually written and projected today (the modules' `writes`
  declarations stay as the decisionIRPaths relation, unchanged).
- **Attribution** (`setAttribution` at identity): owner `il_copyright_holder` (last
  of the attribution chain; already `requires: ["author-name"]`). Its `apply`
  reproduces `extractAttribution`'s rule over `ctx.decisions` (author-name /
  author-email / copyright-holder, holder falling back to author name, `null` when
  no author name) and returns `{ attribution }`.
- **Help docs** (`setHelpDocs` + history action at phase F): owner
  `pf_welcome_paragraph` (the one question `extractHelpDocs` requires to be
  non-blank). Its `apply` runs the `extractHelpDocs` composition over
  `ctx.decisions`' `help-*` values; `undefined` composition ⇒ `{}` (today's
  skip-entirely semantics). When a `help-history-entry` decision is present, the
  same `apply` also returns `historyEntryState` via `applyHistoryEntryAction`
  against the current state read from `ctx` — the onMount derivation
  (`phaseFOptions.onMount`) is **not** an answer write and stays where it is in
  089; it writes through `setHistoryEntryState` directly until a later spec
  re-homes derivations.

`track_choice` gets `apply: () => ({})` — present, explicit, empty (spec edge case:
its working-copy-setup effect moves to 092). The adapt-track `setScaffoldSpec(null)`
in `trackOptions.onCommit` is **not** reproduced as a write: under R6 the scaffold
spec is a selector that returns `null` unless the recorded `authoring-track` is
`copy`, so the consequence follows from the decision itself, as the spec's edge case
requires. Every other `il_*`/`pf_*` module gets **no** `apply` — their decisions are
recorded by 088 and reach output via `outputs`/projection, exactly as today.

**Rationale:** one owner per composition keeps the duplicate-provider discipline
(one decision, one effect) and puts each effect on the module whose `requires`
already orders it last; reading siblings from `ctx.decisions` adds no new
`requires` edges, so flow order (087's derived order + parity tests) cannot move.

**Alternatives considered:** a step-level (non-module) apply for compositions
(rejected — reintroduces step code as a write path, the thing FR-004 deletes);
`apply` on every identity/help module each writing its own slice (rejected —
`setIdentity`/`setHelpDocs` are whole-value replaces; sliced writes would race
within one completion); adding `requires` edges so owners see siblings (rejected —
`requires` drives ordering and gating, not data flow; the DecisionSet in `ctx` is
the data flow).

### R5 — The factory's `extract` stays as pure shaping; `onCommit` is deleted outright

**Decision:** `FlowStepOptions.onCommit` is removed from `makeFlowStepComponent.tsx`
and all three options records. `extract` remains: it is pure (answers → payload,
`undefined` = stay-on-step guard, C2.4) and writes nothing — FR-004's "move into
module `apply`s **or be deleted**" is satisfied for the writes, and the guard
semantics (project_name requires both fields non-empty; phase F forwards the raw
result) survive without a store in sight. `FlowStepDeps` loses `setSelectedTrack`,
`setScaffoldSpec`, `setIdentity`, `setHelpDocs`, `setHistoryEntryState`,
`identityResult`, and `scaffoldSpec`; its seed readers (`getSeedValue`) are re-pointed
at the R6 selectors passed in as plain values, preserving the FR-031 recorded-answer
seeds (a recorded decision *is* the durable record those seeds read).

**Rationale:** the guard is flow control, not an effect; forcing it into `apply`
would make `apply` able to veto completion, contradicting FR-001's pure
`(value, ctx) → patch` shape.

### R6 — FR-005 selectors are pure derivations over `decisionStore`, in `decisions/identitySelectors.ts`

**Decision:** four selectors replace the deleted session state, all pure functions
of the recorded `DecisionSet` (unit-testable without a store, then bound to
088's `decisionStore` with thin zustand selectors):

- `deriveIdentityResult(decisions) → IdentityLiteResult | null` — recomposes what
  `extractIdentityLite` builds from answers (autonym, english, languageSubtag,
  region via `normalizeRegionSubtag`, `bcp47` via `buildTargetBcp47`, `supported`,
  `prefill` via `deriveScriptPrefill`, `attribution` via the R4 rule), reading the
  `language-*`/`target-script`/`author-*`/`copyright-holder` decision values.
  Returns `null` until the identity decisions exist, matching today's
  `identityResult: null` initial state.
- `deriveScaffoldSpec(decisions) → { keyboardId, displayName } | null` — `null`
  unless `authoring-track === "copy"` and both project decisions are recorded
  (this is what retires the adapt-track `setScaffoldSpec(null)` write, R4).
- `deriveSurveyContext(decisions) → SurveyContext` — `contextFromIdentity` moved
  here verbatim (`language_name`, `routing_group`, `script_family`, optional
  `bcp47_tag`, optional `author_contact` per spec 064 FR-016), computed from
  `deriveIdentityResult`.
- `deriveIdentityResume(decisions) → SurveyPhaseResult | null` — rebuilds the
  resume payload `IdentityLiteAdapter` passes as `resume` today from
  `identityPhaseResult`: the recorded identity answers in `SurveyPhaseResult`
  shape. This is the riskiest selector (see Risks) and has its own task + test.

Readers migrate to these selectors: `makeFlowStepComponent` deps, `panelAdapters`
(`IdentityLiteAdapter`, `BaseResolutionAdapter`), `StepHost` advance inputs,
`useKeyboardArtifact` (scaffold call + compile id), `draftPersistence` (the draft's
session slice no longer carries these fields — 088's envelope already dropped
question answers; the traversal slice shrinks accordingly), `projectLabel`,
`confirmRebase.identitySeedFromSession` (renamed in place, reading the selector;
its instantiation-seed role is **not** a question write and is out of FR-006's
letter — the seed is wholesale-replaced by project_name's `apply` on the copy
track and is 092's setup concern thereafter). `setIdentityPhaseResult` and
`setSurveyContext` are deleted with their fields; `selectedTrack` was already
088's to delete.

**Alternatives considered:** keep the session fields as caches written by the
runner (rejected — FR-005: "must not remain stored copies"); put selectors in
`surveySessionStore` as computed getters (rejected — the store is being emptied of
exactly this state; a pure module beside `decisionStore` is testable and matches
088's placement of derived state).

### R7 — Flag deletion is sequenced last and split by OI-1

**Decision:** the runner's flag check is removed in US1's runner task (R3). The
deletion of `flags/mutateFlag.ts` itself, and the un-gating of the four
non-question sites, form the final two tasks of US2 and are **blocked on the
owner's OI-1 ruling** (plan.md). Under a global ruling, each site loses its
`isMutateSeamEnabled()` condition and the flag-parity tests
(`projectWorkingCopyVfs.flagParity.test.ts`, `serializeWorkingCopy.flagParity.test.ts`)
are retired with the flag; under a runner-only ruling, those sites keep reading a
gate and T021/T022 close as partially-unmet FR-003, recorded in the PR body —
the plan does not silently pick either.

### R8 — SC-001 baseline: script first, capture on the pre-089 stacked base, compare bytes

**Decision:** a new Playwright spec `packages/studio/e2e/golden-walk.spec.ts` drives
the copy track from `basic_kbdfr` with fixed answers through identity, choose_base,
track, project_name, the default-advancing middle steps, characters (selecting the
`pb_standard_letters` fixture answer), and help, then downloads the source zip at
output (pattern: `carve.spec.ts:249-270`) and compares it **byte-for-byte** against a
committed baseline zip. Volatile bytes are excluded by construction, not by
normalization: the walk's answers fix every author-visible string, and any zip entry
found to embed a timestamp/version stamp is listed in the spec file with its
evidence before the baseline is accepted (the HISTORY heading version is derived
from the base's own version, `deriveHistoryVersion`, so it is stable for a fixed
base). The baseline is captured **before the first 089 code change**, on this
branch's stacked base (088 as landed — see OI-2), by running the same script with
`GOLDEN_WALK_CAPTURE=1`; the capture run and the verify run are the same code path.
The store-level golden walk (`stepHost.goldenWalk.test.tsx`) remains as the
mutation-sequence oracle: its fixtures are updated **only** where 089 changes the
sequence by design (session setters gone, apply effects in their place), each
fixture diff justified in the commit message — the Playwright byte comparison is
the arbiter when the two disagree.

**Rationale:** SC-001 is explicit that the script is added by this spec and reused
by 090–093; capturing the baseline after changing the write path would make the
criterion circular. Byte comparison over the zip (not a file list, not a hash of
selected entries) is the spec's wording: "source zip byte-identical".

### R9 — The SC-001 baseline is captured with the seam flag ON

**Decision:** the golden-walk capture run executes with `VITE_KM_MUTATE_SEAM=1`
in the dev server's environment; the verify runs after 089 need no flag (there
is none). The capture env is pinned in the spec file header, with this rationale.

**Rationale:** verified — `pb_standard_letters`' patch writes a non-system user
store (`kmStandardLetters`, `pb_standard_letters.ts:99`) that no other code
reads or strips, and the codec's emitter emits orphan non-system stores before
`begin` (`packages/engine/src/codec/emit.ts`, emission-order notes). With the
flag **off** (main's default), that store never reaches the IR, so a flag-off
baseline and US2's unconditional `pb_standard_letters` produce different source
zips: SC-001 and US2 would be mutually unsatisfiable. With the flag **on**, the
baseline already contains every seam behaviour the walk exercises, and 089's
change is purely "the seam is the only path" — byte-identity is then a true
regression oracle. This also matches the flag's own contract
(`flags/mutateFlag.ts`: on = the intended write path; off = the conservative
rollout default, F1/F2).

**Alternatives considered:** capture flag-off and exempt the `kmStandardLetters`
store from the comparison (rejected — SC-001 says byte-identical, and an
exemption carved at capture time would be inherited silently by 090–093);
choose walk answers that never answer `pb_standard_letters` (rejected — the
characters step is on the copy-track walk, and a series oracle that avoids the
one already-live module would miss the point of US2).

## Risks

- **Resume reconstruction (R6).** `IdentityLite`'s `resume` contract consumes a
  `SurveyPhaseResult`; if any resume behaviour depends on answer metadata the
  decision record does not carry (088's record shape is value + provenance +
  inputs), `deriveIdentityResume` cannot reproduce it. Mitigation: the selector
  has a dedicated task with a resume round-trip test through the real component;
  a shortfall is an 088/089 seam finding to surface, not to paper over with a
  retained session field.
- **Ordering inside one completion.** Today's identity writes fire in the adapter
  *before* `onComplete`; under R3/R4 the attribution apply fires in the host,
  after `recordPhase`. `recordPhase` does not read attribution, and advance reads
  decisions (088), so the observable order is preserved — the golden-walk
  mutation-sequence fixture diff (R8) is where any surprise will show.
- **project_name seeds.** FR-031's recorded-answer seeds read `scaffoldSpec`;
  under R6 they read the same facts from decisions. The display-name re-derivation
  ref (`displayNameRef`) is per-mount UI state and is untouched.
- **OI-1 scope.** A global flag ruling pulls carve/touch/projection behaviour
  changes into 089's diff; the golden walk (copy track, fixed answers) may not
  exercise carve/touch deeply enough to arbitrate them — the flag-parity tests
  are the evidence there, and they are deleted by the same ruling, so the ruling
  should be made with that trade-off in view.
