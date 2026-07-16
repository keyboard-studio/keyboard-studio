# Feature Specification: Facet Transform Engine

**Feature Branch**: `039-facet-transform`

**Created**: 2026-07-16

**Status**: Draft (deferred — this is the transform capability staged out of the source-facet model per scope-C; see the design brief)

**Input**: User description: "Facet transform engine. A capability that switches a keyboard base from one source-facet value to another with the implications explained (e.g. convert all touch longpress mechanisms to flicks; normalize source encoding to house style; migrate NFD->NFC and rewrite matching backspace rules)."

**Governing sections**: [spec.md](../../spec.md) §3c ("Defaults are the product" — propose-then-confirm, explain implications), the working-copy spine (§v1.3.0; constitution Article III). **Authoritative design brief**: [docs/source-facets-design.md](../../docs/source-facets-design.md). Sibling/input features: [specs/037-facet-classifiers](../037-facet-classifiers/spec.md) (measures the `source.*` construction facets this engine transforms), [specs/036-keyboard-facet-index](../036-keyboard-facet-index/spec.md) (stores the measurements). Consumer-adjacent: [specs/038-adaptation-questions](../038-adaptation-questions/spec.md) (how ambiguous choices are confirmed with users).

## Problem

A keyboard the user picks as a base carries **construction decisions** — how inputs/outputs are spelled, whether special characters use deadkeys or longpresses or flicks, NFC vs NFD, whether base-layout fall-through is blocked — that may not match what the user wants for their keyboard. Today those decisions are fixed at whatever the base author chose; changing one means hand-editing rules and hoping nothing broke.

The **source-facet model** (design brief; measured by spec 037) tells us, per base, *which* construction choices were made, *how consistently* they were followed through, and *why* each exception exists (principled-split / capacity-forced / gap-omission). This feature turns that knowledge into an **action**: offer to switch a facet's value across the working copy, show the user what will change before committing, and rewrite the source correctly — while preserving the deliberate decisions the base author made on purpose.

This spec **owns the per-pair value-transition matrix and the migration rules** — the part deliberately deferred out of the source-facet definitions (split-C in the brief). The facet definitions carry only a coarse `invertibility` hint and `implications` prose; the concrete "longpress→flick does X, flick→longpress loses Y" contract lives here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Behavior-preserving normalization to house style (Priority: P1)

The user adapts a base whose source spells characters inconsistently (some inputs as positional codes, some base characters as raw `U+` scalars). The studio proposes normalizing the encoding to house style — inputs as `[K_x]`, standalone base characters as `'x'`, combining/spacing as `U+xxxx` — subject to the conditional house-target policy (a hard-to-display script keeps `U+`-predominant spelling). The user accepts; the working copy's source is rewritten with **byte-identical output and identical typing behaviour** — only the source spelling changes.

**Why this priority**: It is the safest transform class (behavior-preserving — always invertible, never changes what the user types or what comes out), so it sets the confirmation/preview/rewrite pattern with the least risk. It also directly serves adaptation legibility (a base whose special rules were buried is easier to carve once normalized).

**Independent Test**: Take a fixture base with mixed encoding, run the encoding transform toward house style, and assert (a) the emitted keyboard's produced-output and behaviour are unchanged (round-trip/compile parity), (b) the source now matches house-style spelling per character role, and (c) the transform is reversible.

**Acceptance Scenarios**:

