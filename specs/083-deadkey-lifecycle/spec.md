# Feature Specification: Deadkey lifecycle — defining, managing, renaming, and deleting deadkeys

**Feature Branch**: `083-deadkey-lifecycle`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "nothing allows us to define a dead-key that doesn't already exist in the base keyboard, or to manage existing ones. All we can do is assign new inputs/outputs to deadkeys. While deadkeys are only a single solution to the problem, this is a problem."

**Governing context**: [spec.md](../../spec.md) §3c (defaults are the product — propose-then-confirm; a derivable-but-blank decision point is a defect), §5a (the KeyboardIR is the spine; every mutation operates on the IR, never on `.kmn` text), §10 (validator layering), §16 (out of scope: a raw-KMN editor is a v1.1 candidate). The codec's deadkey vocabulary is governed by [076-rule-behaviours](../076-rule-behaviours/spec.md): FR-004 (named-deadkey codec closure) is a sequencing prerequisite of this feature — numeric ids round-trip today and `dk(name)` is opaque until FR-004 lands. Deadkey *behaviour* (timeout/cancel) is explicitly deferred by 076 and stays out of this spec; this spec is deadkey *lifecycle authoring* only. Trigger-key collision disclosure reuses the reference-host set established by the 1802 leak-handling ruling (US / Intl / AZERTY / QWERTZ / UK English + blocked, per-keyboard likely hosts via `likelyHostLayouts`); copy follows the A2 tradeoff principle — each option states its own risk, never a one-sided slogan.

## Why this exists

Deadkeys are the studio's only authoring path to multi-keystroke composition, and today their lifecycle is half-owned. An author can mint a deadkey, but only through one narrow path: the S-02 "Deadkey" method card in the accented-character assign flow (`MechanismGallery.tsx`, `buildDeadkeyAssignment` ~L443), which restricts the trigger key to 4 hardcoded options (`DEADKEY_OPTIONS` = K_COLON, K_LBRKT, K_RBRKT, K_BKQUOTE), force-derives the id from the trigger char's codepoint (`deadkeyNameFor`), and silently merges multiple refs on one trigger (`applyAssignments.ts:477-511`). Everything else about a deadkey — seeing what a keyboard has, renaming it, deleting it, moving it to another key — is unreachable. The IR types a deadkey as `{ kind: "deadkey", id: number }` and nothing lists them; `RenameDialog` renames touch-key ids only; #530's removal work was slot-level (replace with beep), never entity-level.

Three facts shape the answer.

**The id/trigger coupling is the root defect.** Because the id is derived from the trigger char's codepoint, a deadkey cannot move keys without becoming a different deadkey, and a deadkey cannot be named for what it is rather than what key it sits on. The fix is to decouple: assign a stable id once at define time, let the trigger be retargetable metadata.

**Lifecycle actions need the same visibility the 1802 ruling demands for carves.** A deadkey's trigger key is a leak surface exactly like a carved combo: on a host layout where that key already means something, the deadkey's behaviour is host-dependent. Define and retarget must therefore show the host-layout consequence of the chosen trigger — not as a verdict, but as the symmetric tradeoff (the key may do something different on some hosts; closing it off is predictable but possibly inaccessible).

**Silent mutation is the failure mode to kill.** Today minting onto an occupied trigger merges silently and store names replace silently. Every lifecycle action in this spec warns or merges explicitly; a silent replace-by-name is treated as a defect, not a convenience.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Define a new deadkey (Priority: P1)

An author building a tone-mark keyboard on a base layout with no deadkeys needs a deadkey on a key of their choosing — not one of the 4 hardcoded options. They open the deadkey surface, pick any trigger key, and accept the auto-unique id (naming it themselves once FR-004 lands). Before confirming, they see what that trigger key does on each likely host layout, so the choice is informed. The new deadkey appears in the inventory with an empty fan-out store, ready for base→accented pairs.

**Why this priority**: This is the omission the issue names first. Without it, deadkeys only exist where a base keyboard or the S-02 card happened to put them.

**Independent Test**: On a base with no deadkeys, define a deadkey on a chosen key, add two base→accented pairs, and type both sequences in the simulator to confirm the outputs.

