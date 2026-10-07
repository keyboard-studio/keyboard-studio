# Quickstart / validation guide: Live extraction (specs/092-live-extraction)

Runnable validation for this feature. Every scenario runs in the **live
wizard** (`pnpm dev`) or as a store-level test through the real `StepHost`.
`DecisionsDemo` and `sc004Harness` results do not count (series rule,
research R7).

## Prerequisites

- Predecessor specs landed on this branch's stack: 088 (decision store),
  089 (`apply` + patch runner), 090 (gallery/picker modules, renderer
  props), 091 (derived steps).
- From the repo root: `pnpm install` once, then the prebuild the repo
  requires (`pnpm build` runs it; a bare `tsc -b` without it fails — see
  CLAUDE.md).
- The sibling keyboards checkout at `../keyboards` on the
  keyboard-studio fork's `master` (the `basic_kbdfr` fixture depends on it).

## Scenario 1 — The series acceptance test (US1 / SC-001)

The one allowed declaration change: `il_copyright_holder` gains
`requires: ["authoring-track"]`. Nothing else is edited to make this pass.

```bash
pnpm --filter @keyboard-studio/studio dev        # terminal 1
pnpm --filter @keyboard-studio/studio test:e2e -- e2e/live-extraction-acceptance.spec.ts
```

- **Adapt track walk:** start a project, choose `basic_kbdfr` as the
  starting point, choose the adapt track → the copyright-holder question
  appears **after** the track choice, pre-filled with the keyboard's own
  copyright ("(c) 2009-2019 SIL International" per
  `docs/keyboard-index.md`), labelled "from basic_kbdfr".
- **Copy track walk:** same starting point, copy track → the
  copyright-holder question defaults to the author; the copied keyboard's
  notice is kept automatically and is not offered for re-entry.
- Expected: both walks pass; the question's position differs by no edit
  other than the one-line `requires`.

## Scenario 2 — Seeding, offered, and validation (US2)

Covered by the same e2e file plus store-level tests through the real
`StepHost`:

1. Choose a starting point with an unanswered, extractable decision →
   after setup the record is `{ provenance: "extracted", source:
   "basic_kbdfr" }` and the field renders pre-filled with the source label.
2. Answer a decision, then reach setup → the answer is unchanged and the
   extracted value appears beside it (`offered`).
3. A module whose `validate` rejects its extracted value (test module) →
   no seed; the question is asked normally.
4. A starting point missing a value → no seed, no silent default; the
   question is asked normally.

## Scenario 3 — Track before setup (US3 / SC-004)

In the Scenario 1 adapt walk: the adapt behaviour is in effect from the
**first** commit after the track choice — no refresh, no second commit.
The walk asserts the working copy's instantiation mode without reloading
the page.

## Scenario 4 — Starting-point log entry (US4 / SC-005)

After each live walk above, open the decision trail: the starting-point
(base-contribution) entry is present, naming the starting point and its
starting key count. Absence of the entry fails the walk.

## Scenario 5 — SC-002 measurement

With the acceptance e2e's counting hook (the extraction pass returns its
seeded/offered ids): choose `basic_kbdfr`, record seeded ÷ applicable
decisions in the live wizard, and report the figure in the implementation
PR. The spec sets no target percentage — the number replaces 087 SC-001's
demo measurement as the standing figure.

## Scenario 6 — Retired seeders + golden walk (SC-003, regression)

```bash
grep -rn "PHASE_F_SEEDS" packages/studio/src            # expect: no hits
grep -rn "prefillCarveDispositions" packages/studio/src # expect: no hits
# plus the IdentityLite / Prefill / CharactersStep seed write paths (research R3)
pnpm --filter @keyboard-studio/studio test:e2e -- e2e/golden-walk.spec.ts
```

- The golden walk (089 SC-001: copy track from `basic_kbdfr`, fixed
  answers) produces a source zip byte-identical to the 089 baseline.
- Full gates: studio vitest suite via the package's own config (never bare
  `vitest` at the root), `tsc --noEmit`, `pnpm lint`.
