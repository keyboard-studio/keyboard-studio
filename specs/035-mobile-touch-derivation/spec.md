# Feature Specification: Mobile/touch layout derivation

**Feature Branch**: `035-mobile-touch-derivation`

**Created**: 2026-07-13

**Status**: Draft

**Governing docs**: [spec.md](../../spec.md) §8 ("Gallery instantiation" — the gallery is instantiated once per modality) and Decision 6 (no mobile-first path; touch is always a downstream transform of the locked desktop). [docs/workflow-model.md](../../docs/workflow-model.md) "The gallery is handled twice (one per modality)" is the supporting design reference. This feature is carved out of [specs/034-mvp-authoring-walk](../034-mvp-authoring-walk/spec.md) US2 so the mobile-derivation engineering — the largest single item in the MVP — is specified and planned on its own.

**Input**: User description: "Two cases for mobile. If the base keyboard has a reasonable touch layout, we want to continue and make similar modifications to the base's touch layout as we did to the desktop layout — this is the default: import and adapt the base's touch layout. If we do not like the base touch layout at all, we should be able to reseed it from the physical/desktop layers the way Keyman Developer does — that produces a very desktop-looking mobile keyboard — and then remove certain things programmatically to make it simpler."

---

## Context: what already exists *(read first)*

The touch stage (`touch` in [packages/studio/src/steps/manifest.ts](../../packages/studio/src/steps/manifest.ts)) is BUILT and interactive, but its **seed is wrong for the workflow**:

- [editors/assignLoop/TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx) states in its header comment that the layout is "seeded from a fixed minimal QWERTY" and that "desktop edits are NOT transferred to mobile." The QWERTY half is stale drift — the code already derives Case A seeds via `scaffoldTouchLayout` and preserves shipped layouts verbatim in Case B. The desktop-edits half is **accurate**, for a deeper reason than the comment suggests: both paths read the pristine instantiation-time base (`baseIr` / the shipped JSON), so the author's carve removals and desktop letter placements never reach the touch layout on either path (see [research.md](research.md) R3).
- The manifest contains a `touch_seed_source` fork intended to let the author choose the touch seed, but it is **dead code** — [steps/advance.ts](../../packages/studio/src/steps/advance.ts) routes `mechanisms -> touch` directly and never enters it.
- The engine touch pipeline exists and works: [pattern-apply/applyTouchAssignments.ts](../../packages/engine/src/pattern-apply/applyTouchAssignments.ts), [scaffolder/scaffoldTouchLayout.ts](../../packages/engine/src/scaffolder/scaffoldTouchLayout.ts), [codec/parse-touch.ts](../../packages/engine/src/codec/parse-touch.ts), [editors/touchSuggest/](../../packages/studio/src/editors/touchSuggest/). What is missing is **deriving the seed from the author's work** rather than from a constant.

This feature replaces the fixed-QWERTY seed with a derivation that carries the desktop work forward, per the two cases below.

## Reference implementation: Keyman Developer's physical -> OSK -> touch pipeline *(grounds US2)*

The **reseed-from-desktop** path (US2) is not novel — it mirrors a pipeline Keyman Developer (`../keyman/developer`) already ships. Understanding what Developer does, and where it stops, defines both what we can lean on and what the simplification pass must add. The pipeline is two hops:

1. **Physical layout -> desktop OSK ("Fill from layout").** Developer seeds the visual On-Screen Keyboard (`.kvks`) from the keyboard's rules — the compiled `.kmn` run through Keyman Core, key by key, so each cap is the *actual* engine output of pressing that vkey+modifier — optionally back-filling unmapped keys from the underlying Windows layout ("Auto-fill underlying layout"). Modifier keys, including AltGr/chirality, are carried across. Source: `developer/src/tike/main/UframeOnScreenKeyboardEditor.pas` (`cmdVKImportKMXClick`, `AddUnderlyingLayoutKeys`) and `Keyman.System.VisualKeyboardImportKMX.pas`.

2. **Desktop OSK -> touch layout ("Import from OSK").** Developer projects the `.kvks` into a `.keyman-touch-layout`. Source: `developer/src/kmconvert/Keyman.Developer.System.VisualKeyboardToTouchLayoutConverter.pas` (`ImportFromKVK`), seeded from a full 59-key desktop grid (`OnScreenKeyboardData.pas`) and the desktop-shaped `physical-keyboard-template.js`.

