# Exploration baseline — the touch key editor before spec 061

**Feature**: 061-touch-editor-parity · **Task**: T001 (Phase 1, Setup) · **Captured**: 2026-08-06

**Purpose**: [SC-001](spec.md) requires that "every one of issue #1530's six complaints is
demonstrably resolved by clicking through the touch stage". A claim that something was *resolved*
needs a *before*. This document is that before. **T062** re-runs the same six probes against the
implementation and diffs its findings against the "How to re-probe after the change" section of
each complaint below.

**Baseline commit**: `b79586fa` — *docs(spec): touch key editor Developer-parity remodel (spec
061)*, i.e. the tip of `061-touch-editor-parity` before any implementation task landed.

> [WARN] **Every line number below is stated against `HEAD` = `b79586fa`, read via
> `git show HEAD:<path>`, not against the working tree.** Other agents are landing spec 061's
> implementation waves into
> [packages/studio/src/editors/assignLoop/keyGrid/](../../packages/studio/src/editors/assignLoop/keyGrid/)
> concurrently with this capture, so working-tree line numbers were already drifting while this
> was written. To reproduce any citation exactly:
>
> ```
> git show b79586fa:packages/studio/src/editors/assignLoop/TouchGallery.tsx > /tmp/TouchGallery.tsx
> ```

---

## Method, and its limits *(read before trusting anything below)*

T001's wording is "drive the touch stage headed (`npx playwright test --headed`)". That is **not**
what this baseline is, for two reasons — one environmental and one load-bearing.

1. **Environmental**: a headed browser session needs an interactive display this environment does
   not have. Headless was attempted instead; see the probe result below.
2. **Load-bearing — and this is itself the finding for complaints #2 and #3**: for most of the six
   complaints there is *nothing to click*. The add wedge never renders, the command wedge never
   renders, there is no remove trigger, and there is no layer selector anywhere in the DOM. A
   click-through cannot record "the button did nothing" when the button is absent. The absence is
   the baseline observation, and absence is established more precisely from the source than from a
   screenshot.

So this baseline is a **source-level trace against `b79586fa`**, corroborated by one automated
probe. Where a statement is *inferred* from code rather than *observed* running, it is labelled
`[INFERRED]`. Where it was observed by running something, it is labelled `[OBSERVED]`.

### The automated probe

Attempted, as T001 asks, capped at the two attempts the task allows:

```
cd packages/studio && npx playwright test touch-key-grid-a11y.spec.ts --reporter=line
```

**Result: `[FAIL]` — 1 failed. The harness itself started fine; the walk never reached the touch
stage.** Playwright launched, `webServer` brought `pnpm dev` up on `http://localhost:5273`
([playwright.config.ts](../../packages/studio/playwright.config.ts):33-38), and Chromium rendered
the SPA. The walk then stalled inside the **shared survey helper**, not in any touch-stage code:

```
Error: expect(locator).toBeVisible() failed
  Locator: getByTestId('base-picker')
  Timeout: 90000ms   Error: element(s) not found
  at helpers/surveyFlow.ts:229  (driveIdentityLite)
```

The captured accessibility tree shows why: the survey was parked on **"Step 5 of ~9 — Who should be
listed as the author of this keyboard?"** with `Next` disabled.
[e2e/helpers/surveyFlow.ts](../../packages/studio/e2e/helpers/surveyFlow.ts) drives five identity
questions (English name → conditional region → autonym → `il_language_code` →
`il_target_script`, lines 196-221) and then waits directly on `base-picker` (line 229). It has no
step for an author question, so the helper is **one question short of the current survey** and every
e2e walk that passes through `driveIdentityLite` stalls before the base picker.

Three things follow, and they matter to later tasks:

- `[OBSERVED]` This is **pre-existing helper drift, unrelated to spec 061's subject matter** — it
  fails identically on an untouched touch-stage. Nothing was modified to make it run, per T001.
- `[OBSERVED]` The Playwright *toolchain* works here (browsers under
  `~/AppData/Local/ms-playwright`, dev server, headless Chromium). Only the walk's survey helper is
  stale. So T062's exploration pass is feasible in this environment **once that helper is fixed**.
