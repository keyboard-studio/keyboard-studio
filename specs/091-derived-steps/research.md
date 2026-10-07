# Research: Steps derived from decisions (spec 091)

Phase 0 for [spec.md](spec.md). All findings verified against the code on this
branch's base (`main` at 18e63aa4, plus the series specs 088–090, which land
below 091 in the stack and whose end-state this plan is written against).

## What 087 already derived — and what it did not

**Decision:** 091 does not build a new sort. It builds a new *partition*.

**Rationale:** Spec 087 already derives **order** twice over with the one sort,
[orderDecisions.ts](../../../packages/studio/src/decisions/orderDecisions.ts)
`orderByDependencies` (Kahn, stable tie-break on input order, fail-fast on
duplicate providers, unresolved requirements and cycles):

- questions within a flow: `orderDecisions(modules)` via
  [loadDerivedFlow.ts](../../../packages/studio/src/survey/loadDerivedFlow.ts);
- wizard steps: `orderSteps` in
  [stepOrder.ts](../../../packages/studio/src/steps/stepOrder.ts) over the
  step-level declarations in
  [stepDependencies.ts](../../../packages/studio/src/steps/stepDependencies.ts).

What is **not** derived is step **membership**: which questions a step shows.
That comes from `flowRefs` — `identity: { flowRefs: ["identity_lite"] }`,
`characters: { flowRefs: ["phase_b_characters"], settles: [...] }`, etc. — and
from `settles` strings naming decisions no module provides (until 090 gives
each a module). 091's work is: take the single derived order of **all**
decision modules (post-090, every decision has one), and partition it into
screens. The sort, the duplicate-provider rule and the cycle errors are
reused unchanged.

**Alternatives considered:** a second, screen-level sort over "screen nodes"
(rejected — two sorts is exactly the duplication the series exists to remove;
constitution Article IX names the one sort); deriving screens from `Step`
declarations in the manifest (rejected — the manifest is an unordered pool of
component declarations by design, and membership-by-step is the thing being
retired).

## The module set the derivation consumes

**Decision:** the derivation consumes one flat, declaration-ordered list of
decision modules: the question modules of
[registry.ts](../../../packages/studio/src/survey/questions/registry.ts) plus
the gallery/picker modules 090 creates for every `settles` name. Declaration
order in that list is the tie-break input, exactly as registry key order is
today (087 followups item 4 inventories the tie-break-decided pairs).

**Rationale:** `orderByDependencies` needs a single input list whose order is
the documented tie-break. Today the inputs are per-flow lists
(`flowModules.identity_lite`, `.track`, `.project_name`,
`.phase_b_characters`, `.phase_f_helpdocs`, plus reserve/demoted sets that are
not live flow members). If 090 has not already exposed the union as one
ordered list, 091 adds it to `registry.ts` as a pure concatenation in
declaration order, documented as carrying no semantics beyond the tie-break.

**Note on renderer discrimination:** at base, `QuestionModule.renderer` is
`"default" | Component` ([types.ts](../../../packages/studio/src/survey/types.ts):334).
090 FR-001 renames the question case to `"question"`. The partition keys off
"component vs. question renderer", whichever spelling 090 lands; the plan
uses the spec's word, *question renderer*.

## Screen formation rule

**Decision:** partition the derived decision order into maximal runs:

- a decision whose module has a **component renderer** forms a singleton
  screen;
- a maximal run of consecutive **question-renderer** decisions forms one
  screen, keyed by their shared `group` hint (FR-002). A run whose members
  disagree on `group` is split at the disagreement — the group keys the
  screen, so a run cannot carry two keys.

**Rationale:** this reproduces today's wizard at the granularity the shell
sees. Today's 18 steps (see the inventory below) are: flow steps whose
screens are one SurveyRunner over one flow (identity, track, project_name —
each becomes one question screen under groups `"identity"`, `"track"`,
`"project_name"`), and custom steps, each a singleton (layout, choose_base,
characters, marks, punctuation, invisibles, convenience, carve, deadkeys,
rules, mechanisms, touch_seed_source, touch, help, package). US3's split case
falls out of the rule: a question decision re-placed by a new `requires` edge
into the middle of another group — or a custom decision landing inside a
group's run — splits the run into two screens that share the group label.

