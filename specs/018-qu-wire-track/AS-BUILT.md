# Spec 018 qu-wire-track: as built

**Status:** Retired 2026-09-29. Shipped in PR #867 (squash `c56f0f32`, 2026-06-29). Tasks: 21/21 complete.
**Full docs:** [specs/_archive/018-qu-wire-track/](../_archive/018-qu-wire-track/) (spec, plan, tasks). Not read by default.
**Pinned here:** none (code cites the folder only as the string `specs/018-qu-wire-track` in `specRef`, which resolves against `docs/spec-trace.json`, not the filesystem).

## What shipped
- Question Unification Phase 1, spec #4: the `track` step (copy vs adapt chooser) is a first-class, contract-declared manifest node and a branch-defining node on the Flow Map.
- Confirmation plus regression lock: the manifest declaration already existed (from spec 017); this spec added oracle and map-node tests only.
- Behaviour byte-identical: no new write routing, no contracts bump, no render change.

## Public contracts
- `trackStep` in `packages/studio/src/steps/registerEditorSteps.ts`: `id:"track"`, `inputs:[header.bcp47, header.name]`, no `writes` (branch selection only), `flowRefs:["track"]`, `specRef:["§8","specs/018-qu-wire-track"]`, `persistence:"answer-store"`.
- Fork routing lives in `packages/studio/src/steps/advance.ts` (`nextSpineStepAfter`, the copy branch to `project_name` side-trail with `spine:false, joinTarget:"characters"`; the adapt branch to `characters`, which also sets `setCharactersSubStage("prefill")`).
- Modular question `survey/questions/g/track_choice.ts` documents that the fork is handled at manifest level via `onTrackSelected`.

## Key decisions
- Track chooser canonical model is Option A (a modular gate question whose `next` rule becomes YAML), but its implementation is deferred to Phase 2 (`qu-mutate-track`). Phase 1 keeps the hand-coded fork so a byte-identical parity baseline exists.
- `writes: []`: no IR leaf for the track choice in Phase 1.

## Gotchas and limits
- The fork is still hand-coded, not YAML `next`. `survey/questions/g/track_choice.ts` states the copy/adapt fork is handled at manifest level, not by YAML.
- Copy track still gates the `project_name` side-trail.

## Divergences from the spec
- Spec cites `handleTrackSelected` at `StudioShell.tsx:602`. Fork logic has since moved to `steps/advance.ts` (comment there says it was moved out of StudioShell); the name survives only in comments in `survey/questions/g/track_choice.ts`.

## Follow-ups and open issues
- Phase 2 `qu-mutate-track` (move fork into YAML) not done.
- Stale `StudioShell.tsx:602` line citations live only in the archived docs.
