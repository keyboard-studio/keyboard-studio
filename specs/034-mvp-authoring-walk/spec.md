# Feature Specification: MVP end-to-end authoring walk

**Feature Branch**: `034-mvp-authoring-walk`

**Created**: 2026-07-13

**Status**: Draft (MVP scope-lock)

**Governing docs**: [spec.md](../../spec.md) §8 (hybrid data flow), §9 (routing), §12 (working-copy spine), and [docs/workflow-model.md](../../docs/workflow-model.md). This feature does **not** introduce a new workflow — it **pins the MVP subset** of the already-ratified Track 1 hybrid flow and states, honestly, which stages are shippable as-built and which need work in the 3-week window. Where this spec and the governing docs conflict on *design*, the governing docs win; this spec only scopes *what ships*.

**Scope carve-outs (this spec is the umbrella; detail lives elsewhere):**
- **Mobile/touch derivation** is specified separately in [specs/035-mobile-touch-derivation](../035-mobile-touch-derivation/spec.md). This spec references it as a stage; it does not re-specify it.
- **GitHub PR publication** is an existing feature — [specs/024-option-a-github-app](../024-option-a-github-app/spec.md). This spec references it; it does not re-specify it.
- **Script scope** (whether the MVP MUST cover Arabic/Hebrew/Devanagari in addition to the proven alphabetic set) is a **deferred decision** — see Open Questions.

**Input**: User description: "Define the MVP meta-workflow that MUST ship: Define Language (autosuggest) -> Suggest Exact + Family base keyboards -> Copy or Continue the base -> Define Alphabet -> Carve unneeded items (desktop + mobile) -> Place new letters on Desktop -> Lock Desktop -> Place new letters on Mobile -> Publish (PR to keyboards or download ZIP). Meta: GitHub login, Save/Resume, Back. Verify for alphabetic languages (roman and non-roman script)."

---

## Context: what already exists *(read first)*

This walk is a near-1:1 re-derivation of the built Track 1 spine. The live runtime spine is a single ordered array in [packages/studio/src/steps/manifest.ts](../../packages/studio/src/steps/manifest.ts), consumed by the pure advance policy [steps/advance.ts](../../packages/studio/src/steps/advance.ts) and rendered by [components/StepHost.tsx](../../packages/studio/src/components/StepHost.tsx). A structural guard (`validateManifestShape()`) throws at load if the spine/lock order drifts, so the manifest is authoritative for "what runs."

Live spine: `identity -> choose_base -> track -> [project_name (copy only)] -> characters -> carve -> mechanisms (lockDesktop fires) -> touch (buildTouchLayout fires) -> help -> done -> navigate(output)`.

Honest per-stage build state (the basis for the priorities below):

| User step | Live stage | Build state | MVP gap | Owned by |
|---|---|---|---|---|
| Define Language (autosuggest) | `identity` | BUILT — langtags lookup, region variants, resume | none | this spec |
| Suggest Exact + Family bases | `choose_base` | BUILT — 4-tier ranking in [lib/suggestBase.ts](../../packages/studio/src/lib/suggestBase.ts) | none | this spec |
| Copy or Continue base | `track` | BUILT — Track 1 `instantiateFromBase`, Track 2 `instantiateFromExisting` | Track 2 needs the real engine | this spec |
| Define Alphabet | `characters` | BUILT | none | this spec |
| Carve — desktop | `carve` | BUILT for desktop | (mobile propagation -> 035) | this spec |
| Place letters — Desktop | `mechanisms` | BUILT — char loop, S-01/02/03/08 | none | this spec |
| Lock Desktop | auto-fires on `mechanisms` complete | BUILT but implicit | explicit gate if UX requires | this spec |
| Place letters — Mobile | `touch` | seeds from fixed QWERTY; must derive from desktop | full derivation | **[035](../035-mobile-touch-derivation/spec.md)** |
| Publish — ZIP | `output` | BUILT — real `toZip` | none | this spec |
| Publish — GitHub PR | `output` | built, deploy-gated | consolidate + verify | **[024](../024-option-a-github-app/spec.md)** |
| GitHub login | OAuth PKCE | BUILT, deploy-gated | tied to 024 | [024](../024-option-a-github-app/spec.md) |
| Save / Resume | — | ABSENT (in-session back-nav only) | net-new (US3) | this spec |
| Back | history stack | BUILT | none | this spec |