**The two flows that run inside custom renderers.** `phase_b_characters`
runs inside the `characters` step (CharactersStep wraps prefill + the Phase B
SurveyRunner) and `phase_f_helpdocs` inside the `help` step's PhaseFGate.
Their question modules are *intra-step* screens, not wizard steps. Two-level
treatment, chosen: those modules declare `group` naming the enclosing custom
screen (`"characters"`, `"help"`) and the top-level partition does not
promote them — the enclosing custom decision's singleton screen owns them,
and their internal order still comes from `orderDecisions` over the flow's
modules, unchanged. The alternative (uniform single-level partition) was
rejected: it would surface Phase B questions as top-level wizard screens
split from the characters step's prefill/build-list sub-screens and change
the visible wizard, violating SC-002. This is the one place the partition is
not purely a function of renderer kind, and it is declared per module
(`group`), never hard-coded per flow in the derivation.

## Gates on modules, screens from gates (FR-003)

**Decision:** `gatedBy` lives on modules post-091. Question modules already
have an effective gate derived from routing (`effectiveGatedBy` /
`gatedByFromNext` in orderDecisions.ts, the single routing source since 087).
Custom-UI modules declare theirs (090 gives them modules; the two step-level
gates that exist today move: `project_name`'s copy-track gate is already a
property of its questions' routing, and `touch_seed_source`'s
"asked only while unrecorded" gate moves onto its module). A **screen's**
gate is derived: a screen is skipped when **every** decision on it is gated
off (spec edge case). Side-trail structure is re-derived over screens by the
existing `deriveStepStructure` logic (a gated screen rejoins at the next
ungated screen), preserving the frozen trails: `project_name → characters`,
`touch_seed_source → touch`.

**Rationale:** gates evaluated per decision against the live `decisionStore`
(088) keep one source: routing for questions, module declaration for custom
decisions, screen visibility as a pure function of member gates. The current
`Step.gatedBy` and `resolveLocation.ts`'s `walkedByTrack` read the step's
gate; both move to the derived screen gate.

## Derived screen ids and the legacy-id inventory (FR-004, SC-005)

**Decision:** a screen's id is derived from its key: the `group` for a
question screen, and for a singleton the owning module's declared screen key
(seeded with today's step names — `carve`, `marks`, `touch`, … — when 090's
modules are declared, so most ids do not change spelling). Ids are display
and addressing metadata only; answers are keyed by decision id since 088, so
no data moves. A **legacy resolver** maps any pre-091 step id to the screen
that now holds that step's decisions; it is consulted by
[location.ts](../../../packages/studio/src/lib/location.ts) /
[resolveLocation.ts](../../../packages/studio/src/lib/resolveLocation.ts)
(deep links, spec 081 footer/jump navigation) and by restored-draft history
sanitising (`surveySessionStore`), which both hold step ids.

**The inventory SC-005 is checked against** — every step id declared on
`main` at 18e63aa4 (from `stepDependencies.ts` DECLARATIONS at that commit,
18 ids, in derived order as frozen in `stepOrder.parity.test.ts`):

`identity`, `layout`, `choose_base`, `track`, `project_name`, `characters`,
`marks`, `punctuation`, `invisibles`, `convenience`, `carve`, `deadkeys`,
`rules`, `mechanisms`, `touch_seed_source`, `touch`, `help`, `package`.

Plus two addressable non-manifest ids the location model also carries:
`done` and `unsupported` (terminals in StepHost / ActiveStepId). They are not
screens and need no mapping, but the SC-005 test inventory lists them so the
resolver's pass-through is pinned.

**Alternatives considered:** screen id = decision id for singletons
(`carved-layout`, `marks-treatment`) — rejected: it renames every deep link
and history entry for no benefit, and FR-004 calls the ids *display* ids;
the group/screen-key seeding keeps the author's visible vocabulary stable.

## The `package` screen has no decision

