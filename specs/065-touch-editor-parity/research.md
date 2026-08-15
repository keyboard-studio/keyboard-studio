# Research: Touch key editor — Developer-parity remodel

**Feature**: 065-touch-editor-parity · **Phase 0** (precedes design)

Every decision below was taken against the code as it stands on `065-touch-editor-parity`,
not against spec 063's prose. Where the two disagree the code is cited.

---

## D1 — Required callbacks, not optional ones

**Decision**: Make every editing callback on `KeyGrid`, `KeyGridCell` and the new property
panel a **required** prop. Delete the `?.` call sites and the `=== undefined` render guards.

**Rationale**: The root cause named in the spec is one idiom. Eight optional `on*` props with
exactly one caller converted eight compile-time errors into eight silent runtime nothings —
verified: `TouchGallery.tsx:5641` supplies `onPlatformChange` and nothing else, while
`KeyGrid.tsx:311/317/327/328/332` and `KeyInspector.tsx:354/368` all declare `?`. Making them
required moves the whole class of defect to `tsc`, which runs in the PR lane
(`.github/workflows/ci.yml` → `pnpm typecheck`). It also resolves the three-way disagreement
about absence: `KeyGridCell` hides (`showAddWedge = !isBlank && onAddKeyAfter !== undefined`,
line 306), `KeyGrid` renders a dead button (line 854), `KeyInspector` renders a controlled
input that can never change (line 579) — the reverting radio of complaint #2.

**Alternatives considered**:

- *Keep optional, add an ESLint rule requiring the props at the call site.* Rejected — a lint
  rule that encodes "these eight props are mandatory" is a second, weaker statement of what
  the type system states exactly once, and it cannot see a new prop added later.
- *Keep optional, add a runtime dev-mode warning.* Rejected — the failure is already silent at
  runtime; a console warning in a surface the author is looking at does not help the author.
- *A single `commands` object prop.* Rejected as this feature's move: it is a larger refactor
  of three components' signatures for the same guarantee `required` gives, and it hides which
  handlers a mount actually supplies behind one object literal.

**Consequence**: `KeyGrid.test.tsx`, `KeyInspector.test.tsx`, `KeyGridCell` tests and
`TouchGallery.test.tsx` must all supply the handlers. That churn is the point — a test that
could omit a handler is what let this ship.

---

## D2 — Playwright explores; vitest is the repeatable gate

**Decision**: Split the two tools by **role**, not by overlap.

- **Playwright is the exploration tool.** Drive the real SPA in a browser to *discover* whether
  a surface behaves — clicking through issue #1530's six complaints, confirming a radio holds,
  watching a row re-proportion. Run ad hoc from the CLI (`npx playwright test`), including
  headed/`--debug`. FR-008's un-skip is still delivered and must pass unmodified, but its
  standing is **evidence**, not a gate.
- **vitest carries every durable assertion.** Anything that must keep being true after this
  feature ships gets a vitest test in the PR lane. FR-009 is satisfied by a key-mode integration
  block in `TouchGallery.test.tsx`.

**Rationale**: `.github/workflows/ci.yml` runs `pnpm typecheck`, `pnpm -r test`, `pnpm lint`,
plus three standalone vitest configs — and **no Playwright step**. E2E genuinely runs outside
the PR lane, exactly as the spec's "Why no test caught it" section says. So a Playwright-only
assertion is not a regression guard at all; it is a thing someone once observed.

The vitest side can carry more than DOM interaction, which is what makes the split clean rather
than lossy: `TouchGallery.test.tsx` already mounts the real component against real store state
(5,756 lines) **and** reaches the emitted artifact through `runTransform(<id>)`, which returns
the VFS map. Emitted-`.keyman-touch-layout` assertions therefore need no browser.

**Consequence — SC-005 gets a vitest twin.** "Untouched files byte-identical, untouched keys
structurally identical" is asserted today only inside the skipped Playwright walk. Under this
split that is not good enough for a success criterion, and it does not need to be: apply a
handful of key edits through the mounted component, call `runTransform`, and compare against the
shipped source out of the same VFS. The e2e walk keeps its own copy of the assertion — two
independent statements of a fidelity claim is proportionate for the one criterion about not
corrupting the author's keyboard.

