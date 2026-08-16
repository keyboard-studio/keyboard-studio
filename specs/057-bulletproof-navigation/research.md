# Research: 057 Bulletproof navigation

Audited against `main` at `70b6c620`. Each decision below records what was chosen, why, and what was rejected. The spec's ten Q-clarifications are unresolved as recorded defaults; where a decision depends on one, the default is taken and named.

---

## D-1 — Fix the traversal reset by deleting it, not by adding a session-identity mechanism

**Decision.** Delete the mount-time reset in `SurveyView` ([StudioShell.tsx:452-458](../../packages/studio/src/StudioShell.tsx#L452)) together with its `wasDraftRestoredThisBoot()` guard. Add no replacement mechanism.

**Rationale.** The reset is the *only* thing standing between the current behaviour and FR-002/FR-003, and the two paths FR-003 requires already exist and already reset explicitly:

- `handleStartOver()` calls `sessionReset()` directly ([StudioShell.tsx:1064-1073](../../packages/studio/src/StudioShell.tsx#L1064)), before `resetSurvey()`, with a documented ordering rationale.
- WelcomeScreen's "I'm new" calls `useSurveySessionStore.getState().reset()` directly ([WelcomeScreen.tsx:168](../../packages/studio/src/components/WelcomeScreen.tsx#L168)), alongside `discardActiveDraft()` and the working-copy reset.

`grep` over `packages/studio/src` finds exactly these three `surveySessionStore.reset()` call sites and no others. So the mount reset is not load-bearing for start-over; it is purely the D-1 defect. Deleting it makes FR-005 fall out for free — every entry point in D-3 already sets the target step and then navigates, and was defeated only by the reset that ran next — and makes FR-007 fall out too, because `charactersSubStage` stays `"B"` so `CharactersStep`'s prefill→B transition (the sole caller of `resetPhaseBDraft()`, [CharactersStep.tsx:58](../../packages/studio/src/survey/CharactersStep.tsx#L58)) is never re-entered. D-2 disappears with it: the autosave subscription ([draftPersistence.ts:872-874](../../packages/studio/src/lib/draftPersistence.ts#L872)) keeps firing on every store change, but there is no longer a reset for it to persist.

**Alternatives considered.**
- *A `hasNavigatedWithinSession` flag consulted by the mount effect.* Rejected: it adds a second notion of "is this a new session" beside the two explicit start-over paths, and the two can drift. The bug is precisely that component lifetime was being used as a session boundary; a flag keeps that framing.
- *Make the reset route-aware (reset only when arriving from `#welcome`).* Rejected: same objection, plus it couples the traversal store to the router, which FR-006 pushes against.
- *Keep the reset and have callers re-set their target after mount.* Rejected outright — FR-005 forbids exactly this (a caller must not need a compensating step), and it is the workaround `resumeProject`'s docstring already apologises for.

**Consequence to carry forward.** `resetOrRestoreSettledRef` exists only to order this effect before `useSurveyBrowserHistorySync`'s mount tag. Deleting the effect removes the guard's antecedent — see D-9.

---

## D-2 — Widen the hash to a path grammar, keep one router

**Decision.** `#<route>[/<step>[/<question>]]`, e.g. `#survey/characters/pb_rtl_direction_confirm`. `RouteId` stays exactly as it is and remains what `VALID_ROUTES` filters; a new `lib/location.ts` owns `parseLocation(hash)` / `formatLocation(loc)`, and `navigateTo` accepts either a `RouteId` (unchanged call sites keep compiling) or a full `Location`.

**Rationale.** It is the smallest change that satisfies FR-010/FR-011 while honouring FR-006 and the spec's assumption that the hash router is retained. Segments are already the natural shape: a step id and a question id are both opaque slugs with no reserved characters, so the grammar needs no escaping rules. Keeping `RouteId` intact means the existing `isRouteId`/`VALID_ROUTES` dev-gate for `flowmap` and the production-surface exemption for `trail` survive untouched.

**Alternatives considered.**
- *Query form, `#survey?step=characters&q=…`.* Rejected: two grammars inside one hash, and `URLSearchParams` on a fragment is a well-known source of subtle bugs when a route itself contains `?`.
- *A client-side routing library.* Rejected — the spec's Out of scope names it.
- *A separate, non-URL location store with the hash left alone.* Rejected: FR-011 requires the location be expressible in the address bar and shareable.

---

## D-3 — Location resolution is one pure function returning a discriminated union

**Decision.** `resolveLocation(loc, ctx): LocationResolution`, where the result is one of `reachable`, `unreachable` (with a reason drawn from a closed set), or `degraded` (naming the ancestor it fell back to). Pure — it takes the manifest, the `questionRegistry` and a traversal snapshot as `ctx` and touches no store directly.

**Rationale.** FR-012 forbids partial arrival and FR-013 requires the *reason* to be named, not inferred, which makes a boolean or a nullable return unusable. A closed reason set (`step-not-in-build`, `question-not-in-build`, `skipped-by-track`, `beyond-gate`, `no-project`) is what lets FR-035 render a reason in place of a link and FR-014 land on the nearest valid ancestor. Purity is what makes the resolution table unit-testable without a DOM, which is where the spec says most of this feature is proven.

**Alternatives considered.**
- *`boolean` plus a separate `whyNot()` call.* Rejected: two calls can disagree, and the caller can forget the second.
- *Throwing on an unreachable location.* Rejected: an unreachable location is an ordinary, expected outcome here (a shared link into a skipped step), not an exception.

---

## D-4 — One jump primitive, shared by every surface that jumps

**Decision.** `jumpToLocation(loc)` in `lib/jumpToLocation.ts` is the single implementation: resolve, then either set the traversal target and `navigateTo`, or surface the refusal. The trail's deep links (FR-030), the footer dots (FR-045) and the breadcrumb segments (FR-061) all call it.

**Rationale.** FR-045 and FR-061 say this in as many words ("one jump implementation, not two"). It also concentrates the FR-034 revise-and-return bookkeeping — the "where I came from" memory and the explicit "continue from here instead" affordance — in one place instead of three.

**Alternatives considered.** *Per-surface handlers sharing only the resolver.* Rejected: the return-target bookkeeping is the subtle part, and three copies of it is three chances to lose the origin.

---

## D-5 — Per-tab view state is a module-level zustand singleton with no storage at all

**Decision.** `stores/viewStateStore.ts`, a plain zustand store. No `sessionStorage`, no `localStorage`, nothing added to the durable draft.

**Rationale.** A module-level singleton survives a route unmount and dies when the JS context does — which is *exactly* Q9's default ("survives tab switches, not reloads") achieved by construction rather than by persistence code. It satisfies FR-051 with nothing to enforce, FR-053 trivially (a store read is inert), and FR-052 by adding one `reset()` call to the two start-over paths. It matches the house idiom: `surveySessionStore` already exists precisely because component-local state did not survive remounts.

**Alternatives considered.**
- *`sessionStorage`.* Rejected: it survives a reload, which *violates* Q9's default and would then need explicit clearing on start-over in a second place.
- *React context lifted above the route switch.* Rejected: it works, but it makes every consumer a context consumer and diverges from the three existing zustand stores.
- *Adding view state to `TraversalSnapshot`.* Rejected: FR-051 forbids it in v1, and FR-071 requires the durable envelope keep round-tripping unchanged.

---

## D-6 — Compare gets its own read-only pipeline hook; `usePreviewArtifact` is untouched

**Decision.** New `hooks/useCompareArtifact.ts` that runs `useKeyboardArtifact` **without** an `onInstantiate` callback and **without** `useWorkingCopyTransform`. `PreviewScreen.tsx` is replaced by `CompareScreen.tsx`, which drops `TrackOneIdentityPanel` and the scaffold-form path entirely. `usePreviewArtifact` keeps its name and its behaviour for `OutputScreen`.

**Rationale.** Both D-6 write paths are structural, so the fix must be structural. `TrackOneIdentityPanel` calls `setIdentity` on the shared store on every valid change; the picker's `onInstantiate` reaches `instantiateFromBaseIfConfirmed`, which for a genuinely *different* base is designed to fall through to a rebase that resets `phaseResults` and `irAxes` ([usePreviewArtifact.ts:172-176](../../packages/studio/src/hooks/usePreviewArtifact.ts#L172)). Not passing the callback means there is no code path to guard — which is what FR-025 demands ("the absence of a write path is the requirement"). Dropping `useWorkingCopyTransform` is also correct on its own merits: it projects the *author's* carve overlay onto whatever base is compiled, which is meaningless for a foreign keyboard.

FR-026 explicitly protects `usePreviewArtifact`'s name as an unrelated use of the word, so it is not renamed and `OutputScreen` is not touched.

**Alternatives considered.**
- *A `readOnly: true` flag on `usePreviewArtifact`.* Rejected, and this is the decision that matters most for US2: the isolation guarantee would then rest on the flag being passed correctly at every call site, and a future call site that forgets it silently re-arms the trap. FR-025 asks for a guarantee an adversarial test can establish, and "the write path does not exist in this module" is that; "a boolean is set" is not.
- *Q4's sandboxed model (Compare edits a throwaway copy).* Rejected for v1 per Q4's own recommended default: read-only is the smaller change, cannot lose work, and matches the stated purpose. The hook shape above leaves the door open — a sandbox copy would be a second store instance, not a change to this decision.

---

## D-7 — The footer row is the whole journey, assembled from three sources

**Updated after clarification (2026-08-03).** Q1, Q2, Q7 and the dot-timing question resolved this area; the decision below is the post-clarification one.

**Decision.** `decisions/progressDots.ts` assembles one row from three sources, and the footer is also the breadcrumb (Q7 — no separate bar):

1. **Completed dots** — `effectiveEntries(record.entries)` filtered to `payload.kind === "survey-answer"`, in record order.
2. **The current-position marker** — from traversal state, *not* the record.
3. **Upcoming-stage dots** — from `dashboard/manifestProjection.ts`, read rather than re-derived.

Labels come from the existing `createLookupQuestionLabel` ([lookupQuestionLabel.ts](../../packages/studio/src/decisions/lookupQuestionLabel.ts)), which already resolves `audit_label` → `prompt` through the localized content seam. Question and stage dots differ by size or shape as well as colour. Nothing off the author's path appears in any class.

**Rationale.** Each source is load-bearing for a different reason, and collapsing them would break something:

- `effectiveEntries` already collapses supersession chains, so FR-042's "a revision has exactly one dot" is satisfied by the existing helper rather than by a new rule.
- Reading position from **traversal** rather than the record is what makes the marker per-question accurate. Answers are recorded at step completion, so a record-derived marker would be step-granular — and the longest stretches of the walk are multi-question steps, which is precisely where "where am I" matters most. This is why the hybrid was chosen over changing the recording path: moving 053's capture boundary would affect the diff attached to each entry and the supersession chains, a real regression risk to a shipped surface, for an outcome the traversal store already provides for free.
- Reading the look-ahead from the flow map's **existing** projection satisfies FR-049b directly. The projection already understands track scoping and resolved forks, which is exactly what "only this author's path" requires — so path-scoping, row growth on reaching an optional question, and tail re-projection on a branch resolving all fall out of the projection's own semantics rather than needing rules of their own.

Q1 resolved to exclusion **by construction with no opt-out flag**: a dot exists exactly when the question recorded an entry, so `notice` nodes and acknowledgement screens are excluded with no filter written, and a substantive question that merely has `confirm` in its id (`pb_rtl_direction_confirm`, a required routing boolean) correctly keeps its dot. Dropping the flag also removes a Content-team hand-off the earlier draft carried, since no question is known to need suppressing.

**Alternatives considered.**
- *A dedicated progress counter in the survey store.* Rejected: a second source of truth for "which questions are done", to be kept in step with the record across revisions and restores.
- *Excluding by an `*_confirm` id pattern.* Rejected — Q1 shows the pattern is wrong.
- *Changing the recording path to commit per question.* Rejected as above: it buys immediacy at the cost of moving 053's capture boundary, when traversal state already answers the question.
- *A second derivation of "what comes next" local to the footer.* Rejected by FR-049b, and it would drift from the flow map's answer — two surfaces disagreeing about the remaining path is worse than either being wrong.
- *Showing off-path questions greyed out.* Rejected by FR-049a on the author's instruction: a dot for a question they will never see is noise that misrepresents the length of the journey.

---

## D-8 — Retire `nav.preview`; extract the project-label precedence rather than fork it

**Decision.** Add `nav.compare` (plus `compare.*` ids for the pane label and heading) and retire `nav.preview`; do not reuse the old id. Both `en` and `fr` catalogs are updated in the same change — note `fr`'s `nav.preview` is currently an empty string, so nothing is lost there, while `preview.heading` and `preview.pane.label` *are* translated and their replacements will start untranslated. For the footer's project name, extract `deriveLabel`'s precedence out of [draftAutosave.ts:180-187](../../packages/studio/src/lib/draftAutosave.ts#L180) into `lib/projectLabel.ts` and have both `deriveLabel` and the footer call it.

**Rationale.** FR-020 is a *meaning* change, which the catalog rules say takes a new id. FR-041 says the footer must not be a fourth derivation, and `deriveLabel` is the shipped third — but it is module-private and takes a `StudioDraft`, so the footer needs a live-store sibling. Extracting one function that both call is the only way to avoid a genuine fork.

**Discrepancy — CORRECTED 2026-08-03 after crew review. The original conclusion below was wrong; FR-041 is right.**

~~*Resolved in favour of the shipped code.* FR-041 states the precedence as scaffold spec → identity patch → base keyboard; the shipped `deriveLabel` is identity english → identity autonym → scaffold spec → base keyboard. This plan keeps the **shipped** order and treats the parenthetical as a loose paraphrase. Changing it would rename every card in "My keyboards", which is out of scope.~~

The error was examining only one of **two** coexisting draft engines. `draftAutosave.deriveLabel` ([draftAutosave.ts:180-187](../../packages/studio/src/lib/draftAutosave.ts#L180)) is the outlier, not the reference. The engine that actually backs the "My keyboards" cards is `draftPersistence.ts` — `MyKeyboardsList.tsx:51` imports `listDrafts` from it, and its `saveDraft` computes the label at [draftPersistence.ts:477-481](../../packages/studio/src/lib/draftPersistence.ts#L477) as:

```
session.scaffoldSpec?.displayName ?? wc.identity?.displayName ?? wc.baseKeyboard?.displayName ?? null
```

That is FR-041's stated order **verbatim, already shipped**, down to the source comment ("Track-1 scaffoldSpec (project_name step) first, then the identity patch's displayName … then the base keyboard's own display name as a last resort"). FR-041 was quoting real code all along.

Two consequences:

- **The blast-radius argument was backwards.** Conforming `deriveLabel` to FR-041's order renames *nothing* on the "My keyboards" cards — they are already correct. Its only reader is the resume banner's quoted name ([ResumeDraftBanner.tsx:90](../../packages/studio/src/components/ResumeDraftBanner.tsx#L90)), and only in the narrow case where `identityResult` disagrees with `scaffoldSpec` — a case with zero existing test coverage.
- **Spec 072 settles it independently.** [specs/072-my-keyboards/spec.md](../072-my-keyboards/spec.md) describes the label as derived from `workingCopy.identity` — the identity *patch*, per `workingCopyStore.ts:182` — not `survey.identityResult`, which is the language-identify answer `deriveLabel` reads. 072's account is true of `draftPersistence` and false of `draftAutosave`.

**Decision as corrected**: `lib/projectLabel.ts` implements FR-041's order, and **both** engines converge on it (tasks T009, T014, T015). The `draftPersistence` side is a pure substitution; the `draftAutosave` side is a real, small behaviour change confined to the resume banner.

**Alternatives considered.** *A footer-local derivation.* Rejected by FR-041. *Renaming `usePreviewArtifact`, `basePreviewStatusStore`, and the Studio tab's live OSK.* Rejected — FR-026 names all three as out of the sweep.

---

## D-9 — Re-derive the history bridge's premise; the preserved position makes it more correct, not less

**Decision.** Keep `useSurveyBrowserHistorySync`'s design (one push per advance, one popstate listener, mutate only on an `expectedBackTarget` match). Three changes: rewrite the module docstring's premise, replace the `resetOrRestoreSettledRef` DEV ordering guard whose antecedent D-1 removes, and add unit coverage for the preserved-position case.

**Rationale.** Tracing the hook against a preserved store:

- A tab switch sets `window.location.hash`, which pushes a browser entry with `state === null`. `readKsStep` returns `undefined` for it, so the listener treats it as foreign and no-ops — a native Back across a tab switch undoes the *tab switch* and leaves the wizard where it is, which is the correct reading of FR-016.
- Returning to `#survey` remounts `SurveyView`; effect 1 `replaceState`s the current entry with the store's `activeStepId`. Previously that tagged a *reset* store (always `"identity"`); now it tags the preserved step. The tag therefore agrees with the store in *both* cases, which is what the hook's sync invariant actually asks for — the invariant is preserved, and its justification gets simpler.
- `expectedBackTarget` is computed live from the preserved `history`, so the pre-departure entries still on the browser stack now match the prediction instead of being stale. Back steps through steps the author really walked, satisfying FR-016.

FR-016 explicitly keeps the two accepted degrades (browser Forward is a no-op; the first native Back after an in-app Back is absorbed), so neither is reopened. The DEV ordering guard cannot simply be dropped: without it, a future reordering silently re-tags with a stale value. It is re-pointed at draft-restore settlement, which is the antecedent that genuinely remains.

**Alternatives considered.**
- *Route the in-app Back button through `window.history.back()` to remove the absorbed-Back degrade.* Rejected: FR-016 declares that a separate, explicit decision, and it would invalidate every existing in-app-Back test's synchronous assertions.
- *Rebuild the bridge on the new `Location` grammar (push a full location per advance).* Rejected for v1: it couples the two changes, and the existing `ksStep` tagging already carries what the prediction needs. Worth revisiting once locations are load-bearing.

**Early-warning system.** [browser-back.spec.ts](../../packages/studio/e2e/browser-back.spec.ts) and `useSurveyBrowserHistorySync.test.ts` are the guards; SC-014 requires the former to pass with a tab round trip inserted mid-walk.

---

## D-10 — The first-visit gate holds the requested location instead of discarding it

**Decision.** `hashToRoute`'s welcome forcing keeps its `replaceState` to `#welcome`, but stashes the parsed requested `Location` in a module-level pending slot first. `leaveWelcome`'s continuation consumes it: if a pending location exists, jump to it through `jumpToLocation` (so the reachability rules apply); otherwise navigate to `survey` as today.

**Rationale.** FR-015 requires the location survive the gate and be honoured on exit. The `replaceState` cannot simply be removed — it exists because leaving the hash on a deep-linked value makes WelcomeScreen's `navigateTo("survey")` a same-value assignment that fires no `hashchange` and soft-locks the user on the welcome screen (documented at [StudioShell.tsx:172-180](../../packages/studio/src/StudioShell.tsx#L172)). A module-level pending slot is the minimal addition that keeps that fix intact. Routing the resumption through `jumpToLocation` rather than a raw hash write means a shared link into a step this visitor's track skips refuses with a reason (FR-013) instead of stranding them.

**Alternatives considered.** *Encoding the pending location in the `#welcome` hash itself.* Rejected: it puts a location the app is deliberately not honouring yet into the address bar, and a reload mid-welcome would then re-request it. *`sessionStorage`.* Rejected: unnecessary — the gate and its exit are within one JS context.
