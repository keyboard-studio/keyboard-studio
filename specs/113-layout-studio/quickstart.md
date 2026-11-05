# Quickstart: validating the Layout tab (spec 113)

How to prove each shipped story works. Commands run from the repo root of the worktree. Never run
bare `vitest` at the root; use the package filters below.

## Prerequisites

- `pnpm install`, then `pnpm build` (runs `prebuild`) on a clean checkout.
- `../keyboards` checked out on the keyboard-studio fork's `master` (corpus tests skip without it).

## Unit and integration

```
pnpm --filter @keyboard-studio/contracts test -- layoutOps kmnEdits
pnpm --filter @keyboard-studio/engine test -- layout-attribution simulateEach layout-ops kmn-diff emit
pnpm --filter @keyboard-studio/studio test -- editors/layout kmnEdits derivedEquivalence projectWorkingCopyVfs KmnCodePane
```

Expected: all pass; `derivedEquivalence.test.ts` passes only with the `kmn-edits` surface
registered and its replay and draft-load arms green (FR-026, SC-011).

## Corpus honesty harness (SC-001, SC-002, SC-007, SC-009, SC-010)

Corpus suites (`*.corpus.test.ts`) are excluded from each package's default config; run them
through the corpus config:

```
cd packages/engine && npx vitest run --config vitest.corpus.config.ts src/layout-attribution src/kmn-diff src/simulator
```

Runs attribution + `simulateEach` over the fixed corpus set (≥ 20 keyboards: simple positional,
deadkey-heavy with both table shapes, literal-context, store-based, opaque, mnemonic). Expected:
zero editable cells or rows whose display differs from the compiled output; 100% editable for
keyboards with no read-only shapes; a per-keyboard editable-share report printed for the rest.
The `kmn-diff` corpus suite checks `applyIRChanges(a, diffIR(a, b))` emits `b` on the code-edit
set (SC-010).

## End to end (Playwright)

```
pnpm --filter @keyboard-studio/studio test:e2e -- layout-tab
```

| Story | Scenario | Expected |
|---|---|---|
| US1 | Copy a simple positional keyboard; open Mechanical Gallery → Layout | Default layer shows the copied keyboard's characters, labelled "from the starting point"; a store-based key shows its read-only reason. |
| US2 | Assign `ŋ` to a key; accept the proposed `Ŋ` on Shift | Both written in one confirm; Assign tab and Code tab show them; the downloaded `.kmp` types `ŋ`/`Ŋ`; one undo removes both. |
| US2 | Reload the draft | The edit is still there (the `kmn-edits` decision persisted). |
| US3 | Make a key a new deadkey; add three rows and the proposed space row | Spec 083 lifecycle shows its base-keyboard warning; "after this deadkey" shows the rows; simulator typing matches. |
| US8 | Change, add, and delete a rule in the Code tab; Apply | The download has exactly those changes; reload keeps them; an edit with a syntax or compile error records nothing; an override of an Assign-tab rule is flagged for review. |
| US5 | Open a read-only key; "view in code" | Code tab opens with the rule's line revealed. |
| US6 | Count provisional keys; confirm a class in the fallback surface | That class stops being provisional. |
| US4 | "after `n`": set `g` → `ŋ` | Typing `n g` gives `ŋ`; never-fires duplicate shown read-only. |

## The artifact check that matters most

An edit is done only when it reaches the **built keyboard**, not just the live view
([research.md](research.md) R1). Every US2–US4 and US8 E2E scenario downloads the `.kmp`/source zip
and asserts the rule is in the emitted `.kmn`.
