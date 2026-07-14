# Contract: Seed-source fork (FR-006)

**Package**: `@keyboard-studio/studio` · **Team**: Engine (owns the SPA)

Revives the dead `touch_seed_source` step so the author chooses **Import & adapt** vs
**Reseed from desktop**.

## Edited: `advance` policy

`packages/studio/src/steps/advance.ts` — the pure step-advance function.

Change two cases (the rest of the policy is unchanged):

```ts
case "mechanisms":
  // WAS: nextSpineStepAfter("mechanisms") → "touch" (skipped touch_seed_source).
  // NOW: route into the off-spine seed-source fork.
  return { next: "touch_seed_source" };

case "touch_seed_source":
  // joinTarget is "touch"; advance there directly (mirrors the project_name join).
  return { next: "touch" };
```

**Contract**:
- `advance` stays **pure** and **total** over `ActiveStepId` — add `"touch_seed_source"` to
  the local `ActiveStepId` mirror type and the `surveySessionStore.ActiveStepId` it mirrors.
- No manifest reordering: `touch_seed_source` stays `spine:false`,
  `joinTarget:"touch"` (manifest.ts:115-119).
- `nextSpineStepAfter` is unaffected (still used by other cases).

## New: seed-source chooser panel

`packages/studio/src/editors/touchSeedSource/` — the component the `touch_seed_source` step
renders (replacing the current `AddTouchAdapter` reuse for that step; the `touch` step keeps
`AddTouchAdapter`).

**UI contract** (accessibility per house conventions — keyboard-navigable, ASCII status text):
- Shows a **preview** of the base's touch layout when `resolveBaseTouchJson(baseVfs)` is
  present; otherwise states no base touch layout exists.
- Two choices: **Import & adapt** (default when a base layout exists) and **Reseed from
  desktop** (default when absent). Optional advisory hint (e.g. "no phone platform") annotates
  the preview but never disables a choice — the author decides ("usable" is not
  auto-classified, R4).
- On confirm: sets session `TouchSeedSource` and completes the step
  (`onComplete`), advancing to `touch`.
- `onBack` returns to `mechanisms` (locked/read-only), matching TouchGallery's back contract.

## Session state

`surveySessionStore` gains `touchSeedSource: TouchSeedSource | null` + a setter, read by
`buildTouchLayoutJson`'s caller to pass `opts.seedSource` (see
[seed-derivation.md](seed-derivation.md)).

## Acceptance mapping

| Spec | Assertion |
|---|---|
| FR-006 / US2-AS1 | reaching the touch stage presents the seed-source choice (fork no longer skipped) |
| US1-AS1 | with a usable base layout, default is Import & adapt and that layout (not QWERTY) is the seed |
| US2-AS4 | author may choose Reseed even when a base layout exists → base discarded, desktop projection used |
| advance purity | `advance` unit test: `mechanisms → touch_seed_source → touch` |
