# Phase 0 Research: En-Masse Adaptation Preference Questions

**Feature**: 038-adaptation-questions | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

This records the design decisions the plan leaves open, grounded in the code that
exists today. Each entry is **Decision / Rationale / Alternatives considered**.
Findings from the codebase investigation are woven in.

## Codebase findings (the attach points)

- **Survey questions are per-question TS modules**, not raw YAML rows. Each lives
  at `packages/studio/src/survey/questions/{a,b,f,g}/<id>.ts` and exports a
  `definition` (a `FlowQuestion`: `id`, `prompt`, `help_text`, `type`, `options`,
  `required`, `next`), a `validate`, `fixtures`, and a default `QuestionModule`.
  They are registered in `registry.<phase>.ts`. A thin flow YAML
  (`content/flows/*.modular.yaml`) lists only the ordered question ids; the
  definitions live in the modules.
- **`pnpm facet-lint` keys off real survey question ids.** Check F4 requires
  every `consumers.prefills` entry in `content/facets/**` to resolve to an id
  under `packages/studio/src/survey/questions/`. SC-001's "facet-lint consumer
  checks" therefore forces the catalog's rendered questions to exist as **real
  registered survey modules** — a catalog of paper ids would fail the lint.
- **§3c confirmation surfaces already exist** as a pattern: `Prefill.tsx`
  (`PrefillRow { label, value, note }`, where `note` is the provenance hint) and
  the identity-lite / Phase A confirmation flow (`IdentityLite.tsx`,
  `PhaseA.tsx`, `SurveyRunner.tsx` all carry provenance handling). There is **no
  inheritance-posture step** today — grep for "posture" finds only facet records
  and unrelated axis-lock code. That is the engine touchpoint the spec's
  Assumptions predicted.
- **The evidence is the facet index.** `keyboard-facets/{script,
  strategy-fingerprint, target-mix}.yaml` are the keyboard-level classified
  facets (036/037); the committed artifact is `docs/keyboard-facet-index.json`.
  Session-side facets in `content/facets/**` (e.g.
  `community/multi-orthography.yaml`, `lineage/siblings.yaml`,
  `lineage/strategy-fingerprint.yaml`, `env/device-mix.yaml`) already declare
  `consumers`/`derivations` and are the records FR-008 updates.

## Decision 1 — Where the question catalog lives

**Decision**: The catalog is a **content-owned data set** — one YAML record per
question under a new `content/adaptation-questions/` directory — carrying the full
Question-record shape (id, elicited preference, firing condition, prefill facets,
provenance text, consumers, no-evidence degradation, scope). Each question that
*renders* in the survey is **also** a real survey question module under
`packages/studio/src/survey/questions/b/`, and the catalog record's `id` equals
that module id. A small plain-node lint (mirroring `facet-lint`) validates the
catalog.

**Rationale**: The `FlowQuestion` type has no home for firing-condition, scope, or
no-evidence-degradation metadata (FR-001), and those fields are exactly the
"en-masse" contract the spec asks to pin. Keeping them in a content data file
(a) matches the existing facet-catalog convention the spec cites, (b) keeps the
metadata content-team-owned (Article VI), and (c) leaves the survey module as the
thin rendering layer. The dual representation is the same split already in use for
flows (thin YAML + rich TS module) and facets (record + consumer wiring).

