# Keyboard Studio Constitution

The gates that govern new feature work in keyboard-studio. Every `/speckit-plan`
MUST pass a Constitution Check against the Articles below before tasks are
generated. This file is short on purpose: it states what must always be true,
and where the authority for everything else lives.

## Precedence — by topic, not by document

No single document wins every conflict. Each topic has one authority:

| Topic | Authority |
|---|---|
| Pattern contract | The TypeScript type in `packages/contracts` + [specs/005](../../specs/005-pattern-schema/spec.md) |
| State, storage, and order model | Articles III and IX of this constitution |
| A feature's behaviour | Its spec under `specs/`; once shipped, its AS-BUILT + the code |
| Criteria — counts and content | The data: `packages/contracts/data/criteria.json`. Prose MUST match what the data computes; a stated number that disagrees with the data is a bug |
| Product rulings | The recorded ruling (issue or spec amendment) beats spec text; spec text beats doc prose |
| Anything else | The newest dated, code-verified statement wins provisionally. The conflict is filed as a bug and closed by amending the losing text — never by appending a correction beside it |

`docs/spec-signoff.md` is a historical record of the June 2026 review of a
draft that no longer exists. It governs nothing.

## Core Principles

### I. Pattern schema is a locked contract
The `Pattern` TS interface — canonical in `packages/contracts/src/pattern.ts`,
specified in [`specs/005-pattern-schema/spec.md`](../../specs/005-pattern-schema/spec.md)
— its field names, types, and `{{slotId}}` placeholder syntax are immutable.
Any rename, type change, or removal requires a **major version bump of
`@keyboard-studio/contracts` and a joint engine+content session** (spec §18).
The type is mirrored by a runtime zod schema (`packages/contracts/src/schemas.ts`) with compile-time drift guards;
any edit to a locked field MUST update its schema in the same change. A plan
that proposes editing the schema MUST stop and escalate rather than proceed.

### II. KeyboardIR is the engine spine
All scaffolding, import, validation, and mutation operate on the typed
`KeyboardIR`, never on raw `.kmn` text (`scaffold()` is `parse → scaffoldIR →
emit`). Constructs the codec cannot model are preserved as opaque
`RawKmnFragment` nodes and are **never silently dropped**. A base the codec
cannot parse fails the whole scaffold — no try/catch around `parse()`.

### III. State model — one working copy, decisions as live truth, drafts save the envelope
One working copy exists per project (Track 1 `instantiateFromBase`, Track 2
`instantiateFromExisting`). Within a session it is **recalculated from the
project's decisions**: a changed decision recalculates its downstream closure
and replays from the checkpoint before it (spec 093); incremental `apply` at a
step's completion and replay MUST agree, and replay installs the result.
Persistence is the **draft envelope**, and it saves more than the decisions:
the starting point, a working-copy snapshot, the decision set, the spec-053
decision record, and per-feature slices (survey answers, testing, criteria).
A reload restores from that envelope; decisions-only drafts are **not** the
shipped model, and no plan may assume them. Scoped truths, to end the
collisions of unscoped ones:

| Question | Source of truth |
|---|---|
| What renders / emits | The KeyboardIR working copy |
| What the author decided (live) | The decision set (spec 088) |
| What is saved | The draft envelope (this Article) |
| What happened, in order | The decision record (spec 053) — audit, not live state |
| Where the author is | The survey session store (spec 026) — traversal only |

The two decision formats (053 record, 088 set) have different provenance
vocabularies; a plan that touches one MUST state how it maps to the other.

### IV. Validator layering is fixed (spec §10)
Layer A validity and Layer B style live in `engine/src/validator`, alongside
the Layer A′ import-fidelity checks I1–I6. Layer C hygiene is
`@keymanapp/keyboard-lint`. There is exactly **one 300 ms debounce cycle**
(decision D3) for anything that turns edits into diagnostics: the TS check
and the WASM `kmcmplib` oracle run as concurrent microtasks within it.
Persistence and sync timers emit no diagnostics and are outside D3. A plan
MUST NOT introduce a second diagnostic timer or a parallel validation path.

### V. VirtualFS only during authoring (spec §11)
All authoring happens in an in-memory FS mirroring the `keymanapp/keyboards`
layout. The studio **never writes to host disk during authoring**; drafts
persist to the draft store (Article III). Output is serialized at the end, to
a `.zip` (`engine/src/output`) or via the GitHub delivery path.

### VI. Team boundaries (spec §12 / §13)
Engine owns the SPA, scaffolder, compiler service, validator, and output
paths. Content owns the pattern library, survey text, gallery ordering, LLM
prompts, and criteria triage. Every plan MUST declare which team owns the
change and stay within that boundary.