1. **Given** a base with mixed input/base/combining encoding, **When** the user previews the encoding-normalization proposal, **Then** the studio shows the per-role before/after and a provenance chip for the house target (including why a non-default target was chosen, e.g. "kept `U+` because this script renders poorly in system fonts).
2. **Given** the user accepts, **When** the transform applies, **Then** the working copy compiles to the same behaviour as before (no output or UX change) and the change is confined to source spelling.
3. **Given** a behavior-preserving transform was applied, **When** the user reverts it, **Then** the source returns to an equivalent prior state (invertible).

---

### User Story 2 - UX-changing mechanism switch with implications and exception preservation (Priority: P2)

The user wants a base's touch special-character access to use **flicks** instead of **longpresses**. The studio proposes the switch, states the implications (e.g. "flicks are faster but less discoverable; directional assignment will be derived — review it"), and — critically — **respects the base's principled exceptions**: keys the base deliberately left on a different mechanism (a principled-split the classifier tagged) are surfaced and preserved by default, while gap-omission sites are offered as fixes. The user confirms; the working copy's touch layout is rewritten, output unchanged.

**Why this priority**: It is the representative UX-changing transform and the one the user named ("switch all longpresses to flicks"). It exercises the hard parts: lossy-direction handling, the implications contract, and the cause-tag-aware preservation that keeps the transform from flattening deliberate design.

**Independent Test**: Run the longpress→flick transform over a fixture base with a known principled-split (one mechanism for diacritics, another for base characters) and a known gap. Assert the dominant mechanism is switched, the principled-split sites are preserved unless the user opts in, the gap site is offered as a fix, and the emitted keyboard's *output* is unchanged even though the *input UX* changed.

**Acceptance Scenarios**:

1. **Given** a base classified as dominantly longpress with a principled-split exception set, **When** the user requests longpress→flick, **Then** the proposal preserves the principled-split sites by default and names them, rather than silently converting them.
2. **Given** the transform direction is lossy (target mechanism cannot represent something the source did), **When** previewed, **Then** the implications state exactly what is lost and the preview shows it — the user is never surprised post-commit.
3. **Given** a gap-omission exception (a character missing from the source mechanism), **When** the mechanism transform runs, **Then** the gap is surfaced as a proposed fix, not carried forward silently.

---

### User Story 3 - Output-changing normalization migration (NFD↔NFC) with coordinated rule rewrite (Priority: P3)

The user's base emits NFD but the user wants NFC output. The studio proposes the migration, warns that **emitted bytes will change**, and performs the coordinated multi-rule rewrite — including **rewriting the backspace rules to match** the new normalization so deletion stays consistent (the "followed-through" half of the normalization facet). The user reviews the output diff and confirms.

**Why this priority**: It is the deepest and riskiest transform (changes what comes out, requires a coordinated multi-rule migration, not a local rewrite), so it comes last and depends on the confirmation/preview machinery the earlier stories establish.

**Independent Test**: Run NFD→NFC on a fixture base with backspace rules, assert the emitted output normalization changed as intended, the backspace rules were rewritten consistently, and the studio presented an output diff before commit.

**Acceptance Scenarios**:

1. **Given** an NFD base with matching backspace rules, **When** NFD→NFC is applied, **Then** both the output rules and the backspace rules are migrated together and remain mutually consistent.
2. **Given** an output-changing transform, **When** previewed, **Then** the studio shows an output-level diff (what bytes change) and requires explicit confirmation before applying.

---

### Edge Cases

- **Gate facets are never transformed.** A request to "switch" `source.mnemonic-vs-positional` MUST be refused with an explanation (mnemonic is a portability gate, not a switchable mechanism), not attempted.
- **Insufficient/undetermined measurement.** If the source facet for the base is `undetermined` or below the classifier's evidence floor, the transform MUST NOT run blind — it either declines or re-measures, never guesses.
- **Opaque source fragments.** Constructs preserved as `RawKmnFragment` that a transform cannot model MUST NOT be silently rewritten or dropped (constitution Article II) — the transform reports what it could not touch.
- **Fall-through interaction.** A mechanism or encoding transform MUST account for base-layout fall-through (design brief §7): changing or blocking a key can change which base-layout characters leak; the transform surfaces any change to the produced-character set.
- **Partial acceptance.** The user may accept a transform for some exception sites and not others; the engine applies the accepted subset and leaves the rest, keeping the working copy consistent.
- **Compile regression.** If applying a transform would produce a working copy that fails validation/compile, the transform is not committed and the failure is reported against the proposal.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The engine MUST operate on the single persistent working copy via KeyboardIR mutation (constitution Articles II, III) — never on raw `.kmn` text, never creating a second working copy, serialized only at output.
- **FR-002**: Every transform MUST be gated by **propose-then-confirm** (§3c): the studio proposes the switch, shows a preview of what changes, and applies only on explicit user confirmation. No transform is silent.
- **FR-003**: Every transform MUST declare and honour its **transformImpactClass**: behavior-preserving (byte-identical output, invertible), ux-changing (output may stay identical, input UX changes, may be lossy per direction), output-changing (emitted bytes change, requires coordinated migration). Gate-class facets MUST be refused.
- **FR-004**: The engine MUST own a **value-transition matrix** per transformable facet: for each supported `from → to` pair, whether it is supported, its loss profile (lossless / lossy-with-named-loss / one-way), and its migration rule. Unsupported pairs are declined with an explanation.
- **FR-005**: Transforms MUST consume the source-facet measurement (dominant value + consistency + enumerated exception sites + **cause tags**) and MUST treat exceptions by cause: **principled-split** preserved by default (named, opt-in to convert), **capacity-forced** offered as a consolidation opportunity, **gap-omission** offered as a fix — never flattened silently.
- **FR-006**: Every transform MUST surface **implications** to the user before commit, drawn from the facet's `implications` prose plus the transition's loss profile — the user must be able to see what changes (source, UX, or output) and what is lost.
- **FR-007**: Behavior-preserving transforms MUST be verified to preserve behaviour (output/compile parity before vs after) and MUST be invertible.
- **FR-008**: Output-changing transforms MUST present an **output-level diff** and perform any **coordinated companion rewrites** the migration requires (e.g. backspace rules on NFD↔NFC) so the result stays internally consistent.
- **FR-009**: The engine MUST NOT silently rewrite or drop `RawKmnFragment` opaque constructs, and MUST report any part of the source a transform could not model.
- **FR-010**: A transform that would cause validation/compile failure MUST NOT be committed; the failure is reported against the proposal, leaving the working copy unchanged.
- **FR-011**: Transforms MUST account for base-layout fall-through when computing what changes, and MUST surface any change to the produced-character set caused by (un)blocking keys.
- **FR-012**: The engine MUST support **partial acceptance** at the exception-site granularity, applying only the confirmed subset.
- **FR-013**: A committed transform that changes the produced-character set (e.g. base-layout fall-through (un)blocking) MUST invalidate or re-derive any cached discovery-axis vector and strategy recommendation for the working copy, so downstream gallery/strategy picks do not go stale against a produced-character set that has since changed.

### Key Entities

- **Transform**: A named operation switching one facet from a `from` value to a `to` value on the working copy. Carries its transformImpactClass, its transition entry (loss profile + migration rule), and its implications text.
- **Transition matrix**: Per transformable facet, the set of supported `from → to` pairs with loss profiles and migration rules. This spec's central owned artifact.
- **Transform proposal**: The pre-commit object shown to the user — target value, affected sites (with cause tags), implications, and the preview (source diff / UX description / output diff by class).
- **Migration rule**: The procedure that rewrites the working copy for one transition, including any coordinated companion rewrites (e.g. backspace rules).

## Success Criteria *(mandatory)*

- **SC-001**: For behavior-preserving transforms, 100% of fixture cases produce a working copy whose emitted output and typing behaviour are unchanged (verified by compile/round-trip parity), and every such transform is reversible to an equivalent prior state.
- **SC-002**: For every transformable facet, no transform can be committed without a user-visible preview and explicit confirmation (no silent transforms) — verified across all transform classes.
- **SC-003**: For UX-changing and output-changing transforms, the pre-commit preview names every loss and every companion change; a reviewer given only the preview can predict the post-commit state without running the transform.
- **SC-004**: Principled-split exception sites are preserved by default in 100% of fixture mechanism transforms (never converted without opt-in); gap-omission sites are surfaced as fixes in 100% of fixture cases.
- **SC-005**: No fixture transform ever silently drops or rewrites a `RawKmnFragment`, and any un-modellable source region is reported.
- **SC-006**: A transform that would break compilation is never committed in any fixture case; the working copy is left unchanged and the failure is attributed to the proposal.

## Assumptions

- **Depends on spec 037 measurements.** The source-facet classifiers (spec 037) and the facet-index storage (spec 036) exist and provide dominant value + consistency + exception sites + cause tags. This engine does not re-derive them; if a measurement is missing/undetermined it declines rather than guessing (edge case).
- **The design brief is authoritative for the model.** Facet inventory, transform-impact taxonomy, cause taxonomy (predicate-fit), and the house-target policy shape are fixed by [docs/source-facets-design.md](../../docs/source-facets-design.md); this spec adds only the transition matrix + migration rules.
- **Engine team owns this feature** (it mutates KeyboardIR / working copy — constitution Article VI); content owns the facet definitions and the implications prose consumed here.
- **Starter transition coverage is a subset, honestly bounded.** v1 need not implement every `from → to` pair; unsupported pairs are declined with an explanation (FR-004) rather than silently unavailable. The initial covered set is decided in planning against the fixtures.
- **UX-changing transforms may derive parameters** (e.g. flick direction assignment) that the user reviews; the engine proposes, the user confirms (§3c) — the derivation is not authoritative.

## Out of Scope

- The classifiers and measurements themselves (spec 037) and the facet-index storage (spec 036).
- The source-facet catalog and schema (design brief items 1–3) — authored as content data, not here.
- The user-facing confirmation *question* design ([spec 038](../038-adaptation-questions/spec.md)) beyond this engine's propose-then-confirm obligation.
- Gate facets (`source.mnemonic-vs-positional`) — measured and used to filter bases, never transformed.
- Multi-source merge, and any change to locked contracts, validator layers, or the recognizer's rule catalog (constitution Articles I, IV, VII).
- The per-pair *implementation* of every transition (this spec defines the matrix + rules contract; `/speckit-plan` and `/speckit-tasks` schedule which land first).
