# Implementation Plan: 083 Deadkey lifecycle

**Spec**: `specs/083-deadkey-lifecycle/spec.md`
**Issue**: #1849
**Status**: Draft — for review before task breakdown

## Goal

Make deadkeys first-class lifecycle entities in the studio: listable, definable on any trigger key, renamable, deletable as a whole, retargetable — with explicit (never silent) conflict handling. The S-02 assign-flow card becomes one client of the define action, not a separate mint path.

## Technical design

### 1. IR: query, don't migrate (`packages/contracts`)

The IR already types deadkeys (`{ kind: "deadkey", id: number }` in `keyboard-ir.ts:29,37,52`); a deadkey *entity* (trigger key, fan-out stores, pairs) is today reconstructed ad hoc from rules+stores. Per §5a (IR is the spine), add queries rather than a schema migration:

- **`listDeadkeys(ir)`** — scans rules for the three-rule cluster (trigger `+ [K] > dk(id)`, fan-out `dk(id) + any(store) > index(store, 2)`, escape `dk(id) + [K] > accent`) plus the `dk_<id>_bases` / `dk_<id>_output` store pair. Returns `{ id, triggerKey, baseStore, outputStore, pairCount, origin }` where `origin` is `studio` | `imported` | `s02-legacy`. Imported/base deadkeys that don't match the cluster shape are listed with `origin: imported` and whatever fields are recoverable — they are manageable for delete/retarget but not for pair editing until recognised.
- **`allocateDeadkeyId(ir)`** — numeric, auto-unique. Must scan existing ids *including* codepoint-derived legacy ids (`003b`, `005e`, …) and never re-mint them. Grandfathering is load-bearing: existing keyboards keep their ids.
- **Validator extensions** (`validator.ts`, which already tracks `existingDeadkeys` and "deadkey resolution"): after any lifecycle mutation, assert no dangling `dk(id)` references, no duplicate ids, no orphaned `dk_<id>_*` stores. These are the regression guards for US6.

### 2. Decouple id from trigger (studio + engine)

Today `deadkeyNameFor` force-derives the id from the trigger char's codepoint, with a `"dead0"` fallback for unknown keys — a fixed string, so two unknown-key deadkeys collide silently. Change:

