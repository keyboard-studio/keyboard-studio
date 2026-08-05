# Implementation Plan: Identity in the package

**Feature**: 059-identity-in-package · **Branch**: `059-identity-in-package` · **Created**: 2026-08-03

**Spec**: [spec.md](spec.md) · **Research**: [research.md](research.md) · **Data model**: [data-model.md](data-model.md) · **Contracts**: [contracts/](contracts/)

## Summary

The author's language never reaches the package. The descriptor is written once, at scaffold
time, from the *base* keyboard's tags, and no projection step touches it afterwards — so a
Bambara keyboard built on a French base ships a `.kps` declaring `fr`, and the decision trail
honestly reports that it cannot show a change that does not exist. This plan fixes the artifact
first and the report second.

The approach has three moves. First, the private `buildKpsContent` inside the scaffolder is
extracted into one engine module that owns the package descriptor, gaining a patch entry point
that both authoring tracks and the projection call — that single writer is what keeps the copy
and adapt tracks from drifting again. Second, the projection gains a descriptor step between the
existing identity write and the id-rename pass, so the descriptor is re-derived on every
projection from the same identity overlay that already feeds the `.kmn`; the overlay itself grows
the two fields it is missing (the language's display name, and the composed tag on the copy
track). Third, the trail resolves an identity decision's effect by projecting the working copy
twice — once with the recorded value, once with the alternative — and diffing the two, which is
how a decision made *before* instantiation gets attributed without moving it in the manifest.

No new dependency, no new stack. The one contract change is an additive `ImpactUnavailableReason`
member, which lands with its zod mirror in the same commit.

## Project Structure

```
packages/contracts/src/
  decisionRecord.ts                    # + "no-working-copy-yet" reason
  schemas.ts                           # + zod mirror (same commit — drift guard)

packages/engine/src/
  package-descriptor/
    index.ts                           # NEW — the single descriptor writer
    build.ts                           # buildKpsContent, moved out of scaffolder
    patch.ts                           # applyIdentityToKps (patch-or-generate)
  scaffolder/index.ts                  # generateStubs now calls the shared builder
  index.ts                             # + package-descriptor exports

packages/studio/src/
  lib/
    projectWorkingCopyVfs.ts           # + step 3.6 descriptor; IdentityOverlay grows
    serializeWorkingCopy.ts            # + identityOverride param on the output projection
  stores/workingCopyStore.ts           # IdentityPatch gains languageName
  survey/
    types.ts                           # + QuestionModule.outputs declaration
    questions/a/il_language_*.ts       # declare their output reach
    questions/outputReach.test.ts      # NEW — the FR-016 repository check
  decisions/
    projectedText.ts                   # NEW — baseline + volatile normalization, shared
    snapshotSource.ts                  # consumes the extracted helpers
    counterfactualProjection.ts        # NEW — the two-projection diff (FR-009)
    impact.ts                          # + async resolver for pre-instantiation entries
    useEntryImpact.ts                  # NEW — on-expand async resolution hook
    DecisionEntryRow.tsx               # renders pending + the new reason
  StudioShell.tsx                      # wires the async resolver
  locales/en/messages.json             # new author-facing strings

packages/studio/e2e/
  touch-derivation-us1.spec.ts         # Track-2 descriptor assertion (US3)
```

**Structure Decision**: the descriptor writer is new *engine* surface (spec §11/§12 — output
artifacts are Engine-team), while every trail-facing change stays in `packages/studio`. The one
`packages/contracts` edit is the additive reason code. Nothing is added to `utilities/`: the
FR-016 check reads TypeScript question modules, which the plain-node linters cannot parse — see
research D-07.

## Constitution Check

Assessed against [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v1.1.0.
Re-checked after Phase 1 design; verdict unchanged.

| Article | Assessment |
|---|---|
| I — `Pattern` schema is a locked contract | **PASS.** No `Pattern` field is touched. The only contract edit is an additive `ImpactUnavailableReason` union member, which is not `Pattern` and not a rename/removal; per the source-of-truth chain it lands with its `schemas.ts` mirror in the same commit, which the compile-time drift guards enforce. |
| II — `KeyboardIR` is the engine spine | **PASS.** The descriptor is XML, not IR, and is handled as text exactly as the existing `rewriteKpsFilePaths` and `<Version>` patch already handle it. No new raw-`.kmn` manipulation: the `.kmn` side of identity keeps going through `applyIdentityStubMutation` and the codec. The feature explicitly does **not** teach the codec to emit `header.bcp47` (spec Out of scope). |
| III — Single persistent working copy | **PASS.** The counterfactual clones the VFS the same way `projectWorkingCopyForOutput` already does and discards both projections; nothing is stored and the store is never mutated to produce one. A stored counterfactual would be the second account of the artifact the spec forbids (Key Entities). |
| IV — One 300 ms debounce cycle | **PASS.** No timer is added. The descriptor rides the existing projection; the counterfactual runs only on an explicit expand. Neither produces diagnostics. |
| V — VirtualFS only during authoring | **PASS.** Every write is into the in-memory working copy, serialized only at output. The adapt track's descriptor is *generated* into the VFS, never fetched to disk. |
| VI — Team boundaries | **PASS.** Engine team throughout: scaffolder, output projection, SPA. `welcome.htm` / `readme.htm` prose is Content-team and is excluded by the spec. FR-018 is satisfied by making the existing survey text true (Engine), not by editing it (Content). |
| VII — Out of scope for v1 | **PASS.** No multi-language `welcome.htm` variants — the spec excludes that surface by name. No LDML, no touch-first authoring, no byte-identical round-trip. |
| VIII — House conventions | **PASS.** No emoji in console output; new author-facing strings use the `area(.segment)+` id convention under `trail.*`; no issue numbers in shipped code. |

No violations — no Complexity Tracking table.

## Phases

**Phase 0 — Research.** Ten decisions recorded in [research.md](research.md), covering the single
writer, projection ordering, the overlay's missing fields, the counterfactual's shape, the new
reason code, async resolution in the row, and the two anti-regression mechanisms.

**Phase 1 — Design.** [data-model.md](data-model.md) describes the six entities this feature
introduces or reshapes. [contracts/](contracts/) pins three interfaces: the descriptor writer, the
question output-reach declaration, and the impact/message-id surface.

## Sequencing note for `/speckit.tasks`

The user stories are not independently shippable in spec order. US1 (the artifact) is a hard
prerequisite for US2 (the report) — the spec says so explicitly, and shipping US2 first would make
the trail's message false rather than merely unhelpful. US3 (the adapt track) shares the writer
with US1 and should land with it; US4 rides on the existing supersede semantics and needs only
coverage. The FR-016/FR-017 anti-regression work is not a polish item: FR-016's check is what
prevents the E-1/E-4 class from reappearing, and it must be able to see the declarations US1
introduces.