**Alternatives considered**:

- *Add a Playwright job to `ci.yml`.* Rejected for this feature — it is a CI-infrastructure
  change (browser downloads, runtime budget, flake policy) whose scope and owner are separate
  from the touch editor, and FR-009 is satisfiable today without it. Worth raising separately.
- *Leave SC-005 to the e2e walk alone.* Rejected once the split was named: it would make the
  feature's strongest safety claim rest entirely on the lane that does not run.
- *A pure structural test that reflects over `KeyGridProps` to assert no `on*` prop is
  optional.* Rejected as the primary guarantee — D1 makes `tsc` that test, and a reflection
  test over a TS type cannot run at runtime anyway. SC-002 is met by the type change plus the
  behavioural integration test.

**Known limitation, carried forward**: the raw-JSON pass re-serializes the whole
`.keyman-touch-layout`, so its *formatting* normalizes. Both the vitest twin and the e2e walk
compare the touched file **structurally** and untouched files **byte-exactly** — the same split
the e2e header already documents. Byte-level patch minimization stays out of scope.

---

## D3 — Merge `KeyInspector` and `AssignPanel` into one property panel

**Decision**: Build `KeyPropertyPanel` as the single selected-key surface (FR-018). It absorbs
`KeyInspector`'s display + findings + `sp` control and `AssignPanel`'s commit path. `AssignPanel`
does not survive as a sibling panel; its proposal machinery (rule-path choice, case-triple
option, opaque-fragment acknowledgement) is reached from the panel's **id field** behind a
disclosure, per the spec's own assumption.

**Rationale**: The current mount stacks a read-only `KeyInspector` above an editing
`AssignPanel` (`TouchGallery.tsx:5656–5675`) — complaint #2 ("no fields are editable") is partly
an artifact of the *display* panel being the one that looks like the property panel. Developer
presents one panel; two panels for one key is the divergence. Keeping `AssignPanel`'s
`onCommit` contract (`AssignPanelCommitResult`, already wired to `handleAssignPanelCommit`) means
the Case A / Case B `promotedLayout` split — `setWorkingIR` vs
`setTouchLayoutJson(emitTouchLayout(...))` — is inherited rather than re-derived, which the
e2e header explicitly warns is the part an add/remove commit must not skip.

**Alternatives considered**:

- *Keep both, make `KeyInspector` editable.* Rejected — two panels that both edit the same key
  is worse than the current split, and FR-018 says "one panel".
- *Keep `AssignPanel` as-is and add the missing fields to `KeyInspector`.* Rejected — the
  author would then edit `sp` in one panel and output in another.

**Consequence**: `AssignPanel.tsx` and `KeyInspector.tsx` (828 + 796 lines) fold into the new
panel across US1→US3. US1 wires the *existing* controls (so the defect of record is fixed
without waiting on the merge); the merge lands in US3.

---

## D4 — `EditableKeyFields` gains `hint`, `width`, `pad`, `layer`; the union gains `move`

**Decision**: Extend `EditableKeyFields` (`keyEditOps.ts:87`) with `hint?`, `width?`, `pad?`,
`layer?`, and add a seventh-plus-one `MoveKeyOp` to `KeyEditOperation`.

**Rationale**: All four fields already exist on `TouchKeyIR` (`keyboard-ir.ts:105–137`) —
`layer` is documented there as "the authoritative, editable view the spec-058 key editor reads
and writes", then was left out of the editable set. `keyEditOps.ts:84` says outright "no
`width`/`pad` (geometry stays read-only)". Admitting them is engine-internal: `EditableKeyFields`
is not a `Pattern`/`Criterion` type, so Constitution Article I is not engaged (confirmed —
`grep` finds no `EditableKeyFields` in `packages/contracts/src/schemas.ts`).

`move` cannot be composed from `remove` + `add`: `NewKeySpec = EditableKeyFields` carries no
`sk`/`multitap`/`flick`/`nodeId`/`provenance`, so a re-add discards every sub-key and mints a
fresh `nodeId` — the identity `touchKeyAddress`, the decision trail, and spec 035's Case B
byte-preservation all key off. `MoveKeyOp` therefore carries a **delta**, not a re-spec:
`{ kind: "move", address, direction: "left"|"right"|"up"|"down" }`, applied by splicing the
existing key node.

