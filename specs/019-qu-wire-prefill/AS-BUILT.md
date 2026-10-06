# Spec 019 qu-wire-prefill: as built

**Status:** Retired 2026-09-29. Shipped in PR #871 (squash `9175bdfb`, 2026-06-29). Tasks: 23/23 complete.
**Full docs:** [specs/_archive/019-qu-wire-prefill/](../_archive/019-qu-wire-prefill/) (spec, plan, tasks). Not read by default.
**Pinned here:** none (no code or living doc references the folder by path).

## What shipped
- Question Unification Phase 1, spec #5: the "Confirm the basics" Prefill screen resolves as a read-only registry drill-down UNDER the opaque `characters` node on the Flow Map (not a top-level manifest entry).
- Declare-consuming wiring plus oracle and regression tests; the SPA render and the confirm-advance are byte-identical.

## Public contracts
- `prefillDrillDown` in `packages/studio/src/survey/questions/drillDownDeclarations.ts`: `underNodeId: CHARACTERS_NODE_ID`, `registryKey: "il_target_script"`, `inputs:[header.bcp47]`, `writes: []`, `sessionInputs:["ScriptPrefill ..."]`, `output:{kind:"none"}`.
- Grouped in `drillDownDeclarations[CHARACTERS_NODE_ID]` (with `pbBuildListDrillDown`); re-exported from `survey/questions/registry.ts`.
- Confirm advances the characters sub-stage `"prefill"` to `"B"` via `setCharactersSubStage` (`stores/surveySessionStore.ts`).

## Key decisions
- Prefill is a drill-down, not a manifest node, because promoting it would require decomposing the opaque `characters` placeholder (Phase 2 spec #11).
- `irPath('header','script')` does not exist and must never be declared; the script signal is the session-level `ScriptPrefill`.
- Cross-graph C5 for the session-derived `header.bcp47` input is owned by spec 017: the manifest `charactersStep` declares `writes:[header.bcp47]`.

## Gotchas and limits
- Drill-down declarations are declared-only data; no component resolves through them.
- `prefill` is a sub-stage inside `CharactersStep` (spec 027), not a separate step id.

## Divergences from the spec
- Spec cites `handlePrefillConfirm` (`StudioShell.tsx:632`); the confirm handler is now inside `survey/CharactersStep.tsx` (spec 027 moved it; it also does punctuation seeding on confirm).

## Follow-ups and open issues
- Phase 2 promotion (spec #11) to a real manifest step not done.