- `[WARN]` **T016 will hit this too.** The un-skipped add/remove walk (T010) calls the same
  `driveIdentityLite`, so it cannot pass until `surveyFlow.ts` answers the author question —
  independently of whether T013-T015's wiring is correct. Whoever owns T016 should expect to fix
  the helper first and should not read that stall as a wiring failure.

### What a later agent must do to complete the T062 comparison

1. Fix the `driveIdentityLite` drift above (answer the author question, or make the helper
   presence-poll each question rather than assume a fixed sequence). That is a test-helper fix, not
   a spec change.
2. Load **`sil_cameroon_qwerty`** (Cameroon QWERTY — Matthew Lee, `../keyboards/release/sil/sil_cameroon_qwerty`,
   see [docs/keyboard-index.md](../../docs/keyboard-index.md)), the fixture T001 names, and reach the
   touch stage → "By key". It is the right fixture precisely because it carries the full desktop
   complement of 11-12 keys per row that US2 AS3's crowding case needs.
3. Walk the six "How to re-probe after the change" recipes below **in order**, recording
   `[OBSERVED]` results.
4. Re-run the source-level citations too. Several of the baseline claims are *structural* (a prop is
   optional; a component is imported nowhere), and the honest post-check for those is `tsc` plus a
   `git grep`, not a click. Each recipe says which kind it is.

---

## The six complaints, exactly as stated

[spec.md](spec.md):13 carries the user's verbatim report as the feature's **Input**, and that is the
authoritative enumeration — the spec quotes all six rather than paraphrasing them, so nothing here
is derived or renumbered. Quoted verbatim:

1. *"It does not look as functional/clean as the keyman developer interface."*
2. *"No fields are editable, even the sp 'type'."*
3. *"I don't see commands for adding or removing keys (developer had + and x buttons)."*
4. *"No text is editable, even by changing preferences. For example, I can't turn a K_1 key into
   U_0300 when I want to redefine it as non-number or use special rules with it."*
5. *"It seems we can only edit the 'default' layer."*
6. *"We can't see separate 'phone' and 'tablet' versions if they exist."*

The spec's own "Context: what actually went wrong" section additionally maps three of them by
number — #5 to the missing layer selector ([spec.md](spec.md):50), #6 to "already working"
([spec.md](spec.md):55-57), and #2/#4 to User Story 3 ([spec.md](spec.md):136) — and
[spec.md](spec.md):100 records that five of the six resolve in User Story 1. The requirement
mappings below use those statements rather than re-deriving them.

---

## Complaint 1 — "It does not look as functional/clean as the keyman developer interface"

**Complaint**: The key-mode board does not read like Keyman Developer's touch layout builder.

**Requirement it maps to**: US2 and US3 as a whole. Specifically **FR-010** (render the touch
layer's own geometry), **FR-011** (scale to the layer maximum), **FR-012** (last key stretches, hatch
removed), **FR-013** (per-row metrics readout), **FR-015** (declared width presented as a minimum),
**FR-018** (one property panel), **FR-023** (key id on every keycap), **FR-024** (full pane width, no
live OSK in key mode), and **FR-007** (remove "Fill row" / "Even out row"). Measured by **SC-001**;
the geometry half also by **SC-006**.

**Observed pre-change behaviour**: five concrete divergences from the reference the spec sets out at
[spec.md](spec.md):61-67.

- A short row ends in a **decorative diagonal hatch** marking unused slack, not in a stretched last
  key. `[INFERRED]` from the render path; `[OBSERVED]` only as source, since the walk could not
  reach the grid.
- **No per-row metrics readout exists at all** — no key count, no key-width total, no padding total,
  no row total. There is no occurrence of "metrics" anywhere in `KeyGrid.tsx`.
- Instead of metrics, the row carries two buttons ("Fill row N", "Even out row N") whose handlers
  the single caller does not supply, so they render and do nothing (see complaint #2's evidence for
  the same idiom).
- **The keycap does not print its key id.** The id appears *only as a fallback* when the keycap
  string is empty, so a normal character key shows its glyph and nothing else.
- The selected key is described by **two stacked surfaces** — a read-only `KeyInspector` above an
  editing `AssignPanel` — rather than Developer's single property panel, and the right 45% of the
  pane is occupied by the live OSK preview even in key mode.

