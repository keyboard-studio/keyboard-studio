# Implementation Plan: MVP end-to-end authoring walk

**Branch**: `034-mvp-authoring-walk` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/034-mvp-authoring-walk/spec.md`

## Summary

034 is the **umbrella MVP walk**: it pins the already-built Track 1 spine (`identity -> choose_base -> track -> [project_name] -> characters -> carve -> mechanisms -> touch -> help -> output`) as the shippable MVP and closes the gaps that are 034's own responsibility. Most stages are BUILT and reused; the plan's real work is three things:

1. **US1 (verify + harden the built desktop walk)** — confirm identity/base/track/alphabet/carve/mechanisms/ZIP work end-to-end for the five proven alphabetic scripts against the **real engine** (Track 2 currently degrades silently under the mock).
2. **US2 (integration only)** — ensure the spine reaches the touch stage (depth owned by [035](../035-mobile-touch-derivation/spec.md)) and that the output screen exposes both ZIP and the PR path (depth owned by [024](../024-option-a-github-app/spec.md)), with the PR path degrading honestly when the OAuth backend is down.
3. **US3 (the one net-new build) — durable localStorage draft** — extend the existing sessionStorage OAuth snapshot ([persistWorkingCopy.ts](../../packages/studio/src/lib/persistWorkingCopy.ts)) into a continuously-saved localStorage draft that ALSO persists traversal state ([surveySessionStore.ts](../../packages/studio/src/stores/surveySessionStore.ts)), rehydrates on app boot, and is cleared by "start over".

Two spec requirements are **explicitly deferred and NOT implemented in this plan**: FR-006 (explicit desktop-lock affordance — pending UX decision) and FR-013 (Arabic/Hebrew/Devanagari acceptance — pending the script-scope decision). See Complexity Tracking / research.md.

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Vite 5; Node >= 20; pnpm 9 workspace.

**Primary Dependencies**: `zustand` (stores), `@keyboard-studio/engine` (serialize/instantiate/toZip), `@keyboard-studio/contracts` (`WorkingCopyData`, `VirtualFS`, `mergePhaseResults`), existing OAuth hooks (`useGitHubAuth`).

**Storage**: browser **localStorage** (new durable draft) layered over the existing **sessionStorage** OAuth snapshot; authoring stays in the in-memory VirtualFS (no host-disk writes).

**Testing**: vitest (unit/integration) + Playwright (E2E — extends [copy-edit.spec.ts](../../packages/studio/e2e/copy-edit.spec.ts)).

**Target Platform**: WASM-capable desktop web browser (the studio SPA).

**Project Type**: web SPA (frontend) within the TS monorepo — Engine team owns this change (Constitution Article VI).

**Performance Goals**: draft persistence MUST NOT perturb the single 300 ms validate debounce (Article IV); draft writes are debounced independently and cheaply (serialize + `setItem`), target < 50 ms per write for a typical working copy.

**Constraints**: no host-disk writes (Article V); exactly one validation debounce cycle (Article IV) — the persistence write is a separate, lightweight subscription, never a second validation timer; localStorage quota failures must degrade gracefully (skip write, never crash — mirrors the existing sessionStorage try/catch).

**Scale/Scope**: single-user session, one working copy, one **active** draft. The draft is stored under a per-project key (FR-014) so a multi-project index and a per-user server backend (US3a) are additive, but the MVP holds and resumes exactly one project. Snapshot size bounded by one keyboard's VirtualFS (typ. a few hundred KB Base64).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | PASS | No `Pattern`/`Criterion` field touched. |
| II. KeyboardIR spine | PASS | Draft serializes `baseIr`/`ir` as plain JSON (already done); no raw `.kmn` ops introduced. |
| III. Single persistent working copy | PASS | Rehydrate **patches the one existing store** (`useWorkingCopyStore.setState`); it never instantiates a second copy. |
| IV. Validator layering / single 300 ms debounce | PASS (watch) | Persistence uses its own lightweight store-subscription debounce; it MUST NOT add a second validation timer or a parallel validation path. Called out as a design constraint in research.md. |
| V. VirtualFS only during authoring | PASS | localStorage/sessionStorage are browser storage (same class as the existing OAuth snapshot), not host disk. Output still serialized only at the end. |
| VI. Team boundaries | PASS | Engine team (SPA stores + output wiring). No content-owned surface (pattern library / survey text / gallery ordering) is modified. |
| VII. Out of scope (v1) | PASS | Implements none of the forbidden list. Gated scripts keep the "not supported" stub (FR-012). Touch depth is deferred to 035, not implemented here. |
| VIII. House conventions | PASS | ASCII-only console output, markdown-link file refs, `prefix(area):` commits, no issue numbers in code. |

**No violations.** The two deferred items (FR-006, FR-013) are recorded in Complexity Tracking as *out of this plan's scope pending a decision*, not as constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/034-mvp-authoring-walk/
├── plan.md              # This file
├── research.md          # Phase 0 — persistence approach + deferred-decision handling
├── data-model.md        # Phase 1 — DurableDraft entity + versioning
├── quickstart.md        # Phase 1 — runnable validation scenarios
├── contracts/
│   ├── persistence.md   # draft save/load/clear API contract
│   └── walk-integration.md  # spine-reachability + output publish-path contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/studio/src/
├── lib/
│   ├── persistWorkingCopy.ts      # EXTEND: reuse serializer; add localStorage durable-draft path
│   └── draftPersistence.ts        # NEW: saveDraft / loadDraft / clearDraft + version key + traversal-state serialize
├── stores/
│   ├── workingCopyStore.ts        # subscribe for debounced draft writes (no shape change)
│   └── surveySessionStore.ts      # REMOVE "No persistence" constraint for the draft path; expose full-state serialize/restore
├── steps/
│   ├── manifest.ts                # (verify) spine reaches touch; no reorder
│   └── advance.ts                 # (verify) mechanisms -> touch; PR/ZIP both reachable at output
├── components/
│   ├── OutputScreen.tsx           # (verify/harden) ZIP always works; PR path degrades honestly when backend down
│   └── WelcomeScreen.tsx / StudioShell.tsx  # boot-time draft rehydrate + "start over" clears draft
└── ...

packages/studio/e2e/
└── copy-edit.spec.ts              # EXTEND: add a Cyrillic walk + a reload-and-resume assertion
```

**Structure Decision**: Frontend-only change within `packages/studio`. The engine is reused unchanged (serialize/instantiate/toZip already exist). No new package. The durable-draft logic is isolated in a new `draftPersistence.ts` that reuses the proven serialize/deserialize helpers rather than duplicating them.

## Complexity Tracking

> Only the deferred items are tracked here — there are no constitution violations to justify.

| Deferred item | Why deferred | What unblocks it |
|---|---|---|
| FR-006 explicit desktop-lock affordance | UX decision open; current silent auto-lock on mechanism-complete is functionally correct | A UX decision (visible lock button vs silent) — then a small `mechanisms`/`StepHost` change |
| FR-013 Arabic/Hebrew/Devanagari acceptance | No script-specific RTL/stacking/reorder logic exists; adding acceptance would pull in real engine work outside the MVP floor | The script-scope decision (034 Open Questions); if YES, a follow-up spec for RTL + combining behavior |
