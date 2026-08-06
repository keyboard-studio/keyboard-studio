# UI Contract: 061 — Honest progress and outstanding work

The identifiers a consumer or test codes against. Every id below is either copied verbatim from
existing code (marked **existing**) or newly introduced by this feature (marked **new**). Existing
ids MUST NOT be renamed, recased, or re-pointed — an i18n id is a permanent handle (spec 046), and a
`data-testid` is what the E2E suite addresses.

## Module exports

### `packages/studio/src/lib/outstandingWork.ts` — new, pure

```ts
export interface OutstandingSection {
  readonly stepId: string;
  readonly count: number;
  readonly location: Location;
  readonly label: string;
}

export interface OutstandingWork {
  readonly sections: readonly OutstandingSection[];
  readonly byStepId: ReadonlyMap<string, OutstandingSection>;
  readonly nudgeTarget: OutstandingSection | null;
}

export interface OutstandingWorkInputs {
  readonly coverage: InventoryCoverageGate;
  readonly manifest: readonly Step[];
  readonly walks: StepWalkMap;
  readonly activeStepId: string;
  readonly visited: readonly string[];
  readonly label: (stepId: string) => string;
}

export function outstandingWork(inputs: OutstandingWorkInputs): OutstandingWork;
```

No store import, no `dashboard/` import (FR-016). Pure and total — an empty `walks`, an empty
`visited`, and a terminal `activeStepId` are all valid inputs that return without throwing.

### `packages/studio/src/hooks/useOutstandingWork.ts` — new, seam

```ts
export function useOutstandingWork(): OutstandingWork;
```

Reads `useInventoryCoverageGate()`, `useStepWalkStore`, `useSurveySessionStore`, and the label
resolver; memoizes on those inputs. Mirrors `useAccountedForGate()` (FR-011).

### `packages/studio/src/decisions/progressDots.ts` — extended

`ProgressDotsInput` gains one optional field, threaded by `StudioFooter.tsx` exactly as `stepWalks`
already is:

```ts
readonly outstandingByStepId?: ReadonlyMap<string, OutstandingSection>;
```

`ProgressDot` gains `readonly outstandingCount?: number`. `ProgressDotKind` is unchanged:
`"completed" | "current" | "upcoming"`.

### `packages/studio/src/hooks/usePreviewArtifact.ts` — extended

`PreviewArtifact` gains, alongside the **existing** `canDownload`:

```ts
/** Own coverage term. MUST NOT be derived from canDownload (FR-027). */
readonly canPublish: boolean;
/** Why publish is refused, or null. Names the missing characters and their section. */
readonly publishBlockReason: string | null;
/** Uncovered characters remain downloadable; this is the complaint's payload. */
readonly coverageComplaint: { readonly count: number; readonly chars: string; readonly sectionLabel: string } | null;
```

## Marks station ids — **existing**, pinned

Published as `StepWalkPosition.id` values under step id `marks`, and therefore addressable as
`Location` question segments. Order is the series order and MUST NOT change:

```
marks_attachment
marks_treatment
marks_output_form
marks_stacking
```

## Manifest step ids — **existing**, pinned

The row's marks are keyed to these. Copied from `steps/manifest.ts`:

```
identity  choose_base  track  project_name  characters  marks  convenience
carve  mechanisms  touch_seed_source  touch  help  package
```

`package` is reserved and never earns a mark. `project_name` and `touch_seed_source` are
`spine: false` — off-path for an author whose track bypassed them, and therefore absent from the row
rather than greyed out (FR-003).

## Message ids

### New — the nudge (FR-021)

The message no longer means "a gallery needs review" but "this section owes required work", and its
count is no longer necessarily characters, so these are **new ids**, not re-pointed ones:

```
nav.outstandingWork.button          "{count} still {needs/need} attention – resume in {section}"
nav.outstandingWork.count           plural: one {# item} other {# items}
```

### New — the row's accessible names (FR-008)

Two marks that share the hollow shape must not share a name:

```
footer.dot.outstandingBehind        names the section and what it still owes
footer.dot.notYetReached            names the section as not yet reached
```

### New — the download complaint and the publish refusal (FR-024, FR-026, FR-029)

```
output.coverageComplaint.title
output.coverageComplaint.body       names the missing characters and the owning section
output.coverageComplaint.proceed    "Download anyway"
output.coverageComplaint.goBack     "Go back and finish"
output.publishRefused.coverage      states that a keyboard missing required letters cannot be published
```

### Existing — retired ids

These describe the two-destination nudge and MUST be removed from `locales/en` and `locales/fr`
together with their component, not left orphaned:

```
nav.unfinishedGallery.desktop.button
nav.unfinishedGallery.desktop.count
nav.unfinishedGallery.touch.button
nav.unfinishedGallery.touch.count
```

### Existing — reworded, id retained

`output.status.coverageBlocked` keeps its id: its *meaning* is unchanged (coverage is incomplete;
here is what is missing) and only its consequence clause is reworded to say download is possible and
submission is not (FR-029). Per spec 046, an id is re-pointed only when the string's meaning changes,
not its wording.

## Test ids

### New

```
nav-outstanding-work                the single nudge button
output-coverage-complaint           the download complaint dialog
output-coverage-complaint-proceed   "Download anyway"
output-coverage-complaint-goback    "Go back and finish"
```

### Existing — retired with the component

```
nav-unfinished-gallery-desktop
nav-unfinished-gallery-touch
```

### Existing — unchanged, and load-bearing for the row tests

```
[data-progress-dot-kind]            the row's marks; StudioShell.test.tsx addresses this
```

`data-progress-dot-kind` keeps exactly three values. A hollow-behind mark is
`data-progress-dot-kind="upcoming"` distinguished by its accessible name, not by a fourth value —
any test asserting a fourth value is asserting a violation of FR-031.

## Invariants a test must hold

| Invariant | Requirement |
|---|---|
| `canPublish` is false while coverage is blocked, **even when** `canDownload` is true | FR-027 |
| `outstandingWork({ walks: {}, coverage: blocked })` reports both galleries | FR-013 |
| `nudgeTarget` is the manifest-earliest owed section behind the author | FR-005, SC-005 |
| `nudgeTarget` is `null` when the only owed section is the current one | FR-018 |
| A marked-for-later character still raises `count` | FR-014 |
| No `ProgressDot.id` is ever a character token | FR-033, SC-002 |
| The row matches the real manifest exactly, ordered | SC-008 |
