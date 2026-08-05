# Data Model: 057 Bulletproof navigation

Five entities. None is a contracts-package type: all five are studio-local, and none is added to the durable draft envelope in v1 (FR-051, FR-071). Existing types they build on — `DecisionEntry`, `DecisionRecord`, `TraversalSnapshot`, `ActiveStepId` — are unchanged.

---

## Location

Where the author is, addressable and shareable (spec Key Entities). Lives in `packages/studio/src/lib/location.ts`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `route` | `RouteId` | yes | The existing seven-value union, unchanged. Still filtered by `VALID_ROUTES` (so `flowmap` stays dev-gated and `trail` stays unconditional). |
| `step` | `ActiveStepId` | no | Only meaningful when `route === "survey"`. Absent means "wherever the walk is". |
| `question` | `string` | no | A `questionRegistry` id. Requires `step` to be present; a `question` without a `step` is a parse failure, not a partial location. |

**Validation rules**

- A location with `question` set and `step` absent is invalid — `parseLocation` returns `null`, and the caller falls back to the landing route.
- `route` must satisfy `isRouteId`; an unknown token falls back to `defaultLandingRoute()`, exactly as the current `hashToRoute` does.
- `step` and `question` are **not** validated at parse time. Parsing accepts any slug; whether the step or question exists in this build is `resolveLocation`'s job, because that is where FR-013's reason has to be produced.
- Serialization is total for any valid value: `parseLocation(formatLocation(loc))` deep-equals `loc`.

**State transitions.** A `Location` is immutable. `jumpToLocation` produces a new one; nothing mutates one in place.

---

## LocationResolution

The outcome of asking whether a `Location` can be honoured. A discriminated union — FR-012 forbids a partial-arrival outcome, so there is no fourth case and no nullable variant.

```
| { kind: "reachable";   location: Location }
| { kind: "unreachable"; location: Location; reason: UnreachableReason }
| { kind: "degraded";    requested: Location; to: Location; reason: UnreachableReason }
```

`UnreachableReason` is a closed set — each member exists because a spec Edge Case or FR names it:

| Reason | Raised when | Named by |
|---|---|---|
| `step-not-in-build` | `step` is not in `manifest` | Edge case: renamed step in a restored draft |
| `question-not-in-build` | `question` is not in `questionRegistry` | Edge case: retired question |
| `skipped-by-track` | the step exists but the active track does not walk it | Edge case: `project_name` on the adapt track; FR-013 |
| `beyond-gate` | the step is ahead of the author's reached position, behind a lock or gate | Edge case: forward jump; FR-013 |
| `no-project` | no working copy is instantiated, so no wizard location exists | FR-040, US4 scenario 5 |

**Rules**

- `degraded` MUST name a `to` that itself resolves `reachable` — FR-014's "nearest valid ancestor", found by dropping `question`, then dropping `step`, then falling back to the route alone.
- A `reachable` resolution carries the location back so the caller never re-derives it.
- `resolveLocation` is pure: `(location, ctx) => LocationResolution`, where `ctx` supplies the manifest, the question registry and a traversal snapshot. It reads no store and touches no browser API.

---

## ViewState

Per-tab presentation settings with no authoring meaning (spec Key Entities). One zustand store, `stores/viewStateStore.ts`, keyed by surface. Session-scoped by construction: a module singleton survives a route unmount, and a reload starts a new JS context (D-5).

| Slot | Type | Initial | Replaces |
|---|---|---|---|
| `flowMapSection` | `Section` | `"flow"` | `DashboardView.tsx:432` `useState` |
| `trailCollapsedSteps` | `ReadonlySet<string>` | empty | `DecisionTrailView.tsx:112` `useState` |
| `trailShowSuperseded` | `boolean` | `false` | `DecisionTrailView.tsx:107` `useState` |
| `paneSplitPct` | `Record<"survey" \| "compare" \| "output", number>` | per-screen init constants | `useResizablePanes`' internal state, per screen |
| `oskMode` | `Record<"survey" \| "compare", OskMode>` | `"desktop"` | `SurveyView` and `CompareScreen` `useState` |
| `scrollTop` | `Record<string, number>` | `{}` | nothing today — new, keyed by a stable pane id |
| `compareSelection` | `CompareSession \| null` | `null` | `usePreviewArtifact`'s local picker state (Q5) |

**Validation rules**

- Every slot is presentation-only. FR-053: reading or writing one MUST NOT reach a compile, a validator run, or any authoring store. A slot whose value could change an emitted artifact does not belong here.
- `paneSplitPct` values are clamped to each screen's existing `minPct`/`maxPct` on read, so a stale value from a prior layout cannot produce an unusable split.
- `scrollTop` keys are stable pane identifiers, not array indices, so adding a pane cannot silently re-target a restored offset.

