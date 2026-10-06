# Spec 014 Mutate seam + touch propagation (P5): as built

**Status:** Retired 2026-09-29. Shipped in PR #823 (US1 MVP, squash `400c5743`), #825 (US2-US5, `493812ad`), closeout #826 (`c149545f`), flag-on proof #832 (`a30ba44d`), 2026-06-28. Tasks: 38/38 complete (T000-T037).
**Full docs:** [specs/_archive/014-mutate-seam-touch-propagation/](../_archive/014-mutate-seam-touch-propagation/) (spec, plan, tasks, research, data-model, contracts, checklists). Not read by default.
**Pinned here:** none

## What shipped
- `QuestionModule.mutate()` became the executed IR write path: pure, returns a `Partial<KeyboardIR>` patch, applied by the reducer as a path-scoped deep merge at declared `writes` paths.
- Carve/add galleries route through `mutate()` instead of direct `workingCopyStore` mutations (carve, add gallery, touch, deadkey write sets).
- Per-key touch provenance (`base-derived | physical-suggested | hand-set`) promoted onto `TouchKeyIR` in `@keyboard-studio/contracts` (major bump, section 18 sign-off in `docs/spec-signoff.md`).
- Automatic touch re-propagation after a physical change, driven by the P4b staleness closure, never overwriting `hand-set` keys.
- One global rollback flag; flag off is byte-identical to P4b.
- The real per-spine-prefix Layer-A validator replaced 012's structural proxy.

## Public contracts
- `packages/contracts/src/keyboard-ir.ts`: `TouchKeyIR.provenance?: TouchKeyProvenance` (line ~126); absent means `hand-set` for author-persisted layouts. `editors/assignLoop/provenance.ts` re-exports the type.
- `packages/studio/src/flags/mutateFlag.ts`: `isMutateSeamEnabled()` reads `VITE_KM_MUTATE_SEAM`, true only when exactly `"1"`; default off; build-time, no live toggle.
- `packages/studio/src/steps/mutateApply.ts`: `applyMutatePatch`, `MutatePatchContainmentError` (undeclared-path patch rejected whole, fail-fast in all builds).
- `packages/studio/src/steps/editorMutate.ts`: `CARVE_WRITES`, `TOUCH_WRITES`, `ADD_GALLERY_WRITES`, `DEADKEY_WRITES`, `buildCarvePatch/applyCarveMutate`, `buildAddGalleryPatch/applyAddGalleryMutate`.
- `packages/studio/src/steps/repropagate.ts`: `isOverwritable`, `mergeNoClobber`, `buildRepropagationPatch`, `repropagate(deps)`; one coalesced pass over the staleness union.
- `packages/studio/src/steps/reducer.ts`: `routeAnswersThroughMutate`, `MutateRequest`.
- Output gate: `OutputScreen.tsx` and `ManagedPRSubmitPanel.tsx` refuse while `touch` is in `staleSteps` (added by PR #1172).

## Key decisions
- mutate is pure and the reducer applies it; idempotent on re-apply; empty patch `{}` is a valid no-op.
- Provenance lives in the contract, not the editor layer, so it survives serialize/round-trip and the no-clobber rule has one source.
- A manual edit to a `physical-suggested` key promotes it to `hand-set`.
- Answer-store-only and display-only modules stay out of scope (empty `writes` = no-op).
- Real validator reuses the single 300 ms validation path (Article IV); no second timer.

## Gotchas and limits
- Flag OFF is the shipped default; production flip has a hard precondition (output-time touch-staleness gate, F4) which #1172 implemented.
- Flag is not toggleable mid-session.
- A `hand-set` key whose base a later physical change removes is not auto-deleted; orphan surfacing is a dashboard concern.
- Legacy untagged keys are treated as `hand-set` (conservative); scaffolder tagging came in spec 035.

## Divergences from the spec
- None found on the contracts above (flag, provenance field, apply/repropagate functions all present at origin/main). Spec paths `flags/mutateFlag.ts` match.
- `packages/contracts` is now 0.18.0; the spec's 0.12.0 was the gate version, not a claim about current.

## Follow-ups and open issues
- Code comments cite `specs/014-mutate-seam-touch-propagation/contracts/*.contract.md` and `data-model.md` (moved to `_archive`): `packages/contracts/src/schemas.touch.test.ts`, `studio/src/editors/assignLoop/touchBehavior.ts`, `editors/touchSuggest/touchSuggest.ts`, `lib/projectWorkingCopyVfs.flagParity.test.ts`, `lib/serializeWorkingCopy.flagParity.test.ts`, `steps/repropagate.ts`, `test/touchProvenance.ts`, `tests/dashboard/articleIVProbe.test.ts`, `completenessLiveWiring.test.ts`, `tests/steps/editorMutate.test.ts`. List for km-programmer.
- Instruction file: `.specify/memory/constitution.md:76` cites this spec.
- `docs/spec-trace.json` entry orphaned.
