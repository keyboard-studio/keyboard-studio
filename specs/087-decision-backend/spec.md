# Backend Streamlining: Decisions as the Only Unit

**Feature:** specs/087-decision-backend
**Status:** specifying
**Branch:** km/decisions-spike (PR #1938)

The studio asks authors questions, imports base keyboards, and builds new keyboards — but today those are three separate machineries (question lists, a spine manifest, phase registries, an adaptation catalog) that all describe the same flow and must be kept consistent by hand. This spec defines the backend simplification: **one unit — the Decision** — from base-keyboard import through to a compilable new keyboard. A decision is a typed fact about the keyboard (target script, character set, a behavior). Questions ask for decisions, import extracts the same decisions from a base keyboard, and answers write decisions into the new keyboard. Ordering is derived from declared dependencies, never hand-maintained.

Built on the spike (PR #1938), which proved the mechanism with pure functions and a demo page. This spec covers making it real.

## Clarifications

### Session 2026-10-05

- Q: What input bundle does extract() receive — the parsed IR only, or IR plus catalog metadata? → A: IR plus catalog metadata (Option A): extract() receives the parsed KeyboardIR and the catalog entry (id, script, languages); each decision reads from whichever holds it.
- Q: Is the spec-038 adaptation catalog in scope for the unification? → A: In scope (Option A): fold the adaptation catalog's base-keyboard classification into decision extraction; one system answers "what did the base decide".
- Q: Are the retired systems deleted or kept as generated projections? → A: Deleted (Option A): the old order lists, spine flags, and registry fan-out are removed; the decision registry is the single source of order.
- Q: One decision per module, or may a module provide several? → A: Several allowed (Option B, refined): one question module may provide multiple decisions — no forced 1:1:1 correspondence between modules, decisions, and questions. "Influence" (answering one decision changing others' visibility or defaults) is expressed through gating and derived ordering, not through module size.
- Q: What happens to in-flight drafts when the migration lands? → A: Migrate automatically (Option A): drafts saved under the old flow map their answers onto decisions in the new registry at load; answers with no corresponding decision are surfaced visibly for the author to re-answer, never silently dropped.

## User Scenarios & Testing

### User Story 1 — Safe decision foundation (Priority: P1)

As the studio maintainer, I want the decision primitives hardened — validated extraction, one source for conditional routing, typed renderers, a declared link between decisions and what they write — so every later phase builds on ground that fails loudly instead of diverging silently.

**Why this priority:** everything below stands on it; without it the migration forks the architecture. Already in progress.

**Independent Test:** violate each seam deliberately (two providers for one decision, an extract value the question would reject, a duplicated routing predicate) and confirm each fails with a named error or is structurally impossible.

**Acceptance Scenarios:**
- **Given** two question modules provide the same decision, **When** the module set loads, **Then** loading fails naming both modules.
- **Given** a base keyboard yields a value the owning question would reject, **When** extraction runs, **Then** the value is treated as absent and the question is asked normally.
- **Given** a question with conditional visibility, **When** the derived order is computed, **Then** its condition comes from the single declared routing source — no hand-maintained duplicate.

### User Story 2 — Real base-keyboard extraction (Priority: P1)

As a keyboard author adapting an existing keyboard, I want to pick a base keyboard and have the studio determine the decisions its maker took, pre-filling my answers with visible provenance, so I only answer what is new or what I want to change.

**Why this priority:** this is the reason the backend exists — "nothing new under the sun": the decisions are finite and mostly already made in the thousand-keyboard catalog.

**Independent Test:** import a real catalog keyboard; identity, script, and character decisions pre-fill with "from <keyboard>" labels; change one and see it marked changed.

**Acceptance Scenarios:**
- **Given** a base keyboard with language/script metadata, **When** it is imported, **Then** the corresponding decisions pre-fill carrying extracted provenance and the source keyboard's identity.
- **Given** a base keyboard missing some metadata, **When** it is imported, **Then** those questions are asked normally — never silently defaulted, never crashed.
- **Given** pre-filled decisions, **When** the author overrides one, **Then** the diff shows it as changed with the old and new values visible.

### User Story 3 — Decisions build the keyboard (Priority: P2)

As an author, I want my confirmed decisions to actually produce the new keyboard's working definition, so adapting is not just a questionnaire — it yields a keyboard that compiles.

**Why this priority:** the write path turns decisions into the artifact; without it the backend is read-only.

**Independent Test:** complete the adapt flow end to end; the working keyboard definition reflects every confirmed and changed decision; it compiles cleanly.

**Acceptance Scenarios:**
- **Given** a complete decision set, **When** it is applied, **Then** the working keyboard contains exactly those decisions' effects and nothing else.
- **Given** a question that writes outside its declared scope, **When** its answer is applied, **Then** the entire application is rejected (fail-fast), leaving the working copy untouched.

### User Story 4 — One module system (Priority: P2)

As the maintainer, I want the parallel machineries deleted — hand-ordered question lists, the spine manifest, per-phase registry fan-out, and the adaptation catalog's separate base-keyboard classification — leaving the single decision registry as the only source of order, so adding, removing, or reordering a question is one edit and dependency violations surface as named errors.

**Why this priority:** this is the streamlining itself — the complexity the author asked to be rid of.

**Independent Test:** remove a question module from the registry; the studio either reorders cleanly or refuses to load naming the break — never silently misbehaves. The old ordering artifacts are gone.

**Acceptance Scenarios:**
- **Given** the registry with no hand-maintained order, **When** a flow loads, **Then** the derived order matches the previous hand order exactly (parity).
- **Given** a new question declared with its dependencies, **When** it is added, **Then** it takes its derived position with no other edits.
- **Given** a base keyboard, **When** its script posture is needed, **Then** the answer comes from the target-script decision's extraction — never from a parallel classifier.

### User Story 5 — Corpus-derived coverage (Priority: P3)

As the maintainer, I want the decision vocabulary mined from the thousand-keyboard corpus and the submission gates, so the question set is complete by construction rather than by memory.

**Why this priority:** the coverage proof; depends on real extraction existing first.

**Independent Test:** a generated report maps every submission-gate check to the decision that satisfies it; unmapped checks are listed as explicit gaps.

**Acceptance Scenarios:**
- **Given** the keyboard submission gate set, **When** mapped against decisions, **Then** every gate traces to at least one decision.
- **Given** the corpus variance analysis, **When** reviewed, **Then** decisions no keyboard varies are defaulted with provenance, not asked.

## Edge Cases

- A base keyboard with no usable metadata at all: everything is asked, nothing is extracted, nothing crashes.
- An extracted value that fails the owning question's validation: treated as absent (the question is asked).
- Two modules providing the same decision: loud failure naming both — never first-wins-silent.
- Circular dependencies between questions: loud failure naming the cycle.
- A saved draft referencing a decision whose question was later removed: the decision is marked missing and the author re-answers; the draft is never silently wrong.
- A draft saved under the old flow and opened after migration: its answers are mapped onto decisions in the new registry at load; any answer with no corresponding decision is surfaced visibly for the author to re-answer, never silently dropped.
- A question gated out while another question requires its decision: the dependent is treated as missing (asked), and this behavior is pinned by test, not left ambiguous.
- The question-management interface must never be reachable in a deployed build — local developer mode only.

## Requirements › Functional Requirements

- **FR-001:** The system MUST derive question order from declared provides/requires dependencies (topological sort), never from hand-maintained lists or flags.
- **FR-002:** The system MUST fail fast with a named error on unresolved decisions, duplicate providers, and dependency cycles.
- **FR-003:** Every decision MUST carry provenance: asked, extracted (with the source keyboard's identity), or default.
- **FR-004:** Extraction MUST run every extracted value through the owning question's validation; values that fail are treated as absent.
- **FR-005:** Conditional question visibility MUST have exactly one declared source; the same predicate MUST NOT be maintained in two syntaxes.
- **FR-006:** The system MUST import a real base keyboard from the catalog and extract identity, script, and character decisions from the import bundle — the parsed IR plus the catalog entry (id, script, languages) — not from fixtures. Language identity decisions read from catalog metadata where the IR does not carry them.
- **FR-007:** Applying a decision set MUST write exactly the declared effects to the working keyboard; any out-of-scope write MUST reject the whole application (fail-fast).
- **FR-008:** The author MUST be able to add, remove, and reorder questions, with dependency violations surfaced as named errors — never silent misordering.
- **FR-009:** The question-management interface MUST be available only in local developer mode and MUST NOT be reachable in deployed builds.
- **FR-010:** Every submission-gate check SHOULD trace to at least one decision; untraceable checks MUST be listed as explicit gaps.
- **FR-011:** Question renderer components MUST satisfy a single typed props contract.

## Key Entities

- **Decision:** a typed fact about the keyboard (e.g. target script, character inventory). Carries a value and a provenance.
- **DecisionId:** the closed, enumerable vocabulary of decisions. Grows by corpus mining, not by guesswork.
- **QuestionModule:** a question that asks for one or more decisions — and can also extract them from a base keyboard, validate them, and render them. One module, many decisions; the duplicate-provider rule (FR-002) applies per decision, not per module.
- **BaseKeyboardImport:** the import bundle that extraction reads: the parsed KeyboardIR plus the catalog entry (id, script, languages).
- **DecisionDiff:** per-decision comparison of extracted vs. author answers: confirmed, changed, or missing.
- **Provenance:** asked | extracted (with source keyboard) | default. Every decision carries one.

## Success Criteria › Measurable Outcomes

- **SC-001:** An author importing any of 5 sample catalog keyboards sees at least 80% of identity/script/character questions pre-filled with correct source labels (judged against hand-verified expectations).
- **SC-002:** Removing or reordering any single question never produces a silently wrong flow — 100% of injected dependency violations surface as named errors (measured by fault injection across the registry).
- **SC-003:** Zero ordering artifacts remain outside the registry: the old order lists, spine flags, and fan-out files are deleted (not kept as generated projections); the derived order matches the legacy order on every migrated flow (parity check).
- **SC-004:** A completed adapt flow produces a keyboard that passes the studio's own submission gates.
- **SC-005:** Every submission-gate check maps to at least one decision; unmapped checks appear as an explicit gap list, not as unknowns.

**Status (2026-10-06):** SC-002, SC-003, SC-004 and SC-005 are met (SC-003 incl. US4: order lists, spine flags and per-phase registries deleted, parity tests green). SC-002 is measured by a registry-wide fault-injection sweep (all 6 flows plus the step layer: 734 injected faults, 734 named errors — `successCriteria.sc002.test.ts`). SC-004 runs the adapt flow on the same 5 corpus keyboards through 8 real submission gates — projection, Layer A, compile, `.kmp` build, inventory coverage, attribution/licence, Layer C lint and docs — all passing (`successCriteria.sc004*.test.ts`). SC-001 is met: measured at 5/6 = 83% on the 5 corpus keyboards (language-name extractor added; author-name stays author input; followups.md item 3). Adjacent pairs with no dependency between them still use declaration-order tie-breaks, frozen by parity tests (followups.md item 4).

## Assumptions

- Nothing in this spec is a new idea: every capability here exists in some form today (question modules, derived ordering in the Flow Map, the spine manifest, the spec-038 adaptation catalog, the base-keyboard scan). The work is unification into the single Decision unit, not invention.
- The base-keyboard scan already exists; the recon (running in parallel) maps exactly what it recovers per decision so extract() consumes it — the question is wiring, not feasibility.
- The 4 seam fixes (in progress on km/decisions-spike) land first; all later phases build on them.
- Question management stays developer-mode-only per the author's directive; the deployed studio never exposes it.
- Additive-first: legacy systems retire only after parity-proven replacements run alongside them.
- The DecisionId vocabulary starts from the spike's set and grows through corpus mining — no big-bang enumeration.
- "Real base keyboard" means keyboards from the studio's own catalog; obscure hand-built edge cases are out of scope for the first extraction pass.
