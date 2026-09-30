# Spec 057 Bulletproof navigation: as built

**Status:** Retired 2026-09-29. Shipped in PR #1491 (squash `d0ab11d4`, 2026-08-04); follow-ups #1497, #1538, #1822 also touched this folder. Tasks: 74/74 complete.
**Full docs:** [specs/_archive/057-bulletproof-navigation/](../_archive/057-bulletproof-navigation/) (spec, plan, tasks, research D-1..D-10, data-model, contracts, evidence, reviews, handoffs). Not read by default.
**Pinned here:** none. (Code comments cite `reviews/classB-diagnosis.md` in the archive; see follow-ups.)

## What shipped

- Survey position survives tab switches: the mount-time traversal reset was deleted, not patched; only the two explicit start-over paths reset.
- The URL hash is a path grammar and the sole router; a location can be parsed, resolved, and jumped to.
- One jump primitive shared by the decision trail deep links and the footer journey dots.
- Per-tab view state (survives route unmount, dies on reload) in a module-level store.
- The Preview tab became "Compare": a read-only inspect-another-keyboard surface with its own pipeline hook.
- The footer row is the whole journey (project label, per-question dots, stage dots, overflow), with "you are here" semantics.
- The first-visit gate holds the requested location instead of discarding it.

## Public contracts

- Hash: `#route[/step[/question]]`, no trailing slash, no empty segments; ids are `[a-z0-9_]`. `packages/studio/src/lib/location.ts`: `RouteId` (welcome, survey, preview, output, flowmap, trail, profile), `Location`, `parseLocation`, `formatLocation`, `locationsEqual`.
- `packages/studio/src/lib/navigate.ts`: `navigateTo(route)` and `navigateTo(location)` overloads. Invariant: no component assigns `window.location.hash`.
- `packages/studio/src/lib/resolveLocation.ts`: pure `resolveLocation(loc, ctx)` returning `reachable | unreachable | degraded`; `UnreachableReason` = `step-not-in-build | question-not-in-build | skipped-by-track | beyond-gate | no-project`. A degraded result's `to` is itself reachable.
- `packages/studio/src/lib/jumpToLocation.ts`: `jumpToLocation(loc, { returnTo? })` returning `arrived | refused | degraded`; never partially arrives.
- `packages/studio/src/stores/viewStateStore.ts`: `useViewStateStore`, no storage layer; `reset()` only from the two start-over paths.
- Compare pipeline: `packages/studio/src/hooks/useCompareArtifact.ts`; `usePreviewArtifact` (Output) is untouched.
- i18n ids: retired `nav.preview`, `preview.heading`, `preview.pane.label`; added `nav.compare`, `compare.*`, `footer.*`, `trail.jump.*`.

## Key decisions

- Delete the traversal reset rather than add a session-identity mechanism (D-1).
- Widen the hash, keep one router; the `preview` hash token is kept so bookmarks and e2e specs survive the relabel (D-2).
- Resolution is one pure discriminated-union function; a resolution table is a unit-test matrix, not a DOM test (D-3).
- One jump primitive; upcoming-stage dots resolve `beyond-gate` and are refused, never skipping a lock (D-4).
- View state is an unpersisted singleton (D-5); Compare gets a read-only pipeline hook (D-6).
- Footer is the breadcrumb; no `breadcrumb.*` ids (D-7). Project-label precedence extracted, not forked (D-8).
- First-visit gate holds the requested location (D-10).

## Gotchas and limits

- Do not rename `usePreviewArtifact`, `basePreviewStatusStore`, the Studio tab's live OSK preview, or the `preview` route token.
- A restored draft may reference a step or question absent from this build; that is the `degraded` path, not an error.
- Later specs build on this (079 per-question answer persistence, 081 footer step nav); check their docs before changing the journey strip.

## Divergences from the spec

None found in the location, resolve, jump, or view-state surfaces (files and exports exist as specified). `HANDOFF.md` in the archive says T073 was blocked RED; that is stale, tasks.md on main has T073 and T074 checked.

## Follow-ups and open issues

- Stale links to fix (km-doc): `docs/architecture.md:89` (spec.md) and `docs/tooling.md:319` (`evidence/gating-red.md`) now point into the archive.
- Stale citations (km-programmer): comments citing `specs/057-bulletproof-navigation/reviews/classB-diagnosis.md` in `packages/studio/e2e/copy-edit.spec.ts:238,814`, `e2e/helpers/surveyFlow.ts:481,633,805`, `e2e/touch-derivation-us1.spec.ts:249`, `e2e/touch-derivation-us2.spec.ts:446`.
