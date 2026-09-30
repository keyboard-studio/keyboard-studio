# Spec 058 Output screen picker scope: as built

**Status:** Retired 2026-09-29. Shipped in PR #1481 (squash `2e82b2c2`, 2026-08-05); tasks retroactively verified and completed in PR #1655 (`c595e53f`, 2026-08-24). Tasks: 17/17 complete.
**Full docs:** [specs/_archive/058-output-screen-picker-scope/](../_archive/058-output-screen-picker-scope/) (spec, plan, tasks, research, data-model, contracts). Not read by default.
**Pinned here:** none

## What shipped

- The Output screen's left pane is scoped to shipping: once a working copy is instantiated, the base keyboard renders as read-only provenance and the open/scaffold mode toggle and editable picker are suppressed.
- Cold arrival at `#output` (no working copy) keeps the full picker, unchanged.
- A "Change base keyboard" control relocates base-changing to the survey without mutating the working copy.
- The download aria-labels and the served filename derive from one shared id-resolution function.
- Fixed a stale `pickerMode` state that showed "Open base" pressed after a Track 1 scaffold.

## Public contracts

- `packages/studio/src/components/PickerPane.tsx`: `PickerPaneVariant = "full" | "shipping"`; props `variant?` (default `"full"`) and `changeBaseSlot?` (rendered in `"shipping"` only, right after the base provenance when a base exists). `identityPanelSlot` and `kmnEditorSlot` render in both variants at the same tree position, so a mid-visit variant flip reconciles in place.
- `packages/studio/src/components/OutputScreen.tsx:288`: `variant={instantiated ? "shipping" : "full"}` where `instantiated` is a live `useWorkingCopyStore((s) => s.isInstantiated())` selector.
- `packages/studio/src/lib/outputKeyboardId.ts`: `resolveOutputKeyboardId(identity, baseKeyboard)` returns `identity?.keyboardId ?? baseKeyboard?.id ?? ""`. Both the download aria-label and `serializeWorkingCopy`'s filename call it.
- `packages/studio/src/stores/surveySessionStore.ts`: `backToChooseBase(): void` rewinds history to the prefix before `choose_base` and clears `baseConfirmed`; never mutates the working copy, never pushes an `advance` entry.
- Test ids: `output-base-provenance`, `output-change-base`, `output-screen-root`. i18n ids: `picker.pane.label.shipping`, `picker.shipping.*`, `output.changeBase.label`, `output.download.aria.ready`, `output.download.aria.kmp`.
- No `packages/contracts` change.

## Key decisions

- Variant is a prop on the existing `PickerPane`, not a second component: two siblings cannot share element identity across a flip, which reopens the remount-resets-state bug.
- Variant selection is a live store subscription, not a mount-once read or a navigation-time read, to close the late-settling instantiation race (`usePreviewArtifact`) with no new effect or timer.
- Change-base is navigation, never a mutation; back-navigation via `backToChooseBase`, not `advance("choose_base")`, which would corrupt history.
- One id-resolution function in its own module, called from both sites, closing the derived-id-computed-twice defect.

## Gotchas and limits

- Never derive the download id from `pickerMode` or `scaffoldSpec`.
- `identityPanelSlot` and `kmnEditorSlot` must stay at the same tree position across variants.

## Divergences from the spec

None found. Exports, props and the variant expression match the contract.

## Follow-ups and open issues

- A sibling of the derived-id defect was deliberately left: `draftAutosave` computes `identity?.keyboardId ?? base id` from a different input type with a load-bearing fallback (filed as a follow-up in tasks.md T016; the file has moved, locate by grep).
- No inbound references outside `specs/`.