**Evidence** (all `HEAD` = `b79586fa`):

- Hatch: [KeyGrid.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx):795 —
  `backgroundImage: repeating-linear-gradient(135deg, …)`, described at
  [KeyGrid.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx):781-782 as
  "decorative only: a diagonal hatch, never a printed number". The slack width feeding it is
  computed at line 716; the module doc explains the design at lines 34-46.
- No metrics: `grep -n "metrics"` over
  [KeyGrid.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx) at `HEAD` returns
  **zero** hits.
- Row buttons: `key-grid-fill-row-${rowIndex}` at
  [KeyGrid.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx):853 (guarded by
  `canFillRow = row.slackPct > 0`, line 719) and `key-grid-even-out-row-${rowIndex}` at line 875.
- Keycap carries no id:
  [KeyGridCell.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyGridCell.tsx):198 —
  `const displayLabel = cell.keycap.length > 0 ? displayChar(cell.keycap) : cell.id;`. The id *is*
  in the accessible name (lines 283-295), so this is a visual gap, not an accessibility one.
- Two stacked surfaces:
  [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx):5656-5674 mounts
  `<KeyInspector>` then `<AssignPanel>` inside one column, with the comment at lines 5652-5654
  calling it "display (KeyInspector) beside editing (AssignPanel)".
- OSK always present:
  [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx):6132-6146 passes
  `<GalleryPreviewPane>` as `rightContent` unconditionally, and
  [AssignLoopShell.tsx](../../packages/studio/src/editors/assignLoop/AssignLoopShell.tsx):56 declares
  `rightContent: ReactNode` **required**, with lines 60-61 documenting a "Fixed 45% split — not
  resizable".

**How to re-probe after the change**:

