# Keyboard Studio — architecture & meta-flow

> **The system view — the layer spec-kit omits.** spec-kit gives us a
> [constitution](../.specify/memory/constitution.md) (invariant *rules*) and
> per-feature specs under [`specs/`](../specs/) (vertical slices). It has no
> native home for *how the pieces compose into one running app*. This document
> is that home.
>
> **It is an index, not a re-derivation.** Detail lives at the linked homes;
> this file links rather than restates, per the contract-source-of-truth
> discipline in [CLAUDE.md](../CLAUDE.md). If a fact here contradicts its linked
> home, the home wins — fix the link, don't fork the fact.
>
> **It is tracked.** [`utilities/spec-trace`](../utilities/spec-trace/) hashes
> this file (as `docs/architecture.md`) alongside the spec sections and the
> extracted feature specs, so architectural drift is visible, not silent.

## Three documentation layers

The repo deliberately keeps three layers. Knowing which layer a change belongs
to is how we avoid shredding the architecture into feature folders.

| Layer | Answers | Home | Stability |
|---|---|---|---|
| **Invariants** | "What must always be true?" | [`.specify/memory/constitution.md`](../.specify/memory/constitution.md) — enforced mechanically by `/speckit-plan`'s Constitution Check | rarely changes |
| **Architecture / meta-flow** | "How does the whole thing fit together?" | **this file** + the architecture-core spec sections (below) | changes with major design moves |
| **Features** | "How does subsystem X work, and is it built?" | [`specs/NNN-<slug>/`](../specs/) (+ `plan.md` / `tasks.md` when active) | changes per feature |

**Migration rule (see [CLAUDE.md](../CLAUDE.md) → spec-kit section).** Only
*feature/contract* sections of [`spec.md`](../spec.md) get extracted into
`specs/NNN/`. The **architecture-core** sections — §4, §5a, §9, §10, §11, §12,
§13 — are *not* features and are not feature-extracted; they stay in `spec.md`
and are composed here. (§8 Data flow was extracted to
[`specs/008-data-flow/`](../specs/008-data-flow/spec.md) before this rule was
written; it is the *meta-flow* and is treated as architecture-core regardless
of where its text lives.)

## The spine

Everything in the engine operates on one typed intermediate representation, and
one persistent working copy.

- **`KeyboardIR` codec spine.** `.kmn`/`.kvks`/`.keyman-touch-layout` parse into
  a typed `KeyboardIR`; scaffolding, import, validation, and mutation all work
  on the IR, never on raw text; it emits back and round-trips. Constructs the
  codec can't model survive as opaque `RawKmnFragment` nodes.
  → spec [§5a](../spec.md#5a-keyboardir-keyboard-intermediate-representation) ·
  code [`packages/engine/src/codec/`](../packages/engine/src/codec/)
- **Working-copy spine (v1.3.0).** A single persistent working copy
  (`KeyboardIR` + `VirtualFS`) is instantiated when the user picks a keyboard —
  Track 1 `instantiateFromBase` or Track 2 `instantiateFromExisting` — mutated
  by every step, serialized only at output.
  → [docs/workflow-model.md](workflow-model.md) · spec
  [§8](../spec.md#8-data-flow) → [`specs/008-data-flow/`](../specs/008-data-flow/spec.md)

## The meta-flow (end to end)

The application is a pipeline, not a set of independent features. One pass,
selection → artifact:

```
pick keyboard ──▶ instantiate working copy (Track 1 copy/adapt | Track 2 import)
   │
   ├─ identity-lite (language, script — decoupled) ─▶ base resolution ─▶ base-derived pre-fill
   │
   ├─ character inventory (diffed vs base)
   │
   ├─ Phase C  physical gallery  ── strategy selector seeds defaults; DISCUS-guided assignment map
   │                └─▶ LOCK DESKTOP
   ├─ Phase E  touch gallery  (derived from locked desktop)
   │
   ├─ documentation / metadata (deferred)
   │
   ├─ validate  (Layer A + B continuous; Layer C hygiene)  ◀── 300 ms debounce, TS + WASM oracle
   │
   └─▶ output  (VirtualFS → .zip  |  GitHub OAuth fork + PR)
```

Authoritative detail: [`specs/008-data-flow/`](../specs/008-data-flow/spec.md)
(the 15-step pipeline, survey phases, gallery instantiation) and
[`specs/007-strategy-selection/`](../specs/007-strategy-selection/spec.md) (the
A1–A7 axes + decision tree that drive the gallery defaults).

## Validator layering

Three layers gate the working copy (spec [§10](../spec.md#10-validator-and-lint-engine)):

- **Layer A** validity (9 TS-portable + 5 WASM-only checks) + **Layer B** style,
  plus Layer A′ import-fidelity checks I1–I6 →
  [`packages/engine/src/validator/`](../packages/engine/src/validator/)
- **Layer C** hygiene → [`@keymanapp/keyboard-lint`](../packages/keyboard-lint/)
- One **300 ms debounce** cycle runs the TS check and the WASM `kmcmplib` oracle
  as concurrent microtasks (decision D3). Do not add a second timer.

## Subsystem composition map

The trackable architecture index — each subsystem, its spec home, and its code
home. (Status mirrors `docs/spec-trace.json`; coverage is the spec-trace job,
not a number maintained by hand here.)

| Subsystem | Spec home | Code home |
|---|---|---|
| Codec / KeyboardIR spine | spec §5a | `packages/engine/src/codec/` |
| Working-copy spine | spec §8 / [specs/008](../specs/008-data-flow/spec.md) · [workflow-model.md](workflow-model.md) | engine working-copy + `packages/contracts/src/ir/` |
| Data flow / survey | [specs/008](../specs/008-data-flow/spec.md) | `packages/engine/src/{character-discovery,inventory,loader}/`, `packages/studio/src/survey/` |
| Three-group routing | spec §9 | engine routing + `packages/studio` gallery scoping |
| Strategy selection | [specs/007](../specs/007-strategy-selection/spec.md) | `packages/engine/src/strategy-selector/`, `recognizer/` |
| Pattern schema (contract) | [specs/005](../specs/005-pattern-schema/spec.md) | `packages/contracts/src/pattern.ts` (+ zod `schemas.ts`) |
| Pattern library | spec §5 / [specs/005](../specs/005-pattern-schema/spec.md) | `packages/engine/src/pattern-library/`, `pattern-apply/` |
| Validator (A/B/A′/C) | spec §10 | `packages/engine/src/validator/`, `packages/keyboard-lint/` |
| Compiler (kmcmplib) | spec §4 | `packages/engine/src/compiler/`, `packages/compiler/` |
| Simulator | spec §4 | `packages/engine/src/simulator/` |
| Output / scaffolder | spec §11 / §12 | `packages/engine/src/{output,scaffolder}/` |
| Studio SPA | spec §4 | `packages/studio/` |
| Criteria compliance | spec §11 | `packages/contracts/data/criteria.json` (+ `criteria-summary.md`) |

## Teams

Two teams own disjoint surfaces (spec [§12](../spec.md#12-output-artifacts) /
§13): **Engine** owns the SPA shell, scaffolder, compiler service, validator,
and output paths; **Content** owns the pattern library, survey text, gallery
ordering, LLM prompts, and criteria triage. Respect the split when picking up
work.

## Diagrams

- [architecture.svg](architecture.svg) — component view
- [stack.svg](stack.svg) — package/dependency stack