### VII. Out of scope for v1 (spec §16)
Plans MUST NOT implement: CJK/Ethiopic reorder patterns, LDML output,
mobile-app integration, hosting, multi-language `welcome.htm` variants,
`.kpj.user` management, touch-first authoring, multi-source merge,
survey-editing of opaque `RawKmnFragment`, or byte-identical round-trip.
Three-group routing renders the "not yet supported" stub for CJK/Ethiopic —
it never silently empties the gallery. Adapting the studio's *host layout*
to mobile viewports (the #1853 epic) is in scope; touch-first *authoring*
remains out.

### VIII. House conventions
No emoji in console output — use `[OK]`, `[WARN]`, `[ERROR]`. File references
in user-facing text use markdown links (`[spec.md](spec.md)`), not backticks.
Do not cite GitHub issue numbers inside shipped code or comments — cross-link
via commit messages and PR bodies. Commit and issue titles follow
`<prefix>(<area>): <description>` with the locked prefix vocabulary
(`bug`/`fix`/`feat`/`docs`/`chore`/`maint`/`refactor`/`epic`/`auto`) and the
area vocabulary in [CLAUDE.md](../../CLAUDE.md).

### IX. No user-facing survey surface outside the decision registry
No user-facing survey surface may exist outside the decision registry and the
step manifest. Every step declares typed IRPath inputs and writes via
`Step.inputs` and `Step.writes`; every IR write routes through the `mutate()`
seam (spec 014). Question and gallery modules declare `provides`/`requires`;
one sort (`orderByDependencies`) derives every order, for questions AND for
steps, and the screens are derived from that sort (specs 087/091). The step
manifest is an unordered pool of declarations — it never states what comes
before what. No **stored** hand-maintained order list exists; two named
exceptions are inputs to the sort, not rivals to it: declaration order is the
tie-break where the graph is silent, and screens whose visibility is not
routing-expressible declare a screen gate. Derived spine/join-target trails
are published for consumers — as derivations, never as stored flags. A plan
proposing new survey content MUST include the registry declaration as a
functional requirement.

### X. Defaults are proposals; nothing is decided silently
Defaults are the product (spec §3c): a derivable decision point left blank is
a defect, and a derived value is a **proposal** until the author confirms it.
Concretely:
- Two channels, with proposals between them: author and target facts are
  written by the author's choices — the target-language choice alone writes
  the language code and seeds the alphabet. A base keyboard contributes
  metadata *and* proposals: extracted values may seed defaults and pre-filled
  answers, and may enter the decision set as offered, base-derived decisions
  (specs 053/092). Such decisions are **provisional** — and confirming them
  is a designed step, not a formality: they are presented with their
  provenance shown, visible and changeable, and they stand once the author
  confirms them. What the base may never do is decide silently or over the
  author: no base-derived value takes effect unconfirmed, and none overwrites
  a decision the author has already made.
- Choices with consequences (allow/block and its kin) MUST be visible and
  demonstrable before the author chooses, per-combination where the
  combination is what's affected — never a silent bulk disposition.
- Switching the starting point RETAINS the author's decisions and recalculates;
  answers that no longer fit are re-proposed, never silently dropped.
- Where the generator's own closed manifest settles a check, certify it at
  generation time (**precertification**); do not re-derive it post hoc, and
  never claim it for a keyboard the studio did not generate.
- No silent automation: a mode flip, a re-ranking, or an adaptation is
  proposed at an explicit choice point with its evidence, never applied.

### XI. Done means integrated
A feature is done when it is **mounted, callable, and reachable by an author
in the live workflow** — not when its code merges or its tests pass. A built
surface with no production caller is unfinished work, and its spec MUST NOT
be marked shipped. Therefore:
- Every follow-up, parked item, or "wired later" note MUST carry an owner and
  a trigger or expiry. At each retirement pass, expired follow-ups are done or
  deleted — they do not roll forward silently.
- A spec's status header is a claim about the code. A header that disagrees
  with the code is a bug, fixed in the change that notices it.
- A shipped feature is retired (`km-retire`, AS-BUILT summary, full docs to
  `specs/_archive/`). The AS-BUILT is the summary of record; where it and the
  code disagree, the code wins and the AS-BUILT is corrected.
- A completed or superseded spec whose substance is covered elsewhere — an
  AS-BUILT, a successor spec, the constitution or architecture, the code and
  its tests — is **removed from the live corpus**, not kept as a live Draft.
  Coverage is checked before removal; a spec carrying a rule that lives
  nowhere else is amended into its covering home first, then removed.

## Authoring workflow (spec-kit ↔ KM crew)

1. `/speckit-specify` (+ `/speckit-clarify`) → the feature `spec.md`, citing
   the governing authority (Precedence table) rather than re-deriving scope.
2. `/speckit-plan` → plan + Constitution Check against Articles I–XI.
3. `/speckit-tasks` → `tasks.md`; `/speckit-taskstoissues` creates the issues.
4. `/km-lead` dispatches the KM crew against the tasks; `km-archivist`
   reconciles acceptance criteria at PR close.
5. `/speckit-analyze` runs as a review check before `/speckit-implement`.

Drift detection is split: `utilities/spec-trace` owns textual drift of the
monolithic `spec.md`; `/speckit-analyze` owns feature spec ↔ plan ↔ tasks
consistency. Do not install spec-kit's "Spec Trace" community extension — it
duplicates the existing utility.

One feature branch per cycle (`km/<short-task-slug>`); direct-to-main only
with explicit authorization.

Multi-phase features are built **one phase per conversation** on the
Companion pipeline (specify halts; implement stops after each user-story
phase; unattended runs record the checkpoint and continue). The policy lives
in `km-phase-break` sentinel blocks in the Companion command bodies; if an
upgrade overwrites them, re-apply from this paragraph.

## Governance

Changes to `spec.md` follow its §18 classes: prose edits — single-reviewer
approval; `Pattern` schema changes — Article I; reopening a resolved
decision — an explicit revision request citing the original decision and new
evidence, never informal.

Amendments to this constitution land **with** the change that prompts them,
in the same PR, and bump the version footer. An amendment that contradicts
existing text MUST edit that text. Append-only amendments — a new paragraph
that silently reverses an old one while both stand — are the failure this
version exists to end, and a reviewer MUST reject one on sight.

**Version**: 2.0.0 | **Ratified**: 2026-10-14 | **Supersedes**: 1.4.0 (ratified 2026-06-15, last amended 2026-10-07)
