# Contract: location grammar, resolver, and jump primitive

The interface consumers and tests code against. Every identifier here is normative — the spec's E2E section and FR list pin several of them verbatim, and those are reproduced exactly.

---

## 1. Hash grammar

```
hash     := "#" route [ "/" step [ "/" question ] ]
route    := "welcome" | "survey" | "preview" | "output" | "flowmap" | "trail" | "profile"
step     := an ActiveStepId
question := a questionRegistry id
```

`route` keeps the **existing** `RouteId` token set unchanged, including the `preview` token. The FR-020 rename is author-facing labelling only; renaming the hash token would break every existing bookmark and every e2e spec's hash assertion for no requirement's sake. FR-026's sweep covers labels, aria names, headings, message ids, tests and docs — not the route token.

Examples:

```
#survey                                        the walk, wherever it is
#survey/characters                             the characters step
#survey/characters/pb_rtl_direction_confirm    one question inside it
#trail                                         the Decisions tab
```

Rules:

- No trailing slash, no empty segments. `#survey/` and `#survey//q` are parse failures.
- `question` without `step` is a parse failure (see data-model.md).
- Segments are not URL-encoded: step and question ids are `[a-z0-9_]` slugs by convention across the manifest and registry, so no reserved character can occur. A segment containing anything outside that class is a parse failure rather than a decoded value.
- Round-trip is total for valid values: `parseLocation(formatLocation(loc))` deep-equals `loc`.

---

## 2. `lib/location.ts`

```ts
export interface Location {
  readonly route: RouteId;
  readonly step?: ActiveStepId;
  readonly question?: string;
}

/** Parse a raw hash (with or without the leading "#"). Returns null on a parse failure. */
export function parseLocation(hash: string): Location | null;

/** Format a Location as a hash INCLUDING the leading "#". */
export function formatLocation(loc: Location): string;
```

---

## 3. `lib/navigate.ts` (widened, not replaced)

```ts
export type RouteId = /* unchanged, seven members */;

/** Existing signature — every current call site keeps compiling unchanged. */
export function navigateTo(route: RouteId): void;
/** Widened overload. */
export function navigateTo(location: Location): void;
```

The module invariant is unchanged and still binding: **all route changes go through `navigateTo()`; no component file assigns `window.location.hash`.** FR-006 — this is the only router; nothing here adds a second one.

---

## 4. `lib/resolveLocation.ts`

```ts
export type UnreachableReason =
  | "step-not-in-build"
  | "question-not-in-build"
  | "skipped-by-track"
  | "beyond-gate"
  | "no-project";

export type LocationResolution =
  | { readonly kind: "reachable";   readonly location: Location }
  | { readonly kind: "unreachable"; readonly location: Location; readonly reason: UnreachableReason }
  | { readonly kind: "degraded";    readonly requested: Location; readonly to: Location;
      readonly reason: UnreachableReason };

export interface ResolveContext {
  readonly manifest: readonly Step[];
  readonly questionRegistry: QuestionRegistry;
  readonly traversal: TraversalSnapshot;
  readonly hasProject: boolean;
}

/** Pure. Reads no store, touches no browser API. */
export function resolveLocation(loc: Location, ctx: ResolveContext): LocationResolution;
```

Guarantees a caller may rely on:

- A `degraded` result's `to` itself resolves `reachable` against the same `ctx`.
- The function is referentially transparent — same `(loc, ctx)` always yields the same result, which is what makes the resolution table a unit-test matrix rather than a DOM test.

---

## 5. `lib/jumpToLocation.ts`

```ts
export interface JumpOptions {
  /** Remember where we came from so FR-034's "return" affordance has a target. */
  readonly returnTo?: Location;
}

export type JumpOutcome =
  | { readonly kind: "arrived";  readonly at: Location }
  | { readonly kind: "refused";  readonly reason: UnreachableReason }
  | { readonly kind: "degraded"; readonly at: Location; readonly reason: UnreachableReason };

/**
 * The ONE jump implementation (FR-045, FR-061). The decision trail's deep links,
 * and the footer's journey dots both call this. (The footer IS the breadcrumb per Q7,
 * so there is no third caller.) An upcoming-stage dot resolves `beyond-gate` and is
 * refused rather than skipping a lock the walk enforces.
 * Resolves, then either sets the traversal target and navigates, or refuses.
 * Never partially arrives (FR-012).
 */
export function jumpToLocation(loc: Location, opts?: JumpOptions): JumpOutcome;
```

`returnTo` is what FR-034 needs: after a revision the author must be able **both** to return where they came from **and** to continue the walk from the revised point, with the choice explicit (Q3's revise-and-return default, plus an explicit "continue from here instead").

---

## 6. `stores/viewStateStore.ts`

```ts
export const useViewStateStore: /* zustand store */;
```

Slots and initial values are in [data-model.md](../data-model.md#viewstate). Contract points:

- Session-scoped with **no** storage layer — a module singleton, so it survives a route unmount and dies on reload (FR-051, Q9).
- `reset()` is called from exactly the two existing start-over paths (FR-052).
- No slot read or write may reach a compile or a validator run (FR-053).
- No slot is written into the durable draft in v1 (FR-051, FR-071).

---

## 7. `lib/projectLabel.ts`

```ts
/** The ONE project-label precedence. Both shipped draft engines and the footer call this. */
export function deriveProjectLabel(input: ProjectLabelInput): string | null;
```

Precedence — FR-041's stated order, which `draftPersistence.saveDraft` (lines 477-481) already implements verbatim:

1. `scaffoldSpec.displayName`
2. `identity.displayName` (the working-copy identity **patch**, not `survey.identityResult`)
3. `baseKeyboard.displayName`
4. `null`

FR-041: not a fourth derivation. There are **two** shipped engines, and both delegate here in the same change — `draftPersistence.saveDraft` (a pure substitution) and `draftAutosave.deriveLabel` (currently identity-english-first; a real behaviour change, visible only in the resume banner). See [research.md](../research.md) D-8, corrected 2026-08-03: the earlier reading of this contract took `draftAutosave.deriveLabel` as the reference, which was the wrong engine.

---

## 8. `hooks/useCompareArtifact.ts`

```ts
export function useCompareArtifact(): CompareArtifact;
```

The isolation contract, stated as absences (FR-021, FR-022, FR-025 — "the absence of a write path is the requirement"):

- Calls `useKeyboardArtifact` with **no** `onInstantiate` callback. There is therefore no reachable `instantiateFromBaseIfConfirmed`, no rebase-confirm dialog, and no `phaseResults`/`irAxes` reset.
- Does **not** call `useWorkingCopyTransform` — a foreign keyboard must not receive the author's carve overlay.
- Returns no setter that writes `workingCopyStore`, `surveySessionStore`, `phaseBDraftStore` or `decisionLogStore`.
- `usePreviewArtifact` is **not** modified and **not** renamed; `OutputScreen` keeps using it (FR-026).