**Script gating.** Exactly three scripts are hard-gated to a "not supported" terminal: Ethiopic (`Ethi`), Han/CJK (`Hani`), Hangul (`Hang`) — [survey/IdentityLite.tsx](../../packages/studio/src/survey/IdentityLite.tsx), [survey/questions/a/il_target_script.ts](../../packages/studio/src/survey/questions/a/il_target_script.ts). Everything else is selectable. The **proven** end-to-end set (rides the generic galleries) is Latin, Cyrillic, Greek, Georgian, Armenian.

## Clarifications

### Session 2026-07-13 (MVP scope-lock)

- Q: Mobile currently seeds from a fixed QWERTY and does not inherit desktop work — what is the MVP MUST? -> A: Mobile is a MUST and must inherit the desktop work (import-and-adapt the base touch layout by default; reseed-from-desktop + simplify as fallback). **This is carved into its own spec, [035](../035-mobile-touch-derivation/spec.md);** 034 references the touch stage but does not detail it.
- Q: What is the MVP publish MUST? -> A: Both ZIP and GitHub PR are MUST. ZIP is owned here; **PR is an existing feature, [024](../024-option-a-github-app/spec.md)** (confirmed working per Grace, likely on an unmerged branch — see Dependencies). 034 requires that both paths are reachable from output.
- Q: Is cross-reload Save/Resume an MVP MUST? -> A: MUST — build localStorage persistence.
- Q: Does Save/Resume have to handle multiple concurrent projects? -> A: **No for the MVP** — the MVP saves and resumes a *single* in-progress project. But this is a scoping decision, not a design ceiling: multi-project management (list, switch, name, delete concurrent drafts) is a known follow-on for **both** authenticated (GitHub/Google, server-saved) and guest (local-saved) users. The MVP persistence design MUST NOT foreclose it — the storage layer is keyed/namespaced so adding an N-project index and, later, a per-user server backend is a superset, not a data migration (FR-014). See Open Questions; the multi-project management UI itself is Out of Scope for 034.
- Q: Which script set is the MVP MUST to verify end-to-end? -> A: **Deferred.** The floor is the proven alphabetic set (Latin/Cyrillic/Greek/Georgian/Armenian). Whether Arabic/Hebrew/Devanagari are added to the MVP MUST is an open decision (they pass the gate but have no script-specific RTL/stacking/reorder logic today). See Open Questions.

---

## User Scenarios & Testing *(mandatory)*

The primary user is a **language community author** creating a keyboard for their language from an existing close base, on a desktop browser, with no Keyman-internals knowledge. Each story below is an independently shippable slice.

### User Story 1 - Author a desktop keyboard end-to-end and download it (Priority: P1)

An author opens the studio, types their language name and gets an autosuggested BCP47 identity, is shown a ranked list of exact and family/related base keyboards, picks one, chooses to **copy** it under a new name (Track 1) or **continue/adapt** it (Track 2), declares their alphabet, **carves** characters the base has that they don't need, **places** their new letters onto the physical desktop layout via the mechanism gallery, locks the desktop, and **downloads a ZIP** of a valid, compilable Keyman keyboard.

**Why this priority**: This is the smallest slice that delivers a real, shippable keyboard and exercises the whole spine except mobile and PR. It is almost entirely BUILT today, so it is the anchor MVP.

**Independent Test**: Run the walk for one Latin and one non-Latin alphabetic language (e.g. a Cyrillic base); confirm the downloaded ZIP contains a `.kmn`/`.kvks`/`.kps` that passes Layer A/B validation and compiles via the kmcmplib oracle. (The existing [copy-edit.spec.ts](../../packages/studio/e2e/copy-edit.spec.ts) E2E already walks a close variant of this.)

**Acceptance Scenarios**:

1. **Given** an author who types a language name, **When** identity resolves, **Then** a BCP47 tag (language + script) is proposed for confirmation, not a blank form.
2. **Given** a confirmed (language, script) pair, **When** the base step renders, **Then** at least an exact-or-family base plus the US-QWERTY fallback are offered, ranked.
3. **Given** a chosen base, **When** the author picks Track 1 (copy), **Then** a project-name step collects the display name and auto-derives the keyboardId; **When** they pick Track 2 (adapt), **Then** identity is preserved and the project-name step is skipped.
4. **Given** a declared alphabet, **When** the author opens carve, **Then** base characters not in the alphabet can be removed from the desktop layout and the OSK preview reflects the removals.
5. **Given** unplaced alphabet characters, **When** the author uses the mechanism gallery, **Then** each character can be assigned to a key/mechanism (S-01/02/03/08) and the desktop locks on completion.
6. **Given** a locked desktop, **When** the author downloads, **Then** a ZIP of a valid, compilable keyboard is produced.

---

### User Story 2 - Reach a mobile layout and a PR publish path from the walk (Priority: P1)