**Alternatives considered**:

- *`move` as `{ toRow, toIndex }` absolute.* Rejected — an absolute target is stale under
  replay (an earlier op may have changed the row's length), and every affordance the spec
  describes is a single-step nudge. A direction re-resolves against current state, which is
  the contract `resolveKeyAddress` already holds to ("against CURRENT state, never against the
  layout an overlay was authored against", `keyEditOps.ts:283`).
- *Admit a row-level width operation so "Even out row" could work.* Rejected — already
  rejected by [ADR 0002](../../docs/adr/0002-touch-grid-renders-the-last-key-stretched.md) and
  withdrawn by FR-007.

---

## D5 — The stretch is a render rule; `slackPct` becomes a metrics input

**Decision**: Keep `slackPct` on `KeyGridRowViewModel`. Stop rendering it as a hatch. Add a
`KeyGridRowMetrics` shape (`interactiveKeyCount`, `keyWidthTotal`, `padTotal`, `rowTotal`,
`layerMax`, `overMaximumBy?`) and render the last key at `declaredWidth + slackPct`.

**Rationale**: [ADR 0002](../../docs/adr/0002-touch-grid-renders-the-last-key-stretched.md) is
already accepted and settles this: KeymanWeb's `activeLayout.ts:642` computes
`keyPercent = 1 - (totalPercent + padPercent + rightMargin)`, i.e. the last key absorbs the
remainder. The ADR's own consequence list says `slackPct` "stops being a rendering input and
becomes the input to the metrics readout and the crowding check" — so the field stays and its
consumer changes. FR-015's "declared width is a minimum" follows arithmetically: a row can
never exceed the layer maximum, so the remainder is always ≥ the declared width.

**Alternatives considered**: the four in ADR 0002 (keep hatch + real handlers; keep hatch drop
buttons; stretch and show nothing; normalize rows on edit) — all rejected there.

---

## D6 — Edit-time crowding reads Layer C's thresholds; it does not restate them

**Decision**: Add a `TOUCH_KEY_ROW_CROWDED` finding at `scope: "layer"`, severity `warning`,
whose thresholds come from a **single exported table** shared with
`packages/keyboard-lint/src/checks/check-18-3-keys-per-row.ts`.

**Rationale**: `check-18-3` already owns `MAX_KEYS = { phone: 10, tablet: 13 }` with desktop
deliberately unruled, and counts with the canonical `isSpacerKeyClass` predicate (so blank/spacer
keys are excluded — which is exactly the spec's "a row whose every key is blank or spacer never
warns" edge case, already correct). The spec's Assumptions say thresholds "come from the
existing hygiene check rather than being redefined here". `RemoveKeyDialog.tsx:235` already
restates that table once ("restated here as a…"), which is the drift this decision prevents
from happening twice.

**Alternatives considered**:

- *Duplicate the literal in the engine diagnostic.* Rejected — a third copy of a two-row table
  that has already been copied once.
- *Move the check itself into Layer A/B.* Rejected — it is hygiene (Layer C) by
  Constitution Article IV, and FR-014 asks for an edit-time *report*, not a re-layering.

**Threshold direction**: the finding fires at `count > max`, matching `check-18-3`, so a phone
row of 11 warns and a tablet row of 11 does not — the spec's US2 AS3 verbatim.

---

## D7 — `TOUCH_KEY_ROW_CROWDED` and `TOUCH_KEY_KEYCAP_MISMATCH` are the two new codes

**Decision**: Add exactly two members to `TouchKeyFindingCode`, each with a fix descriptor and
a localized copy entry.

**Rationale**: `touch-key-diagnostics.ts:124` states the commitment plainly — "Adding a code
here is a real commitment: T115/T116 require at least one fix descriptor and a localized copy
entry for every member, and `findingCopy.ts` is exhaustive over this union (a `never`-checked
switch)". So the build enforces the copy. Two codes, not more: crowding (FR-014) and
keycap/output mismatch (FR-036). Both are non-blocking — crowding `warning`, mismatch `hint`
(FR-036 says "at hint severity, never blocking").

**Scope choice**: crowding is `scope: "layer"` (its subject is a row, not a key — and
`TouchKeyFindingScope`'s doc already routes non-`key` scopes to the grid's layer-level strip,
which is where a per-row readout lives). Mismatch is `scope: "key"`.

---

## D8 — Keycap relatedness is a new engine module, deliberately display-scoped

**Decision**: New `packages/engine/src/pattern-apply/keycapRelatedness.ts` exporting
`isKeycapRelated(keycap, output, opts)` and `proposeKeycap(output)`. It is the only place
compatibility decomposition (`NFKD`) is used, and its doc says so.

**Rationale**: No such module exists (searched — the `25CC` hits are all consumers, not a
relatedness test). FR-036 requires five relatedness tests to all count as related: localized
digits, case variants, normalization variants, dotted-circle carriers, spacing-accent
stand-ins. The house rule is canonical decomposition only for character *identity*; the spec's
Assumptions carve out that "compatibility decomposition is used only for the display
heuristic". Isolating it in one module with that statement in its docstring is what keeps the
carve-out honest — a reviewer can see the whole blast radius in one file.

`proposeKeycap` handles FR-033: a combining mark gets `U+25CC` + the mark, everything else gets
the character. `NoCaseTripleReason` already carries `titlecase-self-third-form`
(`keyIdMinting.ts:301`), so the titlecase edge case needs a *copy entry*, not new engine logic.

**Alternatives considered**: fold relatedness into `touchKeyDiagnostics.ts`. Rejected — that
file would then be the one place NFKD leaks in, without a docstring boundary saying why.

---

## D9 — FR-029/FR-030's inherited-id path is a new proposer beside `proposeKeyId`

**Decision**: New `proposeTouchKeyId(request)` that tries **inherit → delegate to
`proposeKeyId`**. `KeyIdMintingPath` gains an `"inherited"` member.

**Rationale**: `proposeKeyId` (`keyIdMinting.ts:464`) implements the four minting-policy rows
and nothing else — it has no notion of a physical key or a rule index, and its docstring says
"This module never scans an IR - the caller supplies these facts". FR-029's question ("does the
inherited physical id still produce the intended default *and modifier* outputs?") needs the
`TouchKeyRuleIndex` and the desktop layout, so it belongs one level up, in
`pattern-apply`, wrapping the pure minter rather than reaching inside it. FR-030's "never by
geometric proximity" is satisfied by construction: the query is `producedByKeyId(ruleIndex, id)`,
which has no geometry in it.

**Alternatives considered**: extend `proposeKeyId`'s request with a rule index. Rejected — it
would make a pure, IR-free, heavily-unit-tested function depend on an index, for one of five
callers.

---

## D10 — `AssignLoopShell.rightContent` becomes optional

**Decision**: `rightContent?: ReactNode`; when absent the left pane grows to full width.

**Rationale**: FR-024 requires key mode to drop the live OSK and use the full pane. The shell
hard-codes a "Fixed 45% split — not resizable" with `rightContent: ReactNode` required
(`AssignLoopShell.tsx:53–56`). Two callers (`TouchGallery`, `MechanismGallery`); making the prop
optional is additive and leaves `MechanismGallery` untouched.

**Alternatives considered**: pass `rightContent={null}` and let the 45% pane sit empty.
Rejected — it leaves 55% of the pane blank, which is the opposite of "use the space".

---

## D11 — Layer selector groups via `groupLayerFamilies`; it does not re-derive

**Decision**: The layer selector reads `groupLayerFamilies(platform.layers.map(l => l.id))`
and `classifyPlane`, both already exported from the engine index
(`packages/engine/src/index.ts:360–386`).

**Rationale**: FR-005's "group by family and plane" is exactly `LayerFamilyGrouping`'s shape.
The engine module warns that a second copy of `TOUCH_LAYER_PRECEDENCE_ORDER`'s ordering
convention going stale "is the exact bug [it] itself documents having fixed once already". The
selector's source of layers is the **platform's declared layer list**, not any key's
`nextlayer` — which is what makes FR-004's "including layers no key's next-layer reaches" true
by construction rather than by a special case.

**Rolled-up counts** (FR-005) come from the diagnostics map the grid already builds
(`useTouchKeyDiagnostics`), grouped by the layer segment of each finding's address — no second
validation pass, so Constitution Article IV / decision D3 holds.
