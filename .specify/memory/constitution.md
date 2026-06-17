# Keyboard Studio Constitution

This constitution restates the **gates** that govern new feature work in
keyboard-studio. It does not replace [spec.md](../../spec.md) or
[docs/spec-signoff.md](../../docs/spec-signoff.md): on any conflict, the spec
and its sign-off ledger win (see Governance). Every `/speckit-plan` MUST pass a
Constitution Check against the Articles below before tasks are generated.

## Core Principles

### I. Pattern schema is a locked contract
The `Pattern` TS interface — canonical in `packages/contracts/src/pattern.ts`,
specified in [`specs/005-pattern-schema/spec.md`](../../specs/005-pattern-schema/spec.md)
(spec §5, extracted) — its field names, types, and `{{slotId}}` placeholder
syntax are immutable. Any rename, type change, or removal requires a **major
version bump of `@keyboard-studio/contracts` and a joint engine+content
session** (spec §18). The type is mirrored by a runtime zod schema
(`packages/contracts/src/schemas.ts`) with compile-time drift guards, so any
edit to a locked field MUST update its schema in the same change. A plan that
proposes editing the schema MUST stop and escalate to the user rather than
proceed.

### II. KeyboardIR is the engine spine
All scaffolding, import, validation, and mutation operate on the typed
`KeyboardIR`, never on raw `.kmn` text (`scaffold()` is `parse → scaffoldIR →
emit`). Constructs the codec cannot model are preserved as opaque
`RawKmnFragment` nodes and are **never silently dropped**. A base the codec
cannot parse fails the whole scaffold — no try/catch around `parse()`.

### III. Single persistent working copy (v1.3.0 spine)
One working copy is instantiated when the user selects a keyboard — Track 1
`instantiateFromBase` (copy/adapt) or Track 2 `instantiateFromExisting`
(import). Every step mutates that one copy; it is serialized **only at output**.
No intermediate serialization, no second working copy.

### IV. Validator layering is fixed (spec §10)
Layer A validity (9 TS-portable + 5 WASM-only checks) and Layer B style live in
`engine/src/validator`, alongside the Layer A′ import-fidelity checks I1–I6.
Layer C hygiene is `@keymanapp/keyboard-lint`. There is exactly **one 300 ms
debounce cycle** (decision D3): the TS-check and the WASM `kmcmplib` oracle run
as concurrent microtasks within it. A plan MUST NOT introduce a second debounce
timer or a parallel validation path.

### V. VirtualFS only during authoring (spec §11)
All authoring happens in an in-memory FS mirroring the `keymanapp/keyboards`
layout. The studio **never writes to host disk during authoring**. Output is
serialized only at the end, to a `.zip` (`engine/src/output`) or via GitHub
OAuth fork+PR.

### VI. Team boundaries (spec §12 / §13)
Engine owns the SPA, scaffolder, compiler service, validator, and output paths.
Content owns the pattern library, survey text, gallery ordering, LLM prompts,
and criteria triage. Every plan MUST declare which team owns the change and
stay within that boundary.

### VII. Out of scope for v1 (spec §16)
Plans MUST NOT implement: CJK/Ethiopic reorder patterns, LDML output,
mobile-app integration, hosting, multi-language `welcome.htm` variants,
`.kpj.user` management, touch-first authoring, multi-source merge,
survey-editing of opaque `RawKmnFragment`, or byte-identical round-trip.
Three-group routing renders the "not yet supported" stub for CJK/Ethiopic — it
never silently empties the gallery.

### VIII. House conventions
No emoji in console output — use `[OK]`, `[WARN]`, `[ERROR]`. File references in
user-facing text use markdown links (`[spec.md](spec.md)`), not backticks. Do
not cite GitHub issue numbers inside shipped code or comments — cross-link via
commit messages and PR bodies. Commit and issue titles follow
`<prefix>(<area>): <description>` with the locked prefix vocabulary
(`bug`/`fix`/`feat`/`docs`/`chore`/`maint`/`refactor`/`epic`/`auto`) and the
area vocabulary in [CLAUDE.md](../../CLAUDE.md).

## Authoring workflow (spec-kit ↔ KM crew)

New feature work funnels through spec-kit and is executed by the KM crew:

1. `/speckit-specify` (+ `/speckit-clarify`) → the feature `spec.md`, which
   **cites the governing `spec.md §X`** it implements rather than re-deriving
   scope.
2. `/speckit-plan` → plan + Constitution Check against Articles I–VIII.
3. `/speckit-tasks` → `tasks.md`; `/speckit-taskstoissues` creates the GitHub
   issues.
4. `/km-lead` dispatches `km-programmer` / `km-frontend` / `km-validator` / etc.
   against the tasks; `km-archivist` reconciles acceptance criteria at PR close.
5. `/speckit-analyze` runs as a `km-doc` / `km-synthesis` review check before
   `/speckit-implement`.

Drift detection is split: `utilities/spec-trace` owns textual drift of the
monolithic `spec.md`; `/speckit-analyze` owns feature `spec ↔ plan ↔ tasks`
consistency. Do **not** install spec-kit's "Spec Trace" community extension — it
duplicates the existing utility.

Branch policy is unchanged: one feature branch per cycle
(`km/<short-task-slug>`); direct-to-main only with explicit authorization.

## Governance

This constitution restates the gates of [spec.md](../../spec.md); it does not
amend them. On any conflict, `spec.md` and
[docs/spec-signoff.md](../../docs/spec-signoff.md) are authoritative, and this
file is corrected to match. Per spec §18:

- Prose section edits — single-reviewer approval.
- `Pattern` schema field renames / type changes / removals — major version bump
  of `@keyboard-studio/contracts` + joint engine+content session.
- Reopening a resolved decision (D1–D9, §14) — an explicit revision request
  citing the original decision and new evidence; never informal.

Amendments to this file follow the change that prompted them: when a spec
amendment lands (e.g. a new vX.Y.0 recorded in spec-signoff), the relevant
Article is updated in the same change and the version footer below is bumped.

**Version**: 1.0.0 | **Ratified**: 2026-06-15 | **Last Amended**: 2026-06-15