The walk continues past desktop lock into a mobile/touch stage and offers, at output, both a ZIP download and a "submit as PR" option. The mobile stage's behavior is specified in [035](../035-mobile-touch-derivation/spec.md); the PR submission is specified in [024](../024-option-a-github-app/spec.md). This story owns only the **integration**: that the spine reaches these stages and that output exposes both publish paths honestly.

**Why this priority**: The walk is not the MVP walk unless mobile and PR are reachable and wired into the same spine and output screen. The *depth* of each lives in its own spec; the *reachability and integration* is 034's responsibility.

**Independent Test**: Complete US1, then confirm the flow advances into the touch stage (not skipped) and that the output screen presents both a working ZIP download and a PR-submit affordance (which, if the OAuth backend is down, degrades honestly per FR-008).

**Acceptance Scenarios**:

1. **Given** a locked desktop, **When** the spine advances, **Then** it enters the touch stage (per 035) rather than terminating at desktop.
2. **Given** a finished working copy, **When** the author reaches output, **Then** both ZIP download and PR submission (per 024) are offered.
3. **Given** the OAuth backend is unavailable, **When** the author reaches output, **Then** the ZIP path remains fully functional and the PR path shows an honest "unavailable" state rather than appearing to work.

---

### User Story 3 - Save progress and resume after a reload (Priority: P2)

An author's in-progress session survives a browser reload (and closing/reopening the tab): on return, the working copy and their position in the walk are restored from local persistence.

**MVP scope: one project at a time.** The MVP saves and resumes a *single* in-progress project. It does **not** ship a way to hold several drafts, list them, or switch between them — that is a deliberate scope cut, not a design one. Because multi-project is a known follow-on (see US3a and FR-014), the persistence layer this story builds MUST be keyed/namespaced from the start so a project index and a per-user server backend can be layered on later without a data migration.

**Why this priority**: Named a MUST by the user. It is net-new (no cross-reload persistence exists today) but off the critical authoring path, so it is P2.

**Independent Test**: Advance several stages, hard-reload the browser, and confirm the working copy (IR + inventory + assignments) and current step are restored, not reset to the start.

**Acceptance Scenarios**:

1. **Given** an author partway through the walk, **When** they reload the page, **Then** the working copy and current step are restored from local persistence.
2. **Given** a restored session, **When** the author continues, **Then** subsequent mutations persist under the same draft key without corrupting the snapshot.
3. **Given** an author who wants a clean start, **When** they choose "start over", **Then** the persisted draft is cleared.
4. **Given** the single-project MVP, **When** an author instantiates a new working copy while a draft already exists, **Then** the behavior is well-defined (the prior draft is replaced, or the author is warned before it is overwritten) rather than silently corrupting a merged state.

---

### User Story 3a - Manage and switch between multiple concurrent projects (Priority: P3 — post-MVP, design-for-now)

An author (guest or logged-in) holds more than one in-progress keyboard project at once, sees a list of their drafts, and switches between them; a logged-in author's drafts are saved server-side and follow them across devices, while a guest's drafts stay in local persistence on that browser.

**Why this priority**: Explicitly **out of the MVP build** but explicitly **in the design envelope**. The user's direction is that single-concurrent-project is the MVP focus while the door is left open for this. It is P3: not built in the 3-week window, but the US3 persistence contract (FR-014) is written so this is an additive change — a draft *index* over the existing per-project records plus, for authenticated users, a server-backed store implementing the same keyed contract — not a rewrite.

**Independent Test** *(deferred to the follow-on feature; recorded here so the seam is testable)*: With two distinct drafts persisted, the author can enumerate both, open either without losing the other, and delete one without affecting the other; a logged-in author sees the same drafts after signing in on a second browser.

**Acceptance Scenarios** *(target for the follow-on; NOT MVP acceptance)*:

1. **Given** two persisted drafts, **When** the author opens the project list, **Then** both are listed with enough identity (name + language) to tell them apart, and opening one does not discard the other.
2. **Given** a logged-in (GitHub/Google) author, **When** they save a project, **Then** it persists to a per-user server store and is retrievable on another device; **Given** a guest, **Then** drafts persist locally to that browser only, with an honest indication they are not synced.
3. **Given** a guest with local drafts who later logs in, **When** they authenticate, **Then** there is a defined path to associate/upload the local drafts to their account (exact UX deferred to the follow-on).

### Edge Cases

