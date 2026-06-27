# Implementation Plan: Modular-loader cutover + legacy YAML retirement

**Branch**: `012-modular-loader-cutover` | **Date**: 2026-06-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-modular-loader-cutover/spec.md`

## Summary

Finish the #410 tail by cutting Phase A, Phase F, and identity-lite from the legacy full-YAML loader (`parseFlow` over `survey/loadFlow.ts`) to the modular loader (`loadModularFlow` over thin `*.modular.yaml` manifests + the question registry), exactly as Phase B already runs. Then, as a separate revertable change, delete the legacy loader and the four legacy full-flow YAMLs — stripping only the redundant *delivery form*, never the question research (§3.8 question library / no-delete).

**Plan-shaping discovery (drives most of the work):** Phase A and Phase F already have on-disk modular manifests whose ids resolve in the registry, so their cutover is a near-drop-in loader+import swap. **identity-lite is not** — its 5 questions (`il_language_autonym`, `il_language_english`, `il_language_code`, `il_target_script`, `il_script_not_supported`) have **no registered modules**, and `loadModularFlow` throws on any unregistered id ([loadModularFlow.ts:96](../../packages/studio/src/survey/loadModularFlow.ts#L96)). So identity-lite's cutover requires **authoring + registering 5 new `il_*` QuestionModules** ported verbatim from `identity_lite.yaml` (including `il_target_script`'s conditional `next` to the unsupported-script stub), plus their mirrored tests and declared `inputs`/`writes`. That in turn moves the registry from 93 → 98 modules, which trips three P2 CI gates that must be updated in lockstep.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), bundler module resolution with **explicit `.ts`/`.tsx` import extensions**.

**Primary Dependencies**: React + Vite SPA (`@keyboard-studio/studio`); `yaml` parser; `@keyboard-studio/contracts` (types only — no contract change here). Vite `?raw` YAML imports typed via `src/vite-env.d.ts`.

**Storage**: N/A (in-memory survey flow; VirtualFS authoring unaffected).

**Testing**: vitest (unit + the existing P2 CI gate tests under `packages/studio/tests/`); Playwright E2E (`packages/studio/e2e/`, currently `.skip`-ped) driven via the **global Playwright CLI** (v1.61.1, on PATH) — no package devDependency add; needs a `playwright.config.ts` (see research R5).

**Target Platform**: Browser SPA.

**Project Type**: Web SPA (single package, `packages/studio`).

**Performance Goals**: N/A — loader swap is structural; survey assembly is synchronous and unchanged in cost.

**Constraints**: Author-visible flow output (questions, order, defaults, branching, validation) must be **byte-identical** before/after per phase (golden compare). Golden compare must pass for a phase **before** that phase's legacy YAML is deleted. Cutover and deletion are **separate commits/PRs**. All import-extension specifiers preserved.

**Scale/Scope**: 3 phase components cut over; 1 new manifest; 5 new question modules + 5 mirrored tests; 3 CI gate-count updates; 2 E2E lanes unblocked; 1 loader + 4 YAML files deleted (separate change). Phase B untouched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS (non-interference)** | No `Pattern` field touched; no `packages/contracts` change. New `il_*` modules are `QuestionModule`s (studio-local type), not `Pattern`s. |
| II. KeyboardIR is the engine spine | **PASS** | No `.kmn`/IR mutation. `mutate` stays the documented stub; new modules declare empty `writes` (no IR write until P5 / #5b·#232). |
| III. Single working copy | **PASS** | No change to working-copy instantiation or serialization. |
| IV. Validator layering / one 300 ms debounce | **PASS** | No validator or debounce code touched. |
| V. VirtualFS only during authoring | **PASS** | No host-disk writes; survey flow is in-memory. |
| VI. Team boundaries | **PASS** | Survey text + flow data + question modules are **Content**-owned; the loader wiring in the three phase components is the studio shell seam Content already edits for survey flows (Phase B precedent). Declared as a Content-led change with studio-frontend support; stays within boundary. |
| VII. Out of scope for v1 | **PASS** | `il_script_not_supported` *preserves* the existing CJK/Ethiopic/Hangul "not yet supported" stub behavior (Article VII's required honest stub) — it is ported verbatim, not newly empties-the-gallery. |
| VIII. House conventions | **PASS** | No emoji in output; commit titles follow `<prefix>(<area>)`; no GitHub issue numbers in shipped code/comments (the `TODO(#410)` markers are being *removed*, which improves compliance). |

**No violations. Complexity Tracking not required.**

> One nuance worth flagging for the plan reviewer: porting 5 new question modules is more than the spec's "create the manifest" phrasing implied, but it is the *minimum* required for the identity-lite cutover to function at all (the loader hard-throws otherwise). It introduces no new architecture — it is the same fan-out pattern (`questions/<phase>/<id>.ts` + sub-registry + mirrored test) the 93 existing modules already follow.

## Project Structure

### Documentation (this feature)

```text
specs/012-modular-loader-cutover/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── flow-output-parity.md   # the golden-parity contract (author-visible flow equivalence)
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
packages/studio/src/survey/
├── PhaseA.tsx                    # EDIT: parseFlow→loadModularFlow; import phase_a_identity.modular.yaml?raw; drop TODO(#410)
├── PhaseF.tsx                    # EDIT: parseFlow→loadModularFlow; import phase_f_helpdocs.modular.yaml?raw; drop TODO(#410)
├── IdentityLite.tsx              # EDIT: parseFlow→loadModularFlow; import identity_lite.modular.yaml?raw; drop TODO(#410); keep getSeedValue autonym→English seam
├── PhaseB.tsx                    # UNCHANGED (already modular)
├── loadModularFlow.ts            # UNCHANGED (surviving loader)
├── loadFlow.ts (+ loadFlow.test.ts)   # DELETE in part (b)
└── questions/
    ├── a/                        # NEW: il_language_autonym.ts, il_language_english.ts,
    │                             #      il_language_code.ts, il_target_script.ts, il_script_not_supported.ts
    ├── registry.a.ts             # EDIT: add 5 il_* imports + entries
    └── registry.ts               # UNCHANGED (merges sub-registries)

content/flows/
├── identity_lite.modular.yaml    # NEW (part a): thin manifest, 5 il_* ids in legacy order
├── phase_a_identity.modular.yaml # UNCHANGED (cutover target for A)
├── phase_f_helpdocs.modular.yaml # UNCHANGED (cutover target for F)
├── phase_a_identity.yaml         # DELETE in part (b)
├── phase_b_characters.yaml       # DELETE in part (b)
├── phase_f_helpdocs.yaml         # DELETE in part (b)
├── identity_lite.yaml            # DELETE in part (b)
└── _examples/*                   # UNCHANGED (retained)

packages/studio/tests/survey/
├── questions/a/                  # NEW: 5 mirrored il_*.test.ts
├── inputs-writes-coverage.test.ts # EDIT: module-count floor 93 → 98
├── mirror-coverage.test.ts       # (auto-covers new modules; verify green)
└── orphan-input-lint.test.ts     # (now also lints identity_lite.modular.yaml; il_* declare empty inputs)

packages/studio/e2e/
├── copy-edit.spec.ts             # UNBLOCK (#410 AC#3 lane 1)
└── import-improve.spec.ts        # UNBLOCK (#410 AC#3 lane 2)
```

**Structure Decision**: Single-package web SPA. The change is confined to `packages/studio/src/survey/`, `content/flows/`, `packages/studio/tests/`, and `packages/studio/e2e/`. No cross-package edits; `@keyboard-studio/contracts` is consumed (types) but not modified.