**Alternatives considered**:
- *Fields on the survey module* — rejected: pollutes the engine-owned
  `FlowQuestion` type with content-policy metadata and gives workflow-scoped
  trust policies (which aren't survey questions in the classic sense) no home.
- *Extend the facet records* — rejected: a facet is the *signal*; a question is
  the *elicitation*. Overloading `content/facets/**` with question policy blurs
  the "facet feeds question" relationship the consumers convention depends on.
- *Spec-only enumeration (no data file)* — rejected: SC-001 requires facet-lint
  to pass against real ids, and FR-007 needs a machine-readable record; a prose
  list satisfies neither.

## Decision 2 — The engine touchpoint: one new confirmation surface

**Decision**: The only new engine surface is the **inheritance-posture step** — a
`Prefill.tsx`-style component rendering the US2 keep/propose/discard confirmations
per facet, plus a pure `buildPostureRows(...)` builder. Script-alignment (US1)
confirmations extend the existing `Prefill.tsx` rows rather than adding a surface.
Trust policy (US3) renders as ordinary radio/scalar questions in the flow (no new
surface).

**Rationale**: The Assumptions section names the inheritance-posture step as "the
likely case" of a missing surface and everything else as reusable. Minimizing new
surface area keeps the change inside the §3c pattern already proven by
`Prefill.tsx` and honors "this feature adds question content and wiring, not a new
questionnaire engine."

**Alternatives considered**: A generic "posture matrix" component reused for all
three families — rejected as over-engineering for a v1 floor of 9 questions; the
three families have genuinely different shapes (spread evidence vs per-facet
lever vs policy dial).

## Decision 3 — Firing conditions read the index behind a mockable seam

**Decision**: A pure `evaluateFiringConditions(evidence, policy) → FiredQuestion[]`
module takes an **injected evidence bundle** (the relevant slice of the facet
index for the target language/base) and the trust policy, and returns which
catalog questions fire and their prefills. The studio's real evidence provider and
the test mock both satisfy the same `AdaptationEvidence` interface.

**Rationale**: 036/037 land the index but wiring the studio's *consumption* of it
into ranking is explicitly a **follow-up feature** (Out of Scope). An injected
seam lets US1–US3 be authored, unit-tested, and walked with a mocked index now
(Independent Tests all say "mocked index"), without waiting on the live wiring.
It also matches the engine convention of injected deps (the glottolog bridge
takes injected deps; classifiers take injected reference data).

**Alternatives considered**: Read `docs/keyboard-facet-index.json` directly in the
firing evaluator — rejected: couples the studio to the artifact path, defeats the
mocked-index tests, and pre-empts the follow-up wiring feature's design.

## Decision 4 — Firing-condition semantics: "always" is banned

**Decision**: Every catalog record declares a `firingCondition` (an evidence-state
predicate string, e.g. `sibling-script-spread > 1`, `dominant-script-disagreement`,
`base-classified-desktop-only && device-mix-includes-touch`) and a
`noEvidenceDegradation` (`ask-plainly` | `record-no-default`). The catalog lint
**rejects** `firingCondition: always`. Confident-agreement produces a
pre-confirmed §3c chip, not a question (US1 scenario 4, SC-002).

**Rationale**: SC-002/SC-003 and the "question fatigue" edge case make
non-interruption the headline quality bar; encoding it as a lint invariant makes
"no confirmation spam" mechanically enforced rather than a review nicety. The
predicate grammar is deliberately loose strings at candidate stage, mirroring the
`source/` facet `houseTargetPolicy.when` convention.

**Alternatives considered**: Structured predicate AST — rejected as premature; the
`source/` family already ships loose string predicates at candidate status and
formalizes only on graduation.

## Decision 5 — Confirmation/override event recording (FR-007)

**Decision**: Confirmations and overrides of facet-derived prefills are appended
to the session store as `ConfirmationEvent` records
(`{ questionId, facetIds, prefilledValue, finalValue, action: confirmed|overridden,
provenanceTier, at }`), written through a single `recordConfirmation(...)` engine
function. The shape is chosen to be consumable by the facet catalog's evaluation
harness (predictive-lift input) without this feature building the harness.

**Rationale**: FR-007 and SC-006 require the events in a harness-readable form;
the facet README's lifecycle ("promotion is a measurement") names confirmations/
overrides as the lift signal. A single writer keeps the recording consistent and
mirrors the "one writer" discipline used elsewhere (e.g. the context writer).

**Alternatives considered**: Emit events straight into the facet records' `metrics`
— rejected: `metrics` is "written by the evaluation harness, not by hand"
(README); the studio produces raw events, the harness aggregates.

## Decision 6 — Scope persistence (session vs workflow)

**Decision**: Every catalog record declares `scope: session | workflow`.
Session-scoped answers use the studio's existing per-session survey state.
Workflow-scoped trust policies (US3) persist via the same session-store mechanism
keyed by a workflow id where one exists, and **degrade to session-scoped** where
no multi-session workflow context exists (Assumptions permit deferring true
curator profiles). FR-006's "scoped explicitly in the catalog" is satisfied by the
record field; the runtime honors workflow scope opportunistically.

**Rationale**: The Assumptions explicitly allow deferring true multi-session
curator profiles "without breaking this spec (the questions still function
session-scoped)." Declaring scope in the catalog now keeps the contract honest;
implementing full cross-session persistence is not gated on this feature.

**Alternatives considered**: Build cross-session curator profiles now — rejected as
out of scope per Assumptions and the "multi-keyboard batch UI" Out-of-Scope entry.

## Decision 7 — Named-orthography joins stay opt-in (FR-009)

**Decision**: Q-TP3 (orthography-join) is the **only** path by which a named
orthography label (e.g. Ajami) enters a proposal, and only as a session-scoped
author-confirmed opt-in join of `script-classification × language-identity`. No
classifier or firing condition ever emits the label unconfirmed.

**Rationale**: FR-009 and spec 037's classifier boundary forbid unconfirmed
orthography labels; making the join a discrete opt-in question is the cleanest
enforcement and keeps 037's classifiers label-free.

**Alternatives considered**: Auto-label Arab-script keyboards for known Ajami
families — rejected outright by FR-009.
