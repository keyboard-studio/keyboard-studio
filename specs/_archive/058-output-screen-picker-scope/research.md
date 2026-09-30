# Phase 0 Research: Output-screen picker scope

Written retroactively (2026-08-18) against the shipped code, to record the
decisions the review-cycle amendments in `spec.md` show were actually made.
Each entry resolves one open question `spec.md`'s Key Entities section left
for `/speckit-plan`, or one design fork the pattern audit surfaced.

## Decision: variant is a prop on the existing `PickerPane`, not a new component

**Rationale**: `PickerPane` already owns the layout (heading, description,
mode toggle, picker/scaffold slots, identity/KMN slots, MetadataCard) that
both the cold-arrival and ship-time cases share — identity naming and a final
source tweak are legitimate at ship time (spec Assumptions), so most of the
element tree is common. A `variant?: "full" | "shipping"` prop defaulting to
`"full"` keeps `PreviewScreen`'s historical caller (now: cold arrival at
`#output`, per the rebase amendment) unchanged with zero call-site edits,
satisfying FR-001's "existing full behaviour MUST remain the default."

**Alternatives considered**: A second component (`ShippingPane`) duplicating
the shared slots. Rejected — `identityPanelSlot`/`kmnEditorSlot` would need to
render in two places, and FR-005 requires that a mid-visit variant flip (the
late-instantiation race) reconcile *in place* rather than unmount/remount;
two sibling components can't share one React element identity across a flip,
which reopens exactly the D1-shaped bug this feature closes (a control that
resets on remount).

## Decision: variant selection is a live store subscription, not a mount-once read

**Rationale**: FR-003 and the Edge Cases section both name the same failure
mode D1 already demonstrated — `pickerMode`'s `useState<PickerMode>("open")`
never re-read the store after mount, so a Track 1 scaffold still showed
"Open base" pressed. If `OutputScreen` computed the variant once at mount
(e.g. from a ref or an effect with an empty dependency array), the identical
bug reappears one level up: `usePreviewArtifact`'s documented late-settling
instantiation (`usePreviewArtifact.ts:110-118`) would leave the full picker
on screen for an author who, by the time they look, has one.

**Alternatives considered**: Deriving the variant from a route/navigation
event (e.g. "instantiated on entry to `#output`"). Rejected — that only
recomputes on navigation, not on the async settle that can happen *after*
arrival, which is precisely the race Edge Cases calls out.

**Implementation**: `useWorkingCopyStore((s) => s.isInstantiated())` —
Zustand's selector re-renders `OutputScreen` on every store change to that
boolean, closing the race without a new effect or timer (satisfies FR-010).

## Decision: "Change base keyboard" is a navigation action, never a mutation

**Rationale**: D2 is that a destructive control (re-instantiate, discarding
carve deletions and survey phases) sits on the ship-it screen guarded only by
`window.confirm`. Spec's Assumptions and FR-006 are explicit that the fix is
to *relocate* base-switching to `choose_base`, not to add a second/better
confirm dialog on Output (Out of scope also rules out replacing
`window.confirm` — that stays the survey-path guard, unchanged). So the
Output-side control's contract is: it must never call `instantiateFromBase`
or any working-copy mutator itself.

**Alternatives considered**: An in-place richer confirm modal on Output
(replacing `window.confirm` for this one entry point). Rejected by the spec's
own Out of scope list — reworking the dialog is a separate concern, and
building a *second* confirm surface duplicates the one `confirmRebaseTo`
already provides at `choose_base`, reintroducing exactly the "kept in
agreement by prose rather than by code" shape the D4 pattern audit flags for
derived ids.

## Decision: back-navigation via a new `backToChooseBase` action, not `advance("choose_base")`

**Rationale** (Key Entities left this open for `/speckit-plan`): the
navigation is conceptually a BACK — the author is undoing "I already chose a
base" — but `choose_base` is not the step immediately behind wherever they
are sitting (typically several steps ahead, having finished the whole
survey), so the existing single-step `popHistory()` can't express it. A
forward `advance("choose_base")` was rejected because it would *push* onto
history, leaving every step between `choose_base` and the departure point
still on the stack; a later ordinary Back from the picker would then walk
forward through the survey the author just deliberately left (FR-007's
"history free of stale forward entries").

**Resolution**: `backToChooseBase()` rewinds `history` to the prefix that was
walked *before* `choose_base` was first reached (typically just
`["identity"]`), following the same rewind shape as the existing
`backToTouchSeedSource`/`backToUnfinishedGallery` primitives rather than
inventing a new history semantics. It also clears `baseConfirmed`, because
`StudioShell`'s single-instantiation effect commits as soon as a compile
settles for the confirmed base — leaving that flag `true` while landing back
on the picker would let the very next settle instantiate *without* the
author re-clicking "Choose this keyboard," which is the same
discard-without-confirmation shape D2 already named as the defect.

**Alternatives considered**: Reusing `backToUnfinishedGallery` by generalizing
its target union. Rejected — that action's docstring documents a
desktop-first "jump past" semantics specific to gallery re-entry; overloading
it for `choose_base` would couple two independently-evolving back-navigation
shapes for no shared logic beyond "pop history," which the dedicated action
avoids.

## Decision: one id-resolution function (`outputKeyboardId.ts`), called from both sites, in its own module

**Rationale**: D4 is two independent derivations of "which keyboard id" — the
emitted filename (`identity.keyboardId` via `serializeWorkingCopy`) and the
aria-label (`pickerMode`/`scaffoldSpec` via `OutputScreen`) — kept in
agreement by prose, not code, and they drifted. The fix per the pattern audit
is to point both at one function rather than "correct" the aria-label's
expression in place, which would just be a second independent derivation that
happens to currently match.

**Alternatives considered**: Exporting the helper from `serializeWorkingCopy.ts`
alongside its main function. Rejected — `OutputScreen.test.tsx` and
`ManagedPRSubmitPanel.test.tsx` both `vi.mock` that module wholesale (to keep
the engine/zip services out of component-render tests), which would make the
helper read as `undefined` in exactly the tests covering the aria-label it
fixes. A standalone pure module with no store/engine/service imports needs no
mock and is mocked by nobody.

**Sibling audit (from spec's Pattern audit section, carried into this
research for traceability)**: the same `identity?.keyboardId ?? …id` shape
was swept across `packages/studio/src`. One further site
(`createStudioDecisionRecorder.ts:105`) was restating the same expression by
comment-only convention and was converted to *call* the canonical
`deriveProjectKeyFromWorkingCopy` (`draftPersistence.ts`) instead. A second
site (`draftAutosave.ts:229`) was deliberately left alone — different input
type (`WorkingCopySnapshot`, not live store state) and a different,
load-bearing fallback (`PENDING_PROJECT_KEY`) for the pending-project slot;
consolidating it is a persistence-layer change, filed as follow-up rather
than smuggled into this UI fix.

## Non-decision: no `packages/contracts` change

Confirmed during design: `BaseKeyboard` (already carrying `displayName`,
`id`, `script`) is sufficient for the read-only provenance list (FR-004); no
field needed adding, so Article I's major-version-bump gate never engages and
no §18 session was required for this feature.
