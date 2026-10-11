# Quickstart / validation guide: Decision store (spec 088)

Runnable validation for each success criterion. Per the spec's lesson from 087,
evidence counts only from the **live app** (Playwright against `pnpm dev`) or a
**store-level test driving the real `StepHost`**. `DecisionsDemo` and
`src/test/sc004Harness.ts` results are not evidence for any criterion.

## Prerequisites

```bash
cd ~/workspace/ks-modular-decisions   # branch km/modular-decisions (088 lands on its stacked branch)
pnpm install
pnpm prebuild                          # not optional on a clean checkout (CLAUDE.md)
```

Unit/store tests run per package, never bare `vitest` at the root:

```bash
pnpm --filter @keyboard-studio/studio test -- <path>   # or the package's own vitest config per docs/tooling.md
```

## SC-001 — Answers survive a reload, stored only in `decisions` (Playwright)

New spec: `packages/studio/e2e/decision-store-reload.spec.ts`, run with
`pnpm --filter @keyboard-studio/studio test:e2e -- decision-store-reload` against
the root `pnpm dev` server.

1. Walk the live wizard: answer identity (`language-code`, `copyright-holder`),
   choose the track, answer project_name (copy track).
2. Reload the page. **Expect:** every answer restored, same value and provenance.
3. Read the saved draft from localStorage (`ks.draft.<projectKey>.v2`).
   **Expect:** a `decisions` slice keyed by decision id holds the answers; the
   persisted `surveyAnswers` slice holds no survey-question answers.

## SC-002 — No second copy remains (grep gate)

```bash
grep -rn "decisionsFromTraversal" packages/studio/src   # expect: no hits
grep -rn "selectedTrack\|touchSeedSource" packages/studio/src/stores/surveySessionStore.ts
# expect: no hits (fields, setters, snapshot members all gone)
```

**Expect:** remaining hits elsewhere are only the C-3.3 allowances (migration,
v1 fixtures, `AdvanceContext` field names).

## SC-003 — v1 fixture migrates with 100% accounting

Fixture: `packages/studio/src/lib/__fixtures__/v1-draft-18e63aa4.json` — a version-1
`DurableDraft` captured from `main` @ 18e63aa4 (pre-088 code) answering identity,
track, and project_name, following the `pre079-draft.json` precedent.

```bash
pnpm --filter @keyboard-studio/studio test -- lib/draftPersistence
```

**Expect:** loading the fixture produces decision records for 100% of its answers,
or the answer appears in `migrationOrphans` surfaced to the author; the count of
records + retained gallery answers + orphans equals the fixture's answer count.

## SC-004 — Parity unmodified

```bash
pnpm --filter @keyboard-studio/studio test -- decisions/orderParity decisions/gateWalkParity steps/manifest steps/stepOrder.parity
git diff --stat 07356c2f -- packages/studio/src/decisions/orderParity.test.ts \
  packages/studio/src/decisions/gateWalkParity.test.ts packages/studio/src/steps/manifest.test.ts
```

**Expect:** all green, and the second command prints nothing (the three test files
are byte-identical to before the spec).

## SC-005 — A moved question keeps its answer and its history (real StepHost)

Store-level test extending `packages/studio/src/components/StepHost.test.tsx`:
a test registry places `il_copyright_holder` in a different step than production.

1. Drive the real `StepHost` to complete the question; answer it twice (the second
   answer supersedes the first in the log).
2. Reload the draft through `applyDecisionSnapshot` / log hydration.
   **Expect:** the current answer is present under `copyright-holder`; the decision
   trail shows **both** entries under the decision, despite the step move.
