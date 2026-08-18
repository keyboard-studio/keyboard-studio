# Phase 0 Research: Step-model constitutional gates

## Decision 1 — Re-verify the registry count instead of gating on the spec's stale 101

**Decision**: FR-002's exact-count assertion targets **114**, not the spec's 2026-07-06 figure of
101, with the inline comment updated to the current per-registry breakdown: `9 Phase A + 49 Phase B
+ 22 Phase F + 3 Phase G + 31 Reserve = 114 total`.

**Rationale**: Measured directly by importing each sub-registry and counting
`Object.keys(...).length` (`phaseARegistry` 9, `phaseBRegistry` 49, `phaseFRegistry` 22,
`phaseGRegistry` 3, `reserveRegistry` 31 — the last of which did not exist when the spec was
written). Registries drift fast in this codebase (spec 064 attribution capture and spec 071's
marks-series reorder both landed sub-registry churn since 2026-07-06); the spec's own Assumptions
section anticipates this and says the count is "re-verified at implementation time." Gating on a
number already known to be wrong would fail CI on the very first run for a reason unrelated to any
regression, defeating the gate's purpose (SC-002).

**Alternatives considered**: Keep 101 as written and let the first CI run "discover" the drift —
rejected; that produces a red build with no actionable signal, exactly the noisy-gate failure mode
the criteria-count precedent (`packages/contracts/src/{types,schemas}.test.ts`) was designed to
avoid.

## Decision 2 — Scope the depcruiser rule to `StudioShell.tsx` + `StepHost.tsx`, not all of `components/`

**Decision**: The new `forbidden` rule's `from` pattern is
`^packages/studio/src/(StudioShell\.tsx|components/StepHost\.tsx)$`, targeting `to:
^packages/studio/src/editors/`.

**Rationale**: `StudioShell.tsx` (which contains `SurveyView`, FR-003/FR-004's named renderer) and
`StepHost.tsx` (the manifest-driven step mount point, spec 028 Stage 5) are the two files the spec
means by "the renderer." A blanket `components/ -> editors/` ban would break a legitimate existing
import: `components/OutputScreen.tsx` imports `ScaffoldForm` and `TrackOneIdentityPanel` from
`../editors/panels/` for the identity/scaffold entry forms on the Output screen — a different
surface from the manifest-driven survey, out of this spec's scope (FR-004 names the *survey*
renderer specifically). Naming the two files precisely, the same way the existing rules name
specific top-level folders (`editors/`, `dashboard/`, `steps/`), keeps the new rule from
regressing an unrelated, already-correct import.

**Alternatives considered**: A folder-level rule on `components/` — rejected per the OutputScreen
false-positive above. A rule on `src/` root only (just `StudioShell.tsx`) — rejected because it
would leave `StepHost.tsx`, the file that actually mounts `step.component`, unguarded; a future
regression could reintroduce a direct editor import there without tripping any check.

## Decision 3 — Source-guard test checks the `editors/` import path, not a `Gallery|Panel` name grep

**Decision**: The FR-004 test reads `StudioShell.tsx` and `StepHost.tsx` source text (the same
technique the existing SC-004 block in `manifest.test.ts` already uses) and asserts no line matches
an import from an `editors/`-rooted path, rather than the spec's Independent Test literal
`grep -n "import.*Gallery\|import.*Panel"`.

**Rationale**: The literal grep false-positives today: `StudioShell.tsx` imports
`UnfinishedGalleryIndicator` from `./components/UnfinishedGalleryIndicator.tsx` — a legitimate,
non-editor component whose name happens to contain "Gallery". A name-substring check would either
need a hand-maintained exception list (fragile, silently stale) or would fail on an unrelated,
correct import the moment it landed. Matching on the actual `editors/` path segment is precise or
regardless of what a future component is named, and mirrors what the depcruiser rule (Decision 2)
already checks structurally — the vitest source-guard is a fast, no-build-step early signal for
the same invariant.

**Alternatives considered**: The spec's literal grep command, run as a `pnpm lint` script step —
rejected for the false-positive reason above. Relying on `pnpm depcruise` alone with no vitest
guard — rejected because `depcruise` is a separate, slower CI step; a source-guard inside the
existing `manifest.test.ts` suite gives the same signal on every `pnpm --filter
@keyboard-studio/studio test` run.

## Decision 4 — Reuse `StepHost.tsx` as FR-006's mediating layer; build nothing new

**Decision**: No new step-host or component-registry module is built. `StepHost.tsx`'s existing
`manifest.find((s): s is EditorStep => s.id === activeStepId && s.kind === "editor-step")` plus
`const Component = resolvedStep.component` **is** the manifest-resolution mechanism FR-003 and
FR-006 ask for ("either a step-host module or the registry mechanism... an existing function").

**Rationale**: Investigation confirmed `StepHost.tsx` was already built in spec 028 Stage 5, before
this spec existed, specifically to remove StudioShell's per-step switch/import. FR-006 explicitly
forbids this feature from implementing a real step-host/registry runtime — only from enforcing that
the seam exists. Building a second, parallel `resolveStepComponent()` function alongside the
already-working `StepHost` would violate FR-006 and create exactly the kind of duplicate routing
path Principle IX (FR-001) is meant to prevent.

**Alternatives considered**: A standalone `resolveStepComponent(stepId)` function as FR-003's
literal example suggests — rejected; `StepHost.tsx` already fills that role, so adding a second
one would be dead code the moment it shipped (FR-006 violation).

## Decision 5 — Constitution edit scope: Article IX text, one cross-reference bump, one version-footer bump

**Decision**: The constitution amendment lands as (a) a new `### IX.` section under Core Principles
using FR-001's quoted text verbatim (see [contracts/constitution-principle-ix.md](./contracts/constitution-principle-ix.md)),
(b) the "Constitution Check against Articles I–VIII" sentence in the Authoring workflow section
updated to "I–IX", and (c) the version footer's `Last Amended` date bumped to the date the
amendment actually lands (not a date decided at planning time).

**Rationale**: `constitution.md` already has exactly one other cross-reference to the full article
range ("Articles I–VIII") that would silently go stale if left unedited — the governance
convention documented at the bottom of the file ("Amendments to this file follow the change that
prompted them... the relevant Article is updated in the same change and the version footer below
is bumped") already requires both edits.

**Alternatives considered**: Leave the "Articles I–VIII" cross-reference alone — rejected as an
immediate, obvious inconsistency in the same file the amendment is landing in.