**State transitions.** `reset()` clears every slot to initial and is called from exactly the two start-over paths that already reset the other stores (FR-052) — `handleStartOver()` and WelcomeScreen's "I'm new".

---

## ProgressDot

One mark in the footer's **journey row** (spec Key Entities). Derived, never stored — `decisions/progressDots.ts` assembles the row on each render. The row is the whole journey, not a history (FR-042, resolved 2026-08-03).

| Field | Type | Notes |
|---|---|---|
| `kind` | `"completed" \| "current" \| "upcoming"` | The dot's class. Determines how it is drawn (size or shape, never colour alone — FR-046) and whether it is a jump target. |
| `id` | `string` | The question id for `completed`/`current`; the step id for `upcoming`. |
| `location` | `Location` | Where activating it goes. `{ route: "survey", step, question? }`. |
| `label` | `string` | Localized. Question dots resolve through the existing `createLookupQuestionLabel` (`audit_label` → `prompt`); stage dots use the stage's own label. Never blank. |
| `resolution` | `LocationResolution` | Pre-resolved, so a dot renders a refusal reason instead of a dead control (FR-035 via FR-045). An `upcoming` dot behind a gate resolves `unreachable` with `beyond-gate`. |

**Derivation rules — three sources, one row**

*Completed dots* — from the decision record:

- Source: `effectiveEntries(record.entries)` filtered to `payload.kind === "survey-answer"`, in record order. `effectiveEntries` already collapses supersession chains, so FR-042's "a revised question has exactly one dot" holds without a rule of its own.
- A dot exists **exactly when** the question recorded an entry (Q1 resolved: by construction, no opt-out flag in v1, no exclusion list). `notice` nodes and pure-acknowledgement screens record nothing and are excluded with no filter written.
- Entries with `stepId === PRE_IDENTITY_STEP_ID` produce no dot — there is no step to jump to.
- A truncated or partially-unreadable record (053 FR-011) yields dots only for the entries that survived. No dot is fabricated for a missing entry.
- Because answers are recorded at step completion (dot timing resolved), a completed dot appears when its **step** finishes, not the instant the question is answered.

*The current dot* — from traversal state, **not** the record, which is what makes it per-question accurate inside a step whose answers are not yet recorded (FR-060). Never a jump target to itself (FR-061).

*Upcoming dots* — from the `ProjectedPath` below, one per stage still ahead. `editor-action` and `base-contribution` entries never produce a dot of their own; stages appear via the projection, visually distinct from question dots (Q2 resolved: stages **are** in the row).

**Invariant.** Nothing off the author's path appears in the row, in any class — not even greyed out (FR-049a).

---

## ProjectedPath

The steps and questions this author will still walk, given the answers so far. Supplies the row's look-ahead and is why the row can change length mid-walk.

| Field | Type | Notes |
|---|---|---|
| `upcomingSteps` | `readonly ActiveStepId[]` | Stages still ahead, in walk order. |

**Rules**

- **Read, do not re-derive.** Sourced from `dashboard/manifestProjection.ts` (with `pathOverlay.ts` for the walked half) — the flow map already computes this, and FR-049b forbids a second derivation.
- Scoped to the active track and the forks already resolved. A step the track skips, and a branch not taken, are simply absent.
- **Grows**: when the walk reaches an optional or conditional question not previously known to be on the path, its dot is appended at that point (FR-049c). A lengthening row is expected, not a defect.
- **Shrinks at the tail only**: when a branch resolves away previously-projected stages, their `upcoming` dots leave the row. Already-`completed` dots are never removed by a re-projection (FR-049d, FR-063).

---

## CompareSession

A keyboard loaded on the Compare tab for inspection (spec Key Entities). Held in `viewStateStore.compareSelection`, so it survives tab switches and dies on reload — Q5's default exactly.

| Field | Type | Notes |
|---|---|---|
| `baseKeyboard` | `BaseKeyboard` | The foreign keyboard being inspected. |
| `oskMode` | `OskMode` | Which OSK view the author last had open. |

**Invariants — these are the US2 requirement, stated as data rules**

- A `CompareSession` has no field that references the working copy, and no path from it into `workingCopyStore`, `surveySessionStore`, `phaseBDraftStore` or `decisionLogStore` (FR-021).
- It never carries a `ScaffoldSpec` and never carries an identity patch: the Compare tab exposes neither control (FR-023, Q4's read-only default).
- It is never serialized — not to the durable draft, not to the zip, not to a PR body (FR-021, spec Assumptions).
- Selecting or changing one instantiates nothing: `useCompareArtifact` passes no `onInstantiate`, so there is no rebase path to confirm or refuse (FR-022, D-6).