**Acceptance Scenarios**:

1. **Given** a keyboard with no deadkeys, **When** the author opens the deadkey surface and chooses a trigger key, **Then** the proposed id is unique across the keyboard's deadkeys and is not derived from the trigger key, and the trigger choice is accompanied by per-host-layout consequence labels.
2. **Given** a chosen trigger key that already produces a character on a likely host layout, **When** the disclosure is shown, **Then** it states both sides of the tradeoff (host-dependent behaviour vs. predictable-but-possibly-inaccessible), never a one-sided slogan.
3. **Given** a completed define action, **When** the keyboard compiles, **Then** the IR contains the trigger rule, the fan-out rule, the escape rule, and the two lookup stores — the same cluster the `deadkey-single-tap` pattern emits today.
4. **Given** the S-02 "Deadkey" card in the assign flow, **When** it is used after this feature lands, **Then** it behaves exactly as before — it becomes one client of the define action, not a separate mint path.

---

### User Story 2 — Deadkey inventory (Priority: P1)

An author inherits a base keyboard with deadkeys and needs to answer "what deadkeys does this keyboard have?" Today that question has no answer in the studio — deadkeys surface only inside the assign flow. The inventory lists every deadkey: id, trigger key, pair count, and the characters it produces. Selecting one opens its editor.

**Why this priority**: Management is impossible without enumeration. This is the surface every other story hangs off.

**Independent Test**: Import a base with three deadkeys and confirm the inventory lists all three with correct triggers and pair counts.

**Acceptance Scenarios**:

1. **Given** any keyboard, **When** the inventory opens, **Then** every deadkey in the IR is listed with its id, trigger key, fan-out store names, and defined-pair count — including deadkeys the studio did not create.
2. **Given** a deadkey minted by the old S-02 path (codepoint-derived id), **When** it appears in the inventory, **Then** it is listed like any other deadkey with no loss of information.
3. **Given** a keyboard with no deadkeys, **When** the inventory opens, **Then** it shows an empty state with a single path to the define action — not a blank page.

---

### User Story 3 — Rename a deadkey (Priority: P2)

An author wants `dk(003b)` to be called something meaningful. Rename changes the id and rewrites every referencing rule and store atomically. The simulator proves the old key sequences still produce the same outputs after the rename.

**Why this priority**: Cosmetic until FR-004 lands, then load-bearing — named ids are how authors will think about deadkeys.

**Independent Test**: Rename a deadkey with four pairs and confirm all four sequences still type correctly in the simulator.

**Acceptance Scenarios**:

1. **Given** a deadkey with referencing rules and stores, **When** it is renamed, **Then** the trigger rule, fan-out rules, and both lookup stores are rewritten in one atomic mutation — no dangling references (§10 validator confirms).
2. **Given** a pre-FR-004 codebase, **When** the author gives a deadkey a name, **Then** the name is recorded as metadata on the deadkey (visible in the inventory, surviving round-trip) and promoted to the real `dk(name)` id by mechanical migration once FR-004 lands; the numeric id keeps working throughout.
3. **Given** a rename onto an existing id, **When** the author confirms, **Then** they chose explicitly between renaming theirs, merging, or replacing — the collision is never silent.

---

### User Story 4 — Delete a deadkey (Priority: P2)

An author removes a deadkey the keyboard no longer needs. Deletion removes the whole entity: trigger rule, fan-out rules, and lookup stores. If anything else references the deadkey's id, deletion is blocked with the list of referrers (or offers repointing) — never a half-deleted deadkey.

**Why this priority**: Without delete, every deadkey ever minted is permanent. Keyboards accumulate dead weight.

**Independent Test**: Delete a deadkey with pairs, recompile, and confirm no rule or store referencing the id remains and the keyboard still validates.

**Acceptance Scenarios**:

1. **Given** a deadkey with no external references, **When** it is deleted, **Then** the trigger rule, fan-out rules, and both lookup stores are gone from the IR and the keyboard validates.
2. **Given** a deadkey referenced by another rule, **When** deletion is attempted, **Then** the action is blocked and names the referrers; the author may repoint or cancel.
3. **Given** a deleted deadkey's former trigger key, **When** the author types it in the simulator, **Then** it behaves per the keyboard's closed/open state — deletion does not silently resurrect host fall-through.