**Why Developer's touch output is desktop-shaped (and phone-unfriendly).** This is the concrete list of what the reseed projection produces and what our simplification pass therefore targets:

- It emits only **`tablet`** and **`desktop`** platforms — **never a `phone` platform**. A phone falls back to the dense tablet/desktop grid at runtime. (Our touch gallery targets phone *and* tablet — [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx).)
- It copies the **entire 5-row PC grid** — backtick+number row, three letter rows, and a Ctrl/Menu/Space/Enter bottom row — onto the touch form factor. No row-count or keys-per-row reduction exists anywhere in the path.
- **Desktop key widths carry over**, so wide Shift/Ctrl/Space/Enter keys keep desktop proportions.
- **Every non-empty modifier layer becomes a touch layer** (up to 22, including chiral ctrl/alt combinations) — desktop-modifier thinking rather than phone-appropriate default/shift/numeric layers.

The only transforms Developer already applies: skip empty shift layers, pick the chiral *or* plain shift-state block (not both) based on the AltGr flag, and rewire the modifier key to reach extended layers via longpress (deleting it when there are no extended layers). There is **no** form-factor down-sizing.

**Scope note (per user direction 2026-07-13):** we do **not** need to improve Developer's converter to be phone-friendly, and we do **not** need a perfect projection. A *reasonable* seed is sufficient — the simplification pass (FR-003/FR-008) plus the author's touch-gallery editing (FR-007) finish it. Improving Developer's own output is explicitly out of scope for this feature (see Out of Scope).

## Clarifications

### Session 2026-07-13

- Q: Where does the touch layout come from? -> A: Two cases. **Default — import-and-adapt:** if the base keyboard has a reasonable touch layout, import it as the seed and apply the same modifications the author made to the desktop layout (carve removals, letter placements). **Fallback — reseed-from-desktop:** if the base's touch layout is unusable or absent, generate the touch layout from the physical/desktop layers (the Keyman-Developer-style desktop->touch projection — see "Reference implementation" above — which yields a desktop-shaped mobile keyboard), then programmatically simplify it (reduce clutter to sensible touch affordances).
- Q: Does the reseed projection have to be a phone-perfect layout? -> A: No. A *reasonable* seed is sufficient; it does not have to be a perfect output. The simplification pass and the author's subsequent touch-gallery editing finish the layout. Improving Keyman Developer's own converter to be phone-friendly is not part of this feature.
- Q: Is the fixed QWERTY seed acceptable as a further fallback? -> A: No. The fixed minimal QWERTY seed is the behavior being replaced.

---

## User Scenarios & Testing *(mandatory)*

The user is the same language-community author from 034, who has just locked their desktop layout and now needs a mobile layout that reflects the work they already did.

### User Story 1 - Adapt the base's touch layout (default path) (Priority: P1)

The author's base keyboard ships a usable touch layout. The studio imports it as the touch seed and applies the same modifications the author made on desktop: characters carved from the desktop are removed from touch, and letters placed on desktop appear on touch. The author then fine-tunes in the touch gallery.

**Why this priority**: This is the default and the common case (most real bases have touch layouts), and it is the core promise "make similar modifications to the base's touch layout as we did to the desktop."

**Independent Test**: Author from a base with a touch layout, carve N characters and place M letters on desktop, and confirm the emitted `.keyman-touch-layout` starts from the base's layout with those N removals and M placements applied — not from QWERTY.

**Acceptance Scenarios**:

1. **Given** a base with a usable touch layout, **When** the touch stage begins, **Then** that layout (not QWERTY) is the seed.
2. **Given** desktop carve removals, **When** the touch seed is built, **Then** those characters are absent from the touch layout.
3. **Given** desktop letter placements, **When** the touch seed is built, **Then** those letters are present on the touch layout at sensible positions.
4. **Given** the seeded layout, **When** the author edits in the touch gallery, **Then** longpress/flick/multitap/replace edits apply and the touch preview updates.

---

