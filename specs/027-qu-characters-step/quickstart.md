# Quickstart — validate spec 027 (CharactersStep)

Prerequisite: on branch `km/qu-027-characters-step` (stacked on
`km/qu-026-survey-session-store`, which supplies `surveySessionStore`).

## Gate commands (all must be green)

```sh
pnpm --filter @keyboard-studio/studio typecheck
pnpm --filter @keyboard-studio/studio test
pnpm depcruise
```

**Baseline pre-existing failures (NOT yours — do not chase):** exactly 4 —
3× `src/lib/projectWorkingCopyVfs.flagParity.test.ts` (CRLF golden) +
1× `tests/dashboard/articleIVProbe.test.ts` (async-word scan). Anything else red is this
change's.

## Parity proof (the acceptance gate)

1. **Component machine** — `survey/CharactersStep.test.tsx` (new):
   - prefill → `onConfirm` → PhaseB → `onComplete` emits the Phase B `SurveyPhaseResult`.
   - PhaseB → `onBack` returns to prefill (no host `onBack` fired).
   - prefill → `onBack` calls `props.onBack`.
   - store `charactersSubStage` pre-set to `"B"` → component mounts **directly at PhaseB**
     (the carve-back re-entry proof).
2. **RTL walk** (new): copy-track (track → project_name → prefill → PhaseB → carve) and
   adapt-track (track → prefill → PhaseB → carve) render **identical screen sequences** to
   `main`, including back-from-carve landing on PhaseB.
3. **Unmodified survivors**: the `pb_*` mirrored per-question tests and the spec-026
   traversal oracles (`dashboard/trackRouting.test.ts`, `dashboard/prefillRouting.test.ts`)
   pass. `StudioShell.test.tsx` updated **only** where it asserted `charactersSub` internals
   (now a store slot).
4. **Flow Map unchanged**: `dashboard/driftGuardrail.test.ts` passes **unmodified** — the
   `characters` node and its `phase_b_characters` drill-downs are byte-identical; the
   bijection node set is unchanged.

## Manual smoke (optional)

```sh
pnpm dev
```

Walk both tracks in the SPA: copy (identity → base → track → project name → prefill → Phase B
→ carve) and adapt (… → track → prefill → Phase B → carve). Press Back from carve → you land
on Phase B, not prefill. Start over → next characters entry begins at prefill. Screens must be
pixel-identical to `main`.