- Author selects a gated script (Ethiopic/CJK/Hangul): the walk exits to the honest "not supported" stub before base resolution — intended; must not silently empty the gallery.
- No base matches the (language, script) pair: the walk still offers manual base pick and the US-QWERTY fallback (there is no true "blank" base — a blank Keyman keyboard *is* QWERTY).
- An inventory character ends the walk with zero assigned mechanisms (uncoverable): flagged as a dead-end per criterion 18.6 (`KM_LINT_INVENTORY_UNCOVERED`) before output.
- Track 2 (adapt) under a mock engine silently skips instantiation ([steps/reducer.ts](../../packages/studio/src/steps/reducer.ts) console.warn): MVP verification MUST run Track 2 against the real engine.
- OAuth redirect round-trip: the working copy must survive the redirect (today via a sessionStorage snapshot; US3's localStorage persistence should subsume this).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The MVP walk MUST run the existing live spine `identity -> choose_base -> track -> [project_name] -> characters -> carve -> mechanisms -> touch -> help -> output` with no reordering of the locked physical->touch->docs tail.
- **FR-002**: Language identity MUST be proposed via langtags autosuggest (propose-then-confirm), never a blank BCP47 form.
- **FR-003**: The base step MUST present ranked suggestions covering at least an exact (language+script) match where one exists, family/related bases, and the US-QWERTY fallback.
- **FR-004**: Both Track 1 (copy under new identity) and Track 2 (adapt in place) MUST work against the real engine; Track 2 MUST NOT silently no-op.
- **FR-005**: Carve MUST remove unwanted base characters from the **desktop** layout with live OSK feedback. (Propagation of carve to the touch layout is owned by [035](../035-mobile-touch-derivation/spec.md) FR-004.)
- **FR-006**: The desktop mechanism gallery MUST let the author assign every alphabet character to at least one key/mechanism, and the desktop MUST lock on completion. If MVP UX requires it, the lock MUST be a visible affordance rather than a silent transition. *(Explicit-gate requirement pending UX confirmation.)*
- **FR-007**: The spine MUST advance from a locked desktop into the mobile/touch stage (behavior per [035](../035-mobile-touch-derivation/spec.md)); the touch stage MUST NOT be skipped.
- **FR-008**: Output MUST support **ZIP download** of a valid, compilable keyboard, and MUST expose the **GitHub PR** submission path (per [024](../024-option-a-github-app/spec.md)). When the OAuth backend is unavailable, the PR path MUST degrade to an honest "unavailable" state and the ZIP path MUST remain fully functional.
- **FR-009**: The authoring session (working copy + current step) MUST persist to local persistence and resume across a page reload, with an explicit "start over" that clears the draft. The MVP persists a **single** in-progress project; instantiating a new working copy while a draft exists MUST have well-defined behavior (replace or warn-before-overwrite), never a silent merge.
- **FR-010**: Backward navigation between steps MUST be supported (already built via the history stack); the persisted draft MUST stay consistent across back-nav.
- **FR-011**: The walk MUST complete end-to-end for the proven alphabetic set: Latin, Cyrillic, Greek, Georgian, and Armenian.
- **FR-012**: Ethiopic, CJK, and Hangul MUST remain gated to the honest "not supported" terminal.
- **FR-013** *(deferred / [NEEDS DECISION])*: Whether Arabic, Hebrew, and Devanagari are part of the MVP MUST — and, if so, the required RTL-rendering and combining-mark/reorder behavior — is deferred pending the script-scope decision (see Open Questions). Until decided, these scripts remain selectable but are not an MVP acceptance target.
- **FR-014** *(forward-compatibility, MUST for the MVP build even though multi-project is not)*: The persistence layer MUST be designed so that supporting **multiple concurrent projects** (US3a) and **per-user server-side storage** for authenticated (GitHub/Google) authors is an additive change, not a data migration. Concretely: (a) each project's draft MUST be stored under a **per-project key/namespace** rather than one global fixed key, so a draft *index* can be layered over the same records later; (b) the read/write API MUST take the project key as a parameter (even though the MVP only ever passes one), so a future server-backed store can implement the same interface behind an auth check; (c) draft records SHOULD carry enough identity (project/keyboard id, display name, language) to populate a future project list without re-parsing the working copy. The MVP MUST NOT commit to a schema that assumes a single global draft.

### Key Entities

- **Working copy**: the single persistent `KeyboardIR` + `VirtualFS` pair, instantiated at keyboard selection, mutated by every stage, serialized only at output. The unit that US3 persists.
- **Base suggestion**: a ranked candidate from [lib/suggestBase.ts](../../packages/studio/src/lib/suggestBase.ts) with a tier (exact / script / cross-script family / fallback).
- **Assignment map**: the scoped (default/class/individual), multi-valued character->mechanism map the galleries emit, per modality.
- **Draft snapshot**: the persisted serialization of the working copy + walk position for **one** project (US3), stored under a per-project key.
- **Draft store**: the keyed read/write abstraction over draft snapshots. MVP implementation is local (browser) and holds one active project; the interface is parameterized by project key so a future multi-project index and a per-user server-backed store (US3a) implement the same contract (FR-014).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An author can complete identity -> ZIP for a Latin and a non-Latin alphabetic language with zero manual file editing (US1).
- **SC-002**: From a finished working copy the output screen offers both a working ZIP download and a PR-submit affordance; with the backend down the ZIP path still succeeds 100% of the time (US2, FR-008).
- **SC-003**: After a hard reload at any stage, the working copy and current step are restored in 100% of cases; "start over" clears the draft (US3).
- **SC-004**: The walk completes end-to-end for all five proven alphabetic scripts (FR-011).
- **SC-005**: Selecting a gated script exits to the "not supported" stub 100% of the time (FR-012).

## Assumptions

- The MVP targets a **desktop web browser**; touch layouts are authored on desktop and previewed, not authored on a physical mobile device (spec Decision 6 — no mobile-first path).
- The **real engine** (not the mock) backs Track 2 and all output during MVP verification.
- The existing back-nav, langtags autosuggest, base ranking, carve (desktop), mechanism gallery, and ZIP output are treated as **BUILT and reused**, not rebuilt.
- Mobile derivation (035) and PR publication (024) land on their own timelines; 034 depends on their reachability and integration, not their internal completeness.

## Out of Scope

- Mobile/touch derivation internals — owned by [035](../035-mobile-touch-derivation/spec.md).
- GitHub PR / OAuth internals — owned by [024](../024-option-a-github-app/spec.md).
- The three gated scripts (Ethiopic, CJK, Hangul) beyond the honest "not supported" stub.
- Arabic/Hebrew/Devanagari acceptance until the script-scope decision resolves (FR-013).
- **Multi-project management UI and server-side draft storage** (US3a) — the project list/switcher, per-user server persistence for authenticated authors, and the guest->account draft-adoption flow. The MVP builds the *keyed persistence contract* (FR-014) that makes these additive, but ships none of the UI or backend. Owned by a follow-on feature.
- Multi-source merge, editing opaque `RawKmnFragment` fragments via the survey, byte-identical round-trip, LDML output, mobile-app integration, hosting (spec §16).
- A dev-facing interactive flow-map editor ([specs/009-flow-map-editor](../009-flow-map-editor/spec.md)).

## Dependencies

- Live spine + advance policy: [steps/manifest.ts](../../packages/studio/src/steps/manifest.ts), [steps/advance.ts](../../packages/studio/src/steps/advance.ts), [components/StepHost.tsx](../../packages/studio/src/components/StepHost.tsx).
- Mobile stage: [specs/035-mobile-touch-derivation](../035-mobile-touch-derivation/spec.md).
- Publish: engine [output/](../../packages/engine/src/output/) (`toZip`), [components/OutputScreen.tsx](../../packages/studio/src/components/OutputScreen.tsx); PR path per [specs/024-option-a-github-app](../024-option-a-github-app/spec.md), currently split across `origin/km/448-publishpr-progress`, `origin/km/issue-148-github-oauth-submit-pr`, `origin/km/github-integration-q7` (not yet on `main`) and gated on the deployed OAuth proxy — consolidation + verification tracked under 024.
- Persistence primitives to extend for US3: [lib/persistWorkingCopy.ts](../../packages/studio/src/lib/persistWorkingCopy.ts), [stores/surveySessionStore.ts](../../packages/studio/src/stores/surveySessionStore.ts).

## Open Questions

- **Script scope (deferred, blocks FR-013):** Are Arabic, Hebrew, and Devanagari part of the MVP MUST? They pass the gate but have no script-specific RTL/stacking/reorder logic today, so including them adds real risk. Decision needed before these become an acceptance target; until then MVP verifies only the proven alphabetic set (FR-011).
- **Explicit desktop-lock affordance (FR-006):** Does the MVP UX require a visible "lock" action, or is the current silent auto-lock on mechanism completion acceptable?
- **Multi-project follow-on (US3a, informed by FR-014):** Deferred to a separate feature, but the shape needs deciding there: (a) the draft-index representation and whether guest and authenticated storage share one index abstraction; (b) the per-user server backend (endpoint/store choice, auth binding to the GitHub/Google identity, sync/conflict model across devices); (c) the guest->account draft-adoption UX when a local author signs in; (d) draft limits/quotas (localStorage is finite for guests). None of these block the MVP, but FR-014 must be honored so they remain additive.