---

### User Story 5 — Retarget and extend (Priority: P2)

An author moves an existing deadkey from `;` to a key their typists actually reach, and adds new base→accented pairs to its stores beyond what the assign flow's suggestions offer. Retarget shows the same host-layout disclosure as define; the id is unchanged by the move.

**Why this priority**: Keyboards evolve. A deadkey frozen to its birth key is a deadkey that rots.

**Independent Test**: Retarget a deadkey, add a pair, and confirm old sequences work on the new trigger and the new pair types correctly.

**Acceptance Scenarios**:

1. **Given** a deadkey with a stable id, **When** its trigger key is changed, **Then** only the trigger rule is rewritten — the id, stores, and pairs are untouched.
2. **Given** a retarget onto a key that already triggers another deadkey, **When** the author proceeds, **Then** the conflict is surfaced explicitly with merge / reassign / cancel choices.
3. **Given** an existing deadkey, **When** the author adds base→accented pairs directly, **Then** the pairs land in the fan-out stores without going through the assign flow.

---

### User Story 6 — Conflict handling (Priority: P2)

No lifecycle action silently overwrites another deadkey's identity. Minting, renaming, or retargeting onto an occupied id or an occupied trigger key always produces an explicit choice.

**Why this priority**: Today's silent merge and silent replace-by-name are data-loss-shaped behaviours. This story is the regression guard.

**Independent Test**: Attempt to define a deadkey with an id already in use; confirm the action stops and offers choices rather than replacing.

**Acceptance Scenarios**:

1. **Given** a define action whose proposed id collides, **When** the author has not chosen, **Then** the action does not proceed — it offers rename-mine, merge, replace, or cancel.
2. **Given** a replace choice, **When** confirmed, **Then** the replaced deadkey's rules and stores are removed first (the delete preconditions apply), so no orphaned references survive.
3. **Given** any lifecycle action, **When** it completes, **Then** the §10 validator layer confirms no dangling deadkey references and no duplicate ids.

---

## Design decisions

- **Id/trigger decoupling.** The id is assigned once at define time and is stable for the deadkey's life. The trigger key is retargetable metadata. The old codepoint-derived id scheme is grandfathered: existing deadkeys keep their ids, and the define action must not mint ids that collide with them.
- **Both naming conventions are legitimate.** Some authors use codepoint-derived ids (`dk(003b)` — the id points at the trigger key's letter); others name their deadkeys (`acute`, `grave`, `circum`). The feature privileges neither. The define flow accepts an optional author-chosen name from day one, stored as round-tripping metadata; the inventory shows id and name together; when FR-004 closes the codec, the stored name becomes the real `dk(name)` id by mechanical migration — the author is never asked twice.
- **Explicit over silent, everywhere.** Merge, replace, and repoint are always author-confirmed. This applies to the S-02 path too, which becomes a client of the define action.
- **Disclosure, not verdict.** Trigger-key choice (define and retarget) shows per-host-layout consequences with symmetric tradeoff copy per the 1802 A2 principle. The prompt asks the author the one question only they can answer — do their typists expect something on this key?
- **Demonstration.** Every lifecycle action is provable in the simulator before the author moves on: define → type trigger+base; rename → old sequences unchanged; delete → trigger key's new behaviour; retarget → new trigger works, old trigger released.

## Out of scope

- Deadkey timeout/cancel behaviour (deferred by 076, belongs to rule behaviours, not lifecycle).
- Raw-KMN editing (§16 — v1.1 candidate); all mutations go through the IR (§5a).
- Reorder, blocking, and context rule behaviours (#1815 / 076 scope).
- Changing what a deadkey *does* once triggered — this spec is the lifecycle of the entity, not its semantics.

## Sequencing

1. **076 FR-004** (named-deadkey codec closure) — prerequisite for named-id define/rename UI. Numeric-id lifecycle (define, inventory, delete, retarget, conflicts) can land before it.
2. This spec — deadkey lifecycle authoring.
3. Deadkey behaviour (timeout/cancel) — stays with 076's deferred track.

Resolves #1849.
