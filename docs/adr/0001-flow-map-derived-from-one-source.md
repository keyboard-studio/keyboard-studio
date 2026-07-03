---
status: accepted
date: 2026-07-01
---

# Flow Map is derived from the single set of step definitions the runtime executes

> **This decision is already realized in the codebase.** It is the load-bearing
> invariant of `docs/design-notes/question-unification-migration-plan.md` §1 and is
> executed by the `qu-*` spec suite (`specs/015`–`023`). Phase 1 (map projection, drift
> guardrail, declare-steps, wire track/prefill/buildlist/galleries) is **merged to
> main**; the Phase A → reserve/library demotion is **spec 022**, coded on branch
> `km/qu-022-library-demote` and **not yet merged**. This ADR records *why*; the plan and
> specs are the authoritative execution. It is not a competing plan.

## Context

The Flow Map was drifting from the survey it claims to depict. Investigation found it
is assembled from **three** representations, only one of which the runtime shares:

1. `steps/manifest.ts` — step ordering + spine/lock. Shared with the runtime (for
   ordering only).
2. `FLOW_SOURCES` (a hand-maintained list of `content/flows/*.modular.yaml`) — the
   drill-down questions. **Not consumed by the runtime.**
3. The imperative body of `SurveyView` — what actually mounts (IdentityLite, Prefill,
   PhaseB, the galleries). **Not read by the map.**

Because `FLOW_SOURCES` is parallel to the runtime, it listed `phase_a_identity`
(a ~45-question identity/provenance battery) that the runtime never runs — it runs the
5-question `IdentityLite` instead. The map painted a **phantom** Phase A. Conversely,
the team's mature editor units (carve/mechanism/touch galleries) had been invisible
until #887 wired them in from the manifest.

## Decision

The Flow Map is a **static structural graph, mechanically derived from the one set of
step definitions the runtime executes** — not a live per-session trace, and not a
separately-maintained diagram.

Concretely (the *targeted* mechanism, deliberately not a full runner rewrite):

- **Each question-bearing step declares the exact sub-flow it runs.** The runtime
  mounts that sub-flow and the map draws its drill-down from the **same** declaration.
  The runtime component must be *fed* the declared sub-flow, not hardcode its own — the
  declaration and the mounted flow cannot be two things.
- **`FLOW_SOURCES` is retired.** The map's drill-down inputs are derived by walking the
  steps and collecting their declared sub-flows. There is no second list to drift.
- **Editor units (galleries, panels) stay opaque nodes.** The map shows *that they
  exist* and *their declared IR writes/locks*; it does not see inside them. This is
  correct for the derived model and is what #887 already delivers.
- **Reserve / library is shown separately, never mixed into live flow.** A registered
  step/question not referenced by any live step is reserve — browsable and promotable,
  never deleted, and drawn in a clearly-separated section (this is where the Phase A
  provenance battery lands).
- **A model seam for a future per-character loop is reserved, not built.** The step
  model should admit "this step iterates over a collection" so the eventual
  ask-then-place-per-character loop is a promotion, not another re-architecture. Today's
  reality (batch: ask-all then place-all; galleries loop internally) is what the map
  depicts now.

## Considered options

- **Live per-session trace** (instrument the running survey). Rejected: the goal is
  "cannot get out of date," which a single derived source achieves structurally; a
  trace answers a different question (where-am-I) and adds a second mechanism.
- **Full generic manifest-driven runner** (SurveyView has zero hardcoded step logic).
  Rejected *for now*: this is the large rewrite that has failed here repeatedly. The
  targeted mechanism reaches single-source without the blast radius.
- **Guardrail test** (keep two sources, fail CI when they diverge). Rejected: that is
  "cannot drift silently," weaker than the chosen "cannot drift by construction."

## Consequences

- The phantom Phase A disappears from the live map by construction; it reappears
  (correctly) in the reserve section.
- `FLOW_SOURCES` and any test asserting map-internal composition against it must be
  reworked to the derived form.
- The map shows **declared** IR writes, which is structural intent, not proof of
  execution. Whether declared == executed depends on the `mutate()` seam, which is a
  **separate track** (today ~50% done, off by default, galleries bypass it). This ADR
  does not address write execution.
