# Spec 059 Identity in package: as built

**Status:** Retired 2026-09-29. Shipped in PR #1475 (squash `78e9fba9`, 2026-08-05; folder renumbered from 057 in #1522). Tasks: 44/44 complete.
**Full docs:** [specs/_archive/059-identity-in-package/](../_archive/059-identity-in-package/) (spec, plan, tasks, research D-01..D-10, data-model, contracts, success-criteria-evidence). Not read by default.
**Pinned here:** none

## What shipped

- The package descriptor (`source/<id>.kps`) declares the author's language (BCP47 tag and name), not the copied keyboard's, on both authoring tracks.
- One writer for the descriptor's identity fields; the adapt track GENERATES a `.kps` when the copied keyboard has none, and reports failure through warnings instead of silently omitting it.
- Decision-trail impact for pre-instantiation identity answers is resolved on request by a counterfactual: two output projections varied by one overlay field.
- A repository-wide check that every question declaring an output reach names a field the descriptor writer really consumes.

## Public contracts

- `packages/engine/src/package-descriptor/`: `PackageDescriptorIdentity { displayName, languageTag?, languageName? }`, `buildKpsContent(keyboardId, identity, kmnText, version?)`, `applyIdentityToKps(vfs, keyboardId, identity, kmnText, version?)` returning `{ warnings, generated }`, `DESCRIPTOR_CONSUMED_FIELDS`. Exported via `packages/engine/src/index.ts`.
- Elements written: `<Info><Name>`, `<Info><Description>`, `<Keyboards><Keyboard><Name>`, `<Language ID="{tag}">{name}</Language>`. Nothing else.
- `QuestionModule.outputs?: readonly OutputWrite[]` with `OutputWrite { target: "package-descriptor"; field }` (`packages/studio/src/survey/types.ts`). Distinct address space from `writes` (IRPath over KeyboardIR).
- Check: `packages/studio/src/survey/questions/outputReach.test.ts` (registry-wide vitest, not a plain-node lint).
- `projectWorkingCopyForOutput({ identityOverride?: Partial<IdentityOverlay> })` in `packages/studio/src/lib/serializeWorkingCopy.ts`: override applied to that call only; the store is never written.
- `ImpactUnavailableReason` gained `"no-working-copy-yet"` (`packages/contracts/src/decisionRecord.ts`); impact hook is `useEntryImpact.ts`, resolved async at the row on expand.

## Key decisions

- One descriptor writer, extracted verbatim from the scaffolder's private `buildKpsContent` (D-01). A second writer is a defect.
- Descriptor written at projection step 3.6 (D-02); adapt track generated during projection, not fetched (D-09).
- Overlay carries the language name; the copy track starts carrying the tag (D-03).
- Counterfactual = two output projections, one overlay field varied, so both sides come from the same function as the shipped artifact (D-04).
- A third unavailability reason rather than overloading an existing one (D-05).
- Coverage asserts the descriptor's existence from the delivered artifact (D-08). Volatile-content handling extracted, not duplicated (D-10).

## Gotchas and limits

- The overlay names the tag `bcp47`; the writer's parameter is `languageTag`. Declarations use overlay names.
- Zip, PR, and `readProjectedFiles` paths call the projection with no argument and must stay unchanged.
- `writes: []` with non-empty `outputs` is legitimate.

## Divergences from the spec

- `DESCRIPTOR_CONSUMED_FIELDS` and `IdentityOverlayField` now also include `"websiteUrl"` (`packages/engine/src/package-descriptor/index.ts:47`, `packages/studio/src/survey/types.ts:151`); the spec lists three fields. Later widening, not a bug.

## Follow-ups and open issues

- None recorded in tasks.md. No stale citations found outside `specs/`.
