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
  // NOW: route into the off-spine seed-source fork — but only when no valid
  // choice is recorded (R12 fork memory). A remembered, non-stale choice goes
  // straight to "touch" so back-and-forth over mechanisms doesn't re-ask.
  return ctx.touchSeedSource === null
    ? { next: "touch_seed_source" }
    : { next: "touch" };

case "touch_seed_source":
  // joinTarget is "touch"; advance there directly (mirrors the project_name join).
  return { next: "touch" };
```

**Contract**:
- `advance` stays **pure** and **total** over `ActiveStepId` — add `"touch_seed_source"` to
  the local `ActiveStepId` mirror type and the `surveySessionStore.ActiveStepId` it mirrors.
- `AdvanceContext` gains `touchSeedSource: TouchSeedSource | null` (the host reads the
  session store; the policy stays store-free). Base re-instantiation clears the stored
  choice, so a stale choice never routes past the fork (R12).
- No manifest reordering: `touch_seed_source` stays `spine:false`,
  `joinTarget:"touch"` (manifest.ts:115-119).
- `nextSpineStepAfter` is unaffected (still used by other cases).
- `touch_seed_source` is **not** added to `STEPS_WITH_APPLY_COMPLETION` — the chooser only
  sets a session flag; it has no applyStepCompletion effect.
- **Update set**: `advance.test.ts` (the `mechanisms → touch` case becomes conditional),
  the golden-walk oracle, and the Flow Map render of the fork step.

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
- When a base layout ships tablet/desktop platforms, the **Reseed** option states that
  choosing it discards them (the reseed projection is phone-only — R7/R10).
- On confirm: sets session `TouchSeedSource` and completes the step
  (`onComplete`), advancing to `touch`.
- **Changing an existing choice** (re-entry with `touchDraft` present) warns that the
  in-progress touch edits will be discarded before clearing `touchDraft` (R12 — the draft's
  `charTouch` entries reference host keys of the other seed and would half-apply).
- `onBack` returns to `mechanisms` (locked/read-only).
- **Re-entry path (R12)**: the host wires TouchGallery's `onBack` (Back from the first
  character) to `touch_seed_source` — not `mechanisms` — so the seed choice stays reachable
  after the first pass (US2-AS4). The chooser's own Back is what reaches `mechanisms`.

## Session state

`surveySessionStore` gains `touchSeedSource: TouchSeedSource | null` + a setter, read by
`buildTouchLayoutJson`'s caller to pass `opts.seedSource` (see
[seed-derivation.md](seed-derivation.md)) and by the host to populate
`AdvanceContext.touchSeedSource`. Cleared on base re-instantiation; setting a *different*
value clears `touchDraft` (after the chooser's discard warning).

## Acceptance mapping

| Spec | Assertion |
|---|---|
| FR-006 / US2-AS1 | reaching the touch stage presents the seed-source choice (fork no longer skipped) |
| US1-AS1 | with a usable base layout, default is Import & adapt and that layout (not QWERTY) is the seed |
| US2-AS4 | author may choose Reseed even when a base layout exists → base discarded, desktop projection used (and the choice stays reachable via the re-entry path) |
| advance purity | `advance` unit tests: `mechanisms → touch_seed_source → touch` when `ctx.touchSeedSource === null`; `mechanisms → touch` when a choice is recorded |
| R12 fork memory | re-completing mechanisms with a recorded, non-stale choice does not re-show the chooser |