### User Story 2 - Reseed from the desktop layers (fallback path) (Priority: P2)

The base has no usable touch layout (or the author rejects it). The author reseeds: the studio projects the locked physical/desktop layers into a touch layout the way Keyman Developer's "Import from OSK" does (a desktop-shaped mobile keyboard — full grid, all modifier layers; see "Reference implementation"), then applies programmatic simplification to reduce that clutter to a phone-appropriate shape. The projection need only be *reasonable*, not perfect; the author fine-tunes in the touch gallery.

**Why this priority**: Required for bases that lack touch layouts, and it is the escape hatch when the imported layout is unwanted. P2 because the default path (US1) covers the common case and delivers value on its own.

**Independent Test**: Author from a base with no touch layout, choose reseed, and confirm the emitted layout is a simplified projection of the desktop layers (contains the desktop's placed characters, with clutter reduced) and is not QWERTY.

**Acceptance Scenarios**:

1. **Given** a base without a usable touch layout, **When** the touch stage begins, **Then** the author is offered the reseed-from-desktop path (reviving/replacing the dead `touch_seed_source` fork).
2. **Given** a reseed, **When** the layout is generated, **Then** it is projected from the locked physical/desktop layers.
3. **Given** a projected layout, **When** simplification runs, **Then** clutter (e.g. redundant modifier keys, non-touch-appropriate affordances) is reduced programmatically while the author's placed characters remain reachable.
4. **Given** the author explicitly prefers reseed even when a base touch layout exists, **When** they choose it, **Then** the base layout is discarded and the desktop projection is used.

### Edge Cases

- Base touch layout exists but is partial/broken: treated as "unusable" -> offer reseed.
- A desktop-placed character has no obvious touch position during projection: it must still be reachable (coverage per criterion 18.6), even if via a longpress/secondary affordance.
- Simplification must not remove a character that is the sole realization of an inventory letter (no uncoverable characters).
- RTL / combining-mark scripts: derivation must preserve directionality and mark composition from the desktop layout (coordinated with the deferred script-scope decision in 034).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The touch seed MUST be derived from the author's work, never a fixed constant QWERTY. The current fixed-minimal-QWERTY seed in TouchGallery MUST be replaced.
- **FR-002**: When the base has a usable touch layout, the studio MUST default to importing it as the seed and applying the desktop modifications (carve removals + letter placements) to it.
- **FR-003**: When the base has no usable touch layout, or the author chooses to reseed, the studio MUST project the locked physical/desktop layers into a touch layout and then programmatically simplify it.
- **FR-004**: Desktop carve removals MUST propagate to the touch layout in both paths (closing the current desktop-only carve gap noted in 034 FR-008).
- **FR-005**: Desktop letter placements MUST be reflected on the touch layout in both paths.
- **FR-006**: The author MUST be able to choose the seed source (import-and-adapt vs reseed-from-desktop); the dead `touch_seed_source` fork MUST be wired to offer this choice or replaced by an equivalent affordance.
- **FR-007**: The touch gallery MUST let the author place/adjust letters (longpress/flick/multitap/replace) on the derived layout, with live preview.
- **FR-008**: Programmatic simplification MUST NOT make any inventory character uncoverable (every inventory character retains >=1 reachable touch mechanism).
- **FR-009**: The emitted `.keyman-touch-layout` MUST reflect the derived-and-edited layout and be valid for the compiler.

### Key Entities

- **Touch seed**: the source the touch layout derives from — the base's imported touch layout (default) or a desktop-layer projection (reseed). Revives the `touch_seed_source` concept.
- **Desktop-modification set**: the carve removals + letter placements the author made on the (now locked) desktop layout, replayed onto the touch seed.
- **Simplification pass**: the programmatic reduction applied to a desktop projection to make it touch-appropriate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For an author who makes N carve removals and M placements on desktop, the emitted touch layout reflects all N+M in the default (import-and-adapt) path.
- **SC-002**: For a base without a touch layout, the reseed path emits a simplified desktop projection containing the author's placed characters, never QWERTY.
- **SC-003**: 0 inventory characters become uncoverable after simplification.
- **SC-004**: The emitted touch layout compiles and previews correctly for the alphabetic script set verified in 034.

## Assumptions

- The desktop layout is **locked** before this feature runs (spec Decision 6; the `mechanisms` stage locks it in 034's spine).
- The engine touch pipeline (`applyTouchAssignments`, `scaffoldTouchLayout`, `parse-touch`, `touchSuggest`) is reused; the new work is seed derivation + simplification + wiring the seed-source choice.
- "Usable base touch layout" needs a definition (heuristic or explicit check) — see Open Questions.

## Out of Scope

- Authoring on a physical mobile device (no mobile-first path — spec Decision 6).
- Touch affordances beyond longpress/flick/multitap/replace already supported by the touch gallery.
- Script-specific touch shaping beyond preserving directionality/mark composition inherited from desktop (tracked with 034's deferred script-scope decision).
- **Improving Keyman Developer's own `physical->OSK->touch` converter** to emit a phone platform or a phone-shaped grid. This feature reimplements a *reasonable* equivalent projection over the engine and simplifies it; upstream Developer improvements are a separate, later effort (per user direction 2026-07-13).
- A perfect / phone-optimal projection. A reasonable seed that the simplification pass and author editing can finish is the bar (SC-002).

## Dependencies

- [specs/034-mvp-authoring-walk](../034-mvp-authoring-walk/spec.md) — this feature realizes 034's mobile stage; 034's desktop lock is a precondition.
- Studio: [editors/assignLoop/TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx), [editors/touchSuggest/](../../packages/studio/src/editors/touchSuggest/), [steps/manifest.ts](../../packages/studio/src/steps/manifest.ts) (the `touch_seed_source` fork), [steps/advance.ts](../../packages/studio/src/steps/advance.ts).
- Engine: [pattern-apply/applyTouchAssignments.ts](../../packages/engine/src/pattern-apply/applyTouchAssignments.ts), [scaffolder/scaffoldTouchLayout.ts](../../packages/engine/src/scaffolder/scaffoldTouchLayout.ts), [codec/parse-touch.ts](../../packages/engine/src/codec/parse-touch.ts).

## Simplification rules (reseed path) *(FR-003/FR-008)*

Grounded in what the Developer-style projection actually produces (see "Reference implementation"), the simplification pass on a desktop projection SHOULD:

1. **Emit a `phone` platform.** The projection only yields `tablet`/`desktop`; a phone-targeted layout must be generated (the touch gallery targets phone and tablet), narrowing to a phone-appropriate width (~10 keys/row).
2. **Drop the desktop bottom function row.** Remove Ctrl/Menu and other desktop-only function keys that have no touch meaning; keep space and a backspace/enter affordance.
3. **Collapse modifier layers.** Reduce the up-to-22 projected modifier layers (incl. chiral ctrl/alt) to the phone-appropriate set — default + shift, plus a numeric/symbol layer — rather than one touch layer per desktop modifier combination.
4. **Normalize desktop key widths** to touch proportions instead of carrying desktop Shift/Ctrl/Space/Enter widths.
5. **Consider the number row optional** on phone (numbers reachable via a numeric layer), rather than a permanent full-width row.

**Hard constraint (FR-008):** no rule above may make an inventory character uncoverable. A character dropped from the visible grid must remain reachable via a retained layer or a longpress/secondary affordance (criterion 18.6 coverage).

## Open Questions

- **What makes a base touch layout "usable"** (auto-detect vs always let the author judge from a preview)? This gates the US1-vs-US2 default. Leaning toward: show a preview and let the author decide, since Developer's own fallback chain (`.keyman-touch-layout` -> `.kvks` projection -> US-English default) shows "usable" is hard to auto-classify.
- **Where the projection runs.** Developer's converter is Delphi (`VisualKeyboardToTouchLayoutConverter.pas`); we reimplement the equivalent OSK->touch projection over the engine's `KeyboardIR`/touch pipeline rather than shelling out to Developer. Confirm the engine touch pipeline ([scaffoldTouchLayout.ts](../../packages/engine/src/scaffolder/scaffoldTouchLayout.ts), [applyTouchAssignments.ts](../../packages/engine/src/pattern-apply/applyTouchAssignments.ts)) can express the projected grid + layers before implementation.
