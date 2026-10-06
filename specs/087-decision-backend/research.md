# Research: Decisions Backend (specs/087-decision-backend)

## R1 — Condition evaluation for derived gating (settled in Phase 1)

**Decision:** `gatedByFromNext(target, modules)` inverts the routing graph: for a target question it collects every `FlowGotoRule` across modules whose `goto` names the target, building clauses of (provider decision, positive condition, preceding negative conditions). At runtime each clause evaluates its condition string against the provider decision's value via `evalAgainstDecision`; an unmappable condition fails **open** per condition (the question is shown — never silently dropped). Update after review: the clause model was rewritten as graph visibility (visible iff a root or a visible predecessor's edge holds, forward fixpoint so cycles are safe), and the hand-written `gatedBy` override was deleted.

**Rationale:** FR-005 demands one routing source; reusing the runner's condition language (rather than inventing a DecisionId-keyed DSL) keeps exactly one condition semantics. Fail-open is the safe direction for a question the author should answer.

**Alternatives considered:** a new DecisionId-keyed condition DSL (rejected — two syntaxes again, the duplication the review caught); hand-written `gatedBy` on every conditional module (rejected — same duplication by hand).

**Follow-up from Q4:** the implementation reads `m.provides` as singular; widening `provides` to a list requires clauses keyed per provided decision. Small, tracked as plan consequence.

## R2 — Draft migration mapping

**Decision:** at load, a draft's persisted answer-keys map onto DecisionIds through a static, registry-versioned migration table (`oldAnswerKey → DecisionId`); answers with no mapping surface visibly for re-answer, never silently dropped (Q5 chose automatic migration).

**Rationale:** Q5's automatic migration plus the project's "never silently wrong" rule — visible orphans are the honest failure mode.

**Alternatives considered:** grandfathering old drafts on the legacy flow (rejected by the author in Q5); dropping unmappable answers (rejected — silent loss).

## R3 — Corpus mining methodology (US5)

**Decision:** enumerate the DecisionId vocabulary by (a) running a catalog sample through the existing import pipeline and recording per-decision variance — which decisions actually differ across keyboards — and (b) mapping each keyboard-lint submission gate to the decision(s) that satisfy it. Decisions no keyboard varies become defaults with provenance; unmapped gates become the explicit gap list (SC-005).

**Rationale:** the author's "nothing new under the sun" — the vocabulary is discovered from the thousand-keyboard corpus and the gates, not invented.

**Alternatives considered:** hand-authoring the full vocabulary up front (rejected — unbounded and ungrounded); mining only the gates (rejected — misses author-facing decisions the gates don't check).

## R4 — Retirement sequencing (US4)

**Decision:** retire in risk order — (1) per-phase registry fan-out → registration by decision id (mechanical), (2) thin YAML order lists → deleted (Q3), (3) `adaptation/firing.ts` classification → folded into target-script extraction provenance (Q2), (4) manifest spine → derived from step `provides`/`requires` (the flags deleted, not kept as a projection), last. Each wave ships only with its parity test green. All four waves have landed (tasks.md Phase 9).

**Rationale:** smallest blast radius first; the constitution-named manifest (Article IX) moves last, after the replacement has proven itself running alongside.

**Alternatives considered:** big-bang deletion (rejected — violates additive-first and "don't break what already works").

## R5 — Write path (mutate seam, T014)

**Decision:** answers apply through the existing reducer at step completion → `mutateApply`: validate the returned patch stays within the module's declared `writes`, apply as a path-scoped deep merge, fail-fast whole-patch rejection on violation — the contract already ratified in `survey/types.ts`.

**Rationale:** the seam's contract is specified and reviewed; the remaining work is building the apply path, not redesigning it.

**Alternatives considered:** direct IR writes from components (rejected — bypasses declared-writes containment, the exact guarantee FR-007 requires).