- `buildDeadkeyAssignment` (`MechanismGallery.tsx` ~L443) takes an explicit `deadkeyId`; `deadkeyNameFor` becomes the *default id suggestion* in the UI, not the forced value. Per §3c, the define form proposes (id suggestion, trigger suggestion) rather than presenting blank fields.
- `DEADKEY_OPTIONS` / `VALID_DEADKEY_TRIGGER_KEYS` (L687–700): the define action accepts any key, not just the 4. The 4 remain as *suggested* triggers (they're the corpus-common ones), with the host-layout disclosure beside the picker.
- `applyAssignments.ts:477-511` silent merge: replace with an explicit conflict result. The merge behaviour itself is preserved as one *offered* option ("merge into the existing deadkey on this trigger") — it exists to prevent store-overwrite data loss, and deleting it outright would regress the S-02 multi-char flow. The other options: mint a separate deadkey (new id, same trigger — allowed, since id is now decoupled), or cancel. Same treatment for the store replace-by-name path: collision surfaces a choice.

### 3. Lifecycle mutations (`packages/engine/src/deadkey-lifecycle/`, new)

One module, four operations, all IR-to-IR (§5a), all returning a result with `warnings`/`conflicts` rather than throwing on expected conflicts:

- **`defineDeadkey(ir, { triggerKey, id?, accentChar? })`** — emits the trigger rule, fan-out rule, escape rule, and the two empty stores (the same cluster `deadkey-single-tap.yaml` emits). Empty fan-out is valid: pairs are added later via the existing slot-assignment path.
- **`renameDeadkey(ir, { from, to })`** — rewrites trigger rule, fan-out rules, both stores, atomically. Blocked pre-FR-004 for non-numeric `to` (codec can't round-trip `dk(name)`; 076 FR-004 is the prerequisite).
- **`deleteDeadkey(ir, { id })`** — removes trigger rule, fan-out rules, both stores. Precondition: no other rule references `dk(id)`; if referenced, return the referrer list and refuse (studio offers repoint-or-cancel). This is the whole-entity delete #530 never reached.
- **`retargetDeadkey(ir, { id, newTriggerKey })`** — rewrites only the trigger rule. Id, stores, pairs untouched. Conflict surface if `newTriggerKey` already triggers another deadkey.

### 4. Studio surface (`packages/studio/src/editors/deadkey/`, new)

- **Inventory**: lists `listDeadkeys(ir)` output — id, trigger, pair count, produced characters. Empty state links straight to define (§3c: no dead ends). Selecting a row opens the per-deadkey editor (pairs, rename, retarget, delete).
- **Define flow**: trigger-key picker (any key; 4 corpus-common suggestions first), id field (proposed by `allocateDeadkeyId`, editable), host-layout disclosure panel, accent-char for the double-tap escape. Commits via `defineDeadkey`.
- **Conflict UI**: a single dialog component used by define/rename/retarget — states the collision, offers the explicit choices, never a silent default. Copy follows the A2 tradeoff principle.
- **Flow placement**: register as an editor step (`registerEditorSteps.ts` / `stepOrder.ts`) reachable from the flow map, alongside the carve gallery — exact step ordering is an open question (see below), but it must not be buried inside the assign loop; the assign loop is where deadkeys go to hide.
- **S-02 refactor**: the MechanismGallery deadkey card calls `defineDeadkey` under the hood; `handleApply` and `handleSuggestionAccept` keep their shapes, the write path is shared so the two cannot drift (same seam discipline as `buildDeadkeyAssignment` today).

### 5. Host-layout disclosure (dependency: 1802 track)

`likelyHostLayouts` does not exist in the repo yet — it's specified by the 1802 A3 amendment but unimplemented. The define/retarget disclosure needs *something* behind that interface. Decision: implement a minimal local `referenceHosts` module in this track keyed by key+modifiers (per A3, so the 1802 module can replace it without interface churn), seeded with the five + blocked set (US / Intl / AZERTY / QWERTZ / UK English). When the 1802 reference module lands, this track swaps the import. The disclosure shows, per likely host, what the trigger key does there — symmetric tradeoff copy, no slogans.

### 6. Touch layout

The pattern's `touchLayoutFragment` places the accent char as a touch key. `defineDeadkey` should accept an optional touch placement (default: propose the accent char on the touch layout per the existing touch-key diagnostics in `touch-key-diagnostics.ts`); deleting a deadkey removes its touch key only if the studio placed it. `TouchLayoutKeySp deadkey=8` (`keyboard-ir.ts:188-189`) is the marker to scan for.

## Phases

1. **Contracts** — `listDeadkeys`, `allocateDeadkeyId`, validator extensions. Colocated `*.test.ts` per repo convention. No UI, no engine changes. Unblocks everything below.
2. **Engine lifecycle module** — define/rename/delete/retarget + conflict results; `applyAssignments.ts` merge → explicit conflicts (with merge preserved as an option). Engine `*.test.ts` incl. grandfathered-id and referrer-block cases.
3. **Studio surface** — `editors/deadkey/` (inventory, define, per-deadkey editor, conflict dialog), flow-step registration, S-02 refactor onto `defineDeadkey`. Colocated `*.test.tsx` following the `MechanismGallery.*.test.tsx` pattern.
4. **Disclosure + demonstration** — minimal `referenceHosts` module, disclosure panel in define/retarget, simulator proof hooks per story (define → type trigger+base; rename → old sequences unchanged; delete → trigger's new behaviour; retarget → new trigger works).

## Test strategy

- Unit: every new function gets colocated tests (contracts, engine, studio), mirroring existing file conventions.
- Validator regression: delete/rename/retarget tests assert the §10 checks (no dangling refs, no duplicate ids, no orphaned stores).
- Simulator independent tests per user story, as the spec requires — the studio already runs the real KeymanWeb processor, so lifecycle actions are proven on typed sequences, not just emitted.
- Conflict matrix test: define/rename/retarget × (id collision, trigger collision, referrer block) — every cell must surface a choice or a refusal, never a silent write.

## Risks & open questions

1. **Flow placement.** Where the Deadkeys step sits in `stepOrder.ts` affects discoverability; proposing alongside the carve gallery, but the flow-map decision needs a look at `docs/design-notes/mechanism-gallery-flow.md` before it's final.
2. **`"dead0"` fallback.** Any existing keyboard that minted two unknown-key deadkeys already has a collision baked in. Phase 1's `listDeadkeys` should detect duplicate-id corruption and the inventory should surface it as a repair prompt rather than crashing.
3. **1802 timing.** If the 1802 reference-host module lands first, Phase 4 shrinks to an import swap. If not, the minimal local module ships — either way the interface is key+modifiers per A3.
4. **FR-004 timing.** Named-id UI (rename-to-name, define-with-name) is gated on 076 FR-004. The plan keeps numeric ids fully working before that; the named-id UI is a flagged follow-up, not scope creep into this track.
5. **Imported deadkeys.** `origin: imported` deadkeys with non-cluster shapes (e.g. `sil_euro_latin`'s 92-rule families) get inventory visibility and delete/retarget, but pair editing stays disabled until the codec recognises their shape — honest limitation, stated in the UI.