**Decision (plan-level, flagged as an open question for implementation
kickoff):** `package` settles nothing and, after 090, still has no decision
module (it is not among 090's fourteen). It is treated as a **terminal
screen**: declared in the manifest pool as a component declaration with no
ordering fields, appended after the last derived screen — the same status
`done`/`unsupported` already have as terminals. Its current step-level
`requires: ["help-docs"]` is not re-homed onto a module; terminal position is
structural, not decision-placed.

**Rationale:** inventing a `packaging` decision to satisfy the partition
would create a decision nobody asks, extracts or defaults — against the
series rule that every decision is asked/extracted/defaulted with provenance.
If the owner prefers a real module, that is a one-line change to this
decision at kickoff, before tasks are dispatched.

## The parity rewrite (FR-005)

**Decision:** the step-level parity oracle changes its question. Today
[stepOrder.parity.test.ts](../../../packages/studio/src/steps/stepOrder.parity.test.ts)
freezes literal order, side trails, join targets, lock order and Flow Map
edges "as the oracle; do not regenerate". FR-005 explicitly retires that
stance for steps. The rewrite keeps a frozen **baseline** — the screen
sequence and per-screen membership captured from `main` at 18e63aa4 (the
FROZEN_* literals already in that file, carried over as baseline data) — and
asserts:

1. the derived screens equal the baseline **unless** a `requires` edge in the
   current declarations orders a pair differently, in which case the edge
   wins and the pair is reported as edge-explained;
2. every adjacent pair in the derived order is *explained*: either a
   requires-chain orders it, or it is a documented tie-break pair decided by
   declaration order (the FROZEN_TIE_BREAK_PAIRS mechanism, kept);
3. the adversarial-input property (reversed/rotated inputs preserve every
   dependency-ordered pair) is kept, run over screens.

[manifest.test.ts](../../../packages/studio/src/steps/manifest.test.ts)'s M2
(main-line order) becomes self-consistency (manifest order = derived screen
order); M3 locks, M4/M4b trails, M5 unique ids, M6 stay — evaluated over
screens. The question-level parity tests are **not** frozen step lists and
are out of FR-005's scope:
[orderParity.test.ts](../../../packages/studio/src/decisions/orderParity.test.ts)
(per-flow derived question order vs. the deleted YAML) stays unmodified;
[gateWalkParity.test.ts](../../../packages/studio/src/decisions/gateWalkParity.test.ts)
keeps its property (derived gates select exactly the walked set) but iterates
derived question screens instead of `flowSources` flows once flows stop
being the membership unit.

**Rationale:** the baseline stays as regression data (a silent reorder still
fails), but the *authority* moves to the declarations: an intentional
`requires` edit changes the expected order through the edge-explanation rule
instead of failing against a literal list nobody may touch. That is the
whole point of US1.

## Consumers that must move off `stepDependencies.ts`

Verified by grep on the base; each is a task in tasks.md:

- [manifest.ts](../../../packages/studio/src/steps/manifest.ts) — spreads
  `stepDependencies(...)` onto pool steps (characters inline; the rest via
  registerEditorSteps), sorts the pool by STEP_ORDER, asserts pool ≡
  declared set.
- [registerEditorSteps.ts](../../../packages/studio/src/steps/registerEditorSteps.ts)
  and [rulesStep.ts](../../../packages/studio/src/steps/rulesStep.ts) — the
  remaining spreads.
- [stepOrder.ts](../../../packages/studio/src/steps/stepOrder.ts) —
  STEP_ORDER / STEP_TRAILS become derived from screens, not step
  declarations. `workingCopyStore.ts` (STEP_ORDER.indexOf ranking) and
  `advance.ts` consume them unchanged in shape.
- [types.ts](../../../packages/studio/src/steps/types.ts) — `Step` loses
  `provides` / `requires` / `gatedBy` / `flowRefs` (ordering fields), keeps
  component, inputs, writes, persistence, specRef, lock, layout.
- [renderedNodeSet.ts](../../../packages/studio/src/dashboard/renderedNodeSet.ts)
  and [flowSources.ts](../../../packages/studio/src/steps/flowSources.ts) —
  Flow Map drill-downs read `step.flowRefs`; they move to the derived
  screens' decision/module membership. Flow liveness ("referenced by a step
  via flowRefs") is re-derived from screen membership.
- [stageGroups.ts](../../../packages/studio/src/decisions/stageGroups.ts) —
  decision-trail stages group by manifest step; stages become screens (the
  step id recorded on entries is display metadata since 088 FR-008, so this
  follows the screen list, no data migration).
- `progressDots.ts` and the footer navigation (spec 081) read the screen
  list/order through the manifest — shape unchanged, source becomes derived
  screens.

## Measurement (series lesson from 087)

Every success criterion is measured in the live app: SC-001 as a store-level
test driving the real `StepHost` with a test registry, SC-002 as a live
`pnpm dev` walk compared screen-by-screen against `main`, SC-003 via the
golden walk added by 089 (byte-identical source zip). Results from
`DecisionsDemo` or `sc004Harness` do not count.