- *Click-through*: at the touch stage on `sil_cameroon_qwerty` → "By key", confirm (a) no hatch is
  drawn on any short row and its last key reaches the right edge, (b) each row shows four numbers
  (count / key width / padding / total), (c) each keycap shows its id under the glyph, (d) selecting
  a key opens **one** panel, (e) the grid occupies the full pane and no OSK is shown — then switch to
  character mode and confirm the OSK **returns** (FR-024's second half is a no-regression clause).
- *Structural*: `git grep -n "repeating-linear-gradient" packages/studio/src/editors/assignLoop/keyGrid/`
  must return nothing, and `key-grid-fill-row-` / `key-grid-even-out-row-` must be gone from both
  `KeyGrid.tsx` and `KeyGrid.test.tsx` (T012). `key-grid-row-actions-${rowIndex}` **must survive** —
  FR-038 forbids regressing spec 058 SC-009.

---

## Complaint 2 — "No fields are editable, even the sp 'type'"

**Complaint**: Nothing in the selected-key surface can be changed; the key-type radio in particular
snaps back.

**Requirement it maps to**: **FR-001** (every editing callback required, not optional), **FR-002**
(the studio supplies the handlers), **FR-003** (no control may render inert). US1 AS1 and AS2 are the
acceptance scenarios; **SC-002** is the measurable outcome, and **FR-018** is its full-form successor
in US3.

**Observed pre-change behaviour**: `[INFERRED]` — the `sp` radio group is a **controlled** input
whose `value` is derived from the selected cell and whose `onChange` calls an **optional** callback
the one caller does not pass. So clicking a different key type fires `onSpChange?.(…)` against
`undefined`, nothing commits, React re-renders from `currentSp`, and the selection **visibly reverts**
to where it was. Every diagnostic's fix button in the same panel renders `disabled`, for the same
reason. This is the worst of the three absence behaviours the spec catalogues
([spec.md](spec.md):40): a dead button looks broken, but a reverting radio looks like the application
is refusing the author.

**Evidence**:

- `TouchGallery.tsx` mounts `<KeyInspector>` with **exactly two props** — `selectedCell` and a
  conditional `layout`: [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx):5656-5661.
  No `onSpChange`. No `onApplyFix`.
- Both are declared optional:
  [KeyInspector.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.tsx):354
  (`onSpChange?:`) and :368 (`onApplyFix?:`).
- The reverting radio:
  [KeyInspector.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.tsx):575-579 —
  `<RadioGroup value={String(currentSp)} onChange={(v) => onSpChange?.(…)}>`, with `currentSp`
  computed from the selected cell at line 410.
- The disabled fix button:
  [KeyInspector.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.tsx):768 —
  `disabled={onApplyFix === undefined}`, and line 778 sets `cursor: "default"` to match.
- The component's own module doc states the design at lines 70-89 ("This is a display surface… an
  unwired mount disables the buttons rather than hiding them"), naming T097 as the wiring task that
  never came.
- The `sp` radio is the **only** editing control in the whole 796-line panel: `grep -n
  "<input|<textarea|<select|RadioGroup|onChange"` over `KeyInspector.tsx` at `HEAD` returns lines
  101, 575, 579 only (plus the one `<button>` at 763, the disabled fix control).

**How to re-probe after the change**:

- *Click-through*: select a *Character* key, choose *Blank*, and confirm the radio **stays** on
  *Blank* (US1 AS1). Then trigger a key with a finding that offers a fix, confirm the fix control is
  **enabled**, activate it, and confirm the working copy changed (US1 AS2).
- *Structural, and this is the durable half*: FR-001 makes `tsc` the test. After T002-T008,
  `grep -n "on[A-Z][A-Za-z]*?:"` over the key-mode surfaces should find no editing callback still
  optional, and `pnpm -r typecheck` must pass — a mount that forgot a handler now fails the build
  instead of rendering inert.
- *PR-lane*: the vitest key-mode integration block in
  [TouchGallery.test.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.test.tsx) (T009)
  asserts the radio holds **and** that the new `sp` reaches the emitted artifact through
  `runTransform`. That, not the click-through, is what keeps this fixed.

---

## Complaint 3 — "I don't see commands for adding or removing keys (developer had + and x buttons)"

**Complaint**: There is no way to add a key and no way to remove one.

**Requirement it maps to**: **FR-002** and **FR-003** for the wiring; **FR-022** (`+` between keys and
at both row ends is the *only* grid-level editing affordance); **FR-019** (delete moves into the
property panel, presenting the three outcomes); **FR-008** (the add/remove e2e walk is un-skipped and
passes unmodified). Measured by **SC-001** and **SC-009**.

**Observed pre-change behaviour**: `[INFERRED]`, and the strongest statement in this document
because it is structural rather than behavioural: **there is no add affordance and no remove
affordance in the DOM at all.** `KeyGridCell` computes `showAddWedge` and `showMenuWedge` as
`!isBlank && <callback> !== undefined`; `TouchGallery` passes neither callback to `<KeyGrid>`, and
`KeyGrid` only forwards what it is given — so both wedges are permanently `false` and never render.
Double-clicking a layer-switch key is inert for the same reason (`canFollowNextLayer`).

Worse, **seven components and hooks were built, unit-tested, and are imported by nothing but their
own tests**: `KeyGridCommandMenu`, `RemoveKeyDialog`, `RenameDialog`, `FamilyApplyDialog`,
`FindPanel`, `useKeyCommands`, `useModeContextCarry`. `FamilyApplyDialog` has no test file either —
it is imported nowhere in the repository.

**Evidence**:

- The mount supplies one editing handler and no key commands:
  [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx):5628-5642 —
  `<KeyGrid>` receives `viewModel`, `selectedAddress`, `onSelectCell`, `onKeyDown`, `label`,
  `platforms`, `activePlatformId`, `onPlatformChange`, `provenance`. No `onAddKeyAfter`, no
  `onOpenCommandMenu`, no `onFollowNextLayer`, no `onFillRow`, no `onEvenOutRow`.
- The props are optional on the way down:
  [KeyGrid.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx):311 (`onFillRow?`),
  :317 (`onEvenOutRow?`), :327 (`onAddKeyAfter?`), :328-331 (`onOpenCommandMenu?`), :332
  (`onFollowNextLayer?`), and again on the cell at
  [KeyGridCell.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyGridCell.tsx):107, :113,
  :121.
- The affordance is gated on their presence:
  [KeyGridCell.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyGridCell.tsx):306
  (`const showAddWedge = !isBlank && onAddKeyAfter !== undefined;`), :307 (`showMenuWedge`), :309
  (`canFollowNextLayer`). The wedge render sites are gated on those flags at :461 (`{isHovered &&
  showAddWedge && …}`, test id `key-grid-cell-${cell.address}-add-wedge` at :465) and :490.
- Nothing mounts the seven surfaces. At `HEAD`,
  `git grep -n 'from "[^"]*<name>' -- packages/studio/src` finds a real import of each **only in its
  own `*.test.tsx`**: `KeyGridCommandMenu.test.tsx:22`, `RemoveKeyDialog.test.tsx:36`,
  `RenameDialog.test.tsx:58`, `FindPanel.test.tsx:23`, `useKeyCommands.test.ts:29`,
  `useModeContextCarry.test.ts:40`. `FamilyApplyDialog` has **no importer anywhere**. The other name
  hits inside `TouchGallery.tsx` (lines 2503, 2851) and inside `KeyGrid.tsx` / `KeyGridCell.tsx` are
  **prose in comments** or a lone `import type { KeyGridCommandMenuAnchor }`
  ([KeyGrid.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx):206,
  [KeyGridCell.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyGridCell.tsx):76) — a
  type-only import, erased at build, mounting nothing.
- The e2e walk that would have caught this was `test.skip`, with a 40-line header naming the exact
  blocker: [e2e/touch-key-add-remove.spec.ts](../../packages/studio/e2e/touch-key-add-remove.spec.ts)
  at `HEAD`, lines 35-70 (the STATUS block) and 268-271 (the `test.skip` call). T010 removes both.

**How to re-probe after the change**:

- *Click-through*: hover a non-blank key and confirm a `+` appears; activate it and confirm a key is
  added at the standard width (FR-016). Select a **different** key, open the property panel's delete
  control, confirm all three outcomes (reflow / redistribute / suppress) are offered with one
  proposed (FR-019), choose *suppress in place*, and confirm it applied.
- *Structural*: `git grep` for real imports of the seven names must now find `TouchGallery.tsx`
  (T013). And the two test ids the walk pins must exist verbatim: `touch-key-mode-add-key`,
  `touch-key-mode-remove-key` (T015).
- *E2E*: `cd packages/studio && npx playwright test touch-key-add-remove.spec.ts` must pass **with
  no edit to any assertion** (FR-008). Expect to fix `driveIdentityLite` first — see the probe
  section above. Note the standing of this walk: research decision **D2** makes it *exploration
  evidence*, not a PR-lane gate, because [ci.yml](../../.github/workflows/ci.yml) has no Playwright
  step.

---

## Complaint 4 — "No text is editable… I can't turn a K_1 key into U_0300"

**Complaint**: A key's text/id cannot be redefined — the author cannot repurpose an inherited
physical key (`K_1`) as something else (`U_0300`).

**Requirement it maps to**: **FR-018** (keycap, hint and **id** among the eight editable panel
fields), **FR-029**-**FR-032** (the id proposal path, including "state why" where no proposal is
possible), **FR-033**-**FR-035** (keycap proposal, standalone alternative, never rewrite a hand-edited
keycap). [spec.md](spec.md):136 assigns complaints #2 and #4 "in their full form" to User Story 3.
Measured by **SC-003** ("change a key's id, keycap, type and position without leaving key mode and
without typing an id by hand") and **SC-007**.

**Observed pre-change behaviour**: `[INFERRED]`, and **partially** working — the honest reading is
narrower than "nothing at all".

- There *is* a live commit path for **assigning a character to a key**: `AssignPanel` is mounted
  with a real `onCommit`, and `handleAssignPanelCommit` is the single commit call site, carrying the
  Case A / Case B `promotedLayout` split (`setWorkingIR` vs
  `setTouchLayoutJson(emitTouchLayout(…))`).
- But it sits **below** a read-only `KeyInspector`, i.e. below the surface that looks like the
  property panel, which is why it reads as absent. The spec makes exactly this point at
  [spec.md](spec.md):101-107.
- And there is **no field for the key's id, keycap, hint, width or padding anywhere**. `KeyInspector`
  displays them and cannot change them (its only editing control is the `sp` radio — see complaint
  #2's evidence). `RenameDialog`, the surface built for changing an id, is mounted nowhere. So the
  specific `K_1` → `U_0300` repurpose the user describes has no route: the author can assign a
  character, but cannot *rename the key*.

**Evidence**:

- `AssignPanel` mounted with a live commit:
  [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx):5664-5674
  (`onCommit={handleAssignPanelCommit}`); the handler is at
  [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx):2339-2340, and
  the comment at :2332-2338 records it as the "ONE commit call site".
- Stacked below the display panel:
  [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx):5652-5675 (one
  column, `KeyInspector` first).
- `KeyInspector` is read-only by design and says so:
  [KeyInspector.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.tsx):70-73 —
  "Assigning a character, changing an id, editing `nextlayer`… are Phase 6-8 concerns… that have no
  home yet in this file."
- `RenameDialog` unmounted: real import only at
  [RenameDialog.test.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/RenameDialog.test.tsx):58
  (see complaint #3's evidence for the full sweep).

**How to re-probe after the change**:

- *Click-through*: select an inherited `K_1` key on `sil_cameroon_qwerty`, change its **id** in the
  panel to a `U_0300`-class id, and confirm the change reaches the emitted artifact. Then walk US5's
  four classes — plain character, combining mark, multi-codepoint string, and a character the
  physical key already produces — confirming that **each gets a proposal** and that no id ever has to
  be typed by hand (SC-003, SC-007). For the titlecase edge case (`Ǆ`, `Ǉ`, `Ǌ`), confirm the panel
  states *why* no case triple is offered rather than silently offering nothing (FR-032).
- *Also confirm the non-regression*: a keycap the author has hand-edited must **not** be rewritten
  when the output later changes (FR-035, US5 AS5).
- *Structural*: `RenameDialog` and `FamilyApplyDialog` must have a real importer in
  `TouchGallery.tsx`.

---

## Complaint 5 — "It seems we can only edit the 'default' layer"

**Complaint**: Only the `default` layer is reachable.

**Requirement it maps to**: **FR-004** (a selector covering every layer of the active platform,
including layers no key's next-layer reaches), **FR-005** (grouped by family and plane, with rolled-up
diagnostic counts), **FR-006** (following a key's next-layer switches the selector). US1 AS3 is the
acceptance scenario. [spec.md](spec.md):50 records this as "Issue complaint #5, exactly".

**Observed pre-change behaviour**: `[INFERRED]` — **the complaint is literally true, and it is not a
wiring gap but a missing feature.** `activeKeyLayerId` is a `useState<string>("default")` whose
setter is called from exactly one place: a repair effect that re-resolves the id when the layout
changes. There is **no control of any kind** — no tablist, no select, no button — that lets an author
change it. The grid is parameterized by `layerId` and renders whichever layer the state holds, so
the engine side is ready; only the control is absent.

**Evidence**:

- [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx):2130 —
  `const [activeKeyLayerId, setActiveKeyLayerId] = useState<string>("default");`
- `setActiveKeyLayerId` has exactly **two** occurrences at `HEAD`: its own declaration (:2130) and
  the repair effect at :2160. No event handler, no callback prop, no user-facing control.
- The state is consumed but never chosen by the author: it feeds
  `buildKeyGridViewModel({ …, layerId: activeKeyLayerId })` at
  [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx):2195-2199 and the
  grid's own aria-label at :5635.
- No selector exists: `grep -n "layer-selector|key-layer"` over `TouchGallery.tsx` at `HEAD` returns
  **zero** hits — so none of `key-layer-selector`, `key-layer-selector-option-*`,
  `key-layer-selector-group-*`, `key-layer-selector-count-*` (the test ids T011 introduces) is
  present.

**How to re-probe after the change**:

- *Click-through*: at the touch stage, confirm a layer selector is present, switch to `shift`, and
  confirm the grid re-renders that layer's keys (US1 AS3). Then check the two edge cases the spec
  names: a layer **no key's next-layer reaches** must still be selectable (FR-004 — true by
  construction if T011 sources ids from the platform's declared `layers[]`), and a platform with
  **exactly one** layer must render a *label*, not a tablist, so it does not imply choices that do
  not exist. Confirm each layer shows a rolled-up finding count without visiting it (FR-005), and
  that double-clicking a layer-switch key moves the selector to that layer (FR-006).
- *Structural*: `key-layer-selector` and friends must exist; and per FR-039 the counts must come
  from the already-computed diagnostics map, so `grep` should find **no second validation pass** —
  no new debounce timer (decision D3).

---

## Complaint 6 — "We can't see separate 'phone' and 'tablet' versions if they exist"

**Complaint**: Per-platform (phone / tablet / desktop) variants of the touch layout are not visible.

**Requirement it maps to**: **no functional requirement of its own.** [spec.md](spec.md):55-57
records this complaint as **already working** before spec 061 — "Platform tabs render and function…
`onPlatformChange` is the one wired handler. The tabs are simply too quiet to find inside a pane that
is otherwise inert." It remains in scope only through **SC-001** ("every one of the six complaints is
demonstrably resolved"), so post-change it is a **confirmation of no regression**, with **FR-038** (the
grid stays a conformant, keyboard-operable ARIA grid) as the standard it must not fall below.

**Observed pre-change behaviour**: `[INFERRED]` — the platform tablist **does** render and **is**
wired. `KeyGrid` renders a `role="tablist"` of platform tabs, and `onPlatformChange` is the single
handler `TouchGallery` supplies. The complaint is therefore about *discoverability*, not capability:
the tabs sit at the top of a pane where nothing else responds, so an author who found everything
else inert would reasonably conclude these were inert too.

**Evidence**:

- [KeyGrid.tsx](../../packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx):612 (`role="tablist"`),
  :617 (`data-testid="key-grid-platform-tabs"`), :635
  (`data-testid={\`key-grid-platform-tab-${p.id}\`}`).
- Wired at the mount:
  [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx):5641 —
  `onPlatformChange={(platformId) => setActiveKeyPlatformId(platformId)}`, the single "yes" row in
  the spec's eight-callback table ([spec.md](spec.md):29). The platform catalog it renders is built
  at :2119, with a repair effect at :2138-2145.

**How to re-probe after the change**:

- *Click-through*: on a keyboard whose touch layout declares more than one platform, confirm the
  tabs are present, switch phone → tablet, and confirm the grid re-renders that platform's layers —
  **and** that the layer selector (complaint #5) re-scopes to the newly selected platform's layer
  list rather than stranding a layer id that platform does not have.
- *No-regression*: run
  `cd packages/studio && npx playwright test touch-key-grid-a11y.spec.ts` (once the survey helper is
  fixed) and confirm no accessibility violation at or above *serious* impact (SC-004, FR-038). The
  spec 058 SC-009 row-actions fix must survive T012's removal of the two row buttons — FR-038 names
  it explicitly.

---

## Summary table — the baseline in one view

| # | Complaint (abridged) | Pre-change state at `b79586fa` | Kind of defect |
|---|---|---|---|
| 1 | Doesn't look like Developer | Hatch instead of stretch; **no** row metrics; no key id on keycap; two stacked panels; OSK occupies 45% in key mode | Design divergence |
| 2 | No fields editable, even `sp` | `sp` radio is controlled with an **unsupplied** optional `onChange` — visibly reverts; fix buttons `disabled` | Unwired (silent) |
| 3 | No add / remove commands | **No affordance renders at all**; seven built + tested surfaces imported nowhere; the e2e walk that would catch it was skipped | Unwired (absent) |
| 4 | No text editable (`K_1` → `U_0300`) | Character **assign** works but sits below the read-only panel; **no** id / keycap / hint / width / pad field; `RenameDialog` unmounted | Partly unwired, partly missing |
| 5 | Only the `default` layer | `activeKeyLayerId` state exists; **no control exists** | Genuinely missing |
| 6 | Can't see phone / tablet | **Works** — `role="tablist"` renders, `onPlatformChange` is the one wired handler; too quiet to find | Already working |

`[NOTE]` The kind column is the load-bearing distinction for T062. Rows 2-4 are verified post-change
by *clicking and seeing it hold*; rows 3 and 5 are additionally verified by *something now existing
in the DOM that did not before*; row 6 is verified by *nothing having broken*. Row 1 is a judgement
call against [spec.md](spec.md):61-67's description of Developer's four regions, and should be
recorded as such rather than as a pass/fail.
