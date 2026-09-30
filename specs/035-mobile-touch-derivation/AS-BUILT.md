# Spec 035 Mobile touch derivation: as built

**Status:** Retired 2026-09-29. Shipped in PRs #1116 (foundations, `d9b373a`), #1128 (US1 import-and-adapt, `420ba4f`), #1131 (US2 reseed-from-desktop, `8790785`), #1140 (Phase 5, seam single-writer, `4c8f9cf`, 2026-07-16); plan amended in #1088. Tasks: 27/27 complete.
**Full docs:** [specs/_archive/035-mobile-touch-derivation/](../_archive/035-mobile-touch-derivation/) (spec, plan, tasks, research R1-R13, data-model, contracts, quickstart). Not read by default.
**Pinned here:** none

## What shipped
- The touch layout is derived from the author's work, never a fixed QWERTY. Desktop carve removals and letter placements are replayed onto it (FR-002, FR-004, FR-005).
- A seed-source fork, `touch_seed_source`: **import and adapt** the base touch layout (Case B, default when the base has one) or **reseed from desktop** and simplify (Case A).
- A coverage guard so simplification never orphans an inventory character (FR-008), shared by the gallery and lint criterion 18.6.
- Provenance tagging for derived vs authored keys; the emitted `.keyman-touch-layout` reflects derived-plus-edited state.

## Public contracts
- `applyDesktopModifications(seed: TouchLayoutIR, mods: { removals: string[]; placements: {char, hostKey}[] }): { layout, warnings }` -- [engine/src/pattern-apply/applyDesktopModifications.ts:77](../../packages/engine/src/pattern-apply/applyDesktopModifications.ts). Pure; NFC-matches removals; never deletes a key object (a carved primary becomes an inert `T_removed_<n>` placeholder).
- `touchCoverage(layout, inventory, options?, additionalProduced?)` -- [engine/src/pattern-apply/touchCoverage.ts:73](../../packages/engine/src/pattern-apply/touchCoverage.ts), a wrapper over `computeTouchCoverage` in [contracts/src/touch-coverage.ts:319](../../packages/contracts/src/touch-coverage.ts) (the shared implementation).
- Lint 18.6 touch side: `checkTouchCoverage` emitting `KM_LINT_TOUCH_UNCOVERED` -- [keyboard-lint/src/checks/check-18-6-touch-coverage.ts](../../packages/keyboard-lint/src/checks/check-18-6-touch-coverage.ts).
- Studio derivation: `deriveDesktopModifications`, `buildTouchLayoutJson` / `deriveSeedLayout`, `extractMechanismHostKey` in `packages/studio/src/lib/`.
- Fork: `advance("mechanisms")` returns `touch_seed_source` when `ctx.touchSeedSource === null`, else `touch`; `touch_seed_source` -> `touch` ([steps/advance.ts](../../packages/studio/src/steps/advance.ts)). `touchSeedSource` is `"import-adapt" | "reseed-from-desktop" | null` in `surveySessionStore`. Chooser UI: [editors/touchSeedSource/TouchSeedSourcePanel.tsx](../../packages/studio/src/editors/touchSeedSource/TouchSeedSourcePanel.tsx). `touch_seed_source` stays `spine:false`, `joinTarget:"touch"`, and is not in `STEPS_WITH_APPLY_COMPLETION`.

## Key decisions
- The engine already had a physical-to-touch projection, so scope shrank to replay + fork + guard (R1).
- Case B replay is a raw-JSON splice, keeping the base's shipped JSON verbatim outside edited keys (R9); removals never delete keys.
- Reseed must explicitly discard an existing touch layout (R10). The derived seed is emitted even with zero Phase E edits (R11 matrix).
- Fork memory: a recorded, non-stale choice skips the fork on re-entry; base re-instantiation clears it (R12).
- Single artifact writer (R13): `buildTouchLayoutJson` is the only writer of the touch side-car in both mutate-flag states.
- Amendment R7a: reseed emits a TABLET platform (number row, altgr combo access key, diacritics as long-press), not phone.

## Gotchas and limits
- Case A reads `ir.groups`; Case B is hand-authored JSON: strings are not NFC-guaranteed, so compare NFC-normalized.
- `touch_inherited` is an intentional no-op in `applyTouchAssignments`.
- `deriveSeedLayout` requests the tablet skeleton; import-and-adapt preserves whatever platforms the base ships.
- Carve/mechanism edits made after a seed-source choice rely on the touch stage re-deriving from seed + mods + assignments.

## Divergences from the spec
- `touchCoverage` is in the engine but the shared walk (`computeTouchCoverage`, plus `isSpacerKeyClass`, `decodeUnicodeKeyId`, `stripDottedCircle`) lives in `packages/contracts`, with extra `options` and `additionalProduced` params ([touch-coverage.ts](../../packages/contracts/src/touch-coverage.ts)). The contract showed a two-arg engine-only function.
- Plan R4/R4a/R4b: the live OSK preview replaced the pure-derivation preview in the chooser (recorded in research amendments).
- R13 refactor: `repropagate.ts` no longer takes `setTouchLayoutJson`; the reducer's remaining use is the null reset at [reducer.ts:428](../../packages/studio/src/steps/reducer.ts).

## Follow-ups and open issues
- Code `@see` citations into archived contract files: `contracts/src/touch-coverage.ts:22`, `engine/.../applyDesktopModifications.ts:32`, `touchCoverage.ts:41`, `applyTouchAssignments.ts:22`, `keyboard-lint/.../check-18-6-touch-coverage.ts:5`, `studio/src/lib/deriveDesktopModifications.ts:7`, and E2E headers citing `quickstart.md` (`touch-derivation-us1/us2.spec.ts`). Retarget or leave; the folder stub does not hold those files.
- `docs/spec-trace.json` unit `specs/035-mobile-touch-derivation` is cited as a `specRef` by `registerEditorSteps.ts` and `manifest.specref.json`; retiring orphans it.
