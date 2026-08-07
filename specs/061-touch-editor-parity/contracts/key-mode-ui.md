# Contract: the key-mode UI surface

**Feature**: 061-touch-editor-parity · consumers: `TouchGallery.test.tsx` (vitest — the repeatable
gate, PR lane) and `e2e/touch-key-add-remove.spec.ts` (Playwright — exploration, run ad hoc from
the CLI). Both code against the identifiers below, so a rename breaks both.

This is the surface a test codes against. Every identifier here is either **already in the
codebase** (kept verbatim — renaming one breaks a passing test) or **pinned by the skipped e2e
walk's un-skip recipe** (which must pass *unmodified*, FR-008). Nothing in this file may be
recased, pluralized or "improved".

---

## 1. Prop contract — required, not optional (FR-001, FR-003)

Every callback below is a **required** prop. There is no `?`, no `?.` call site, and no
`=== undefined` render guard. A mount that omits one fails `tsc`.

### `KeyGridProps`

| Prop | Signature |
|---|---|
| `onSelectCell` | `(cell: KeyGridCellViewModel) => void` |
| `onKeyDown` | `KeyboardEventHandler<HTMLDivElement>` |
| `onPlatformChange` | `(platformId: string) => void` |
| `onAddKeyAfter` | `(cell: KeyGridCellViewModel) => void` |
| `onOpenCommandMenu` | `(cell: KeyGridCellViewModel, anchor: KeyGridCommandMenuAnchor) => void` |
| `onFollowNextLayer` | `(cell: KeyGridCellViewModel, nextlayer: string) => void` |

**Removed**: `onFillRow`, `onEvenOutRow` (FR-007, ADR 0002). Their buttons and test ids go with
them — see §5.

`platforms` / `activePlatformId` / `label` / `provenance` stay **optional**: they are data, not
affordances. A layout with fewer than two platforms renders no tablist, which is correct — the
selector must not imply choices that do not exist.

### `KeyPropertyPanelProps` (US3; `KeyInspectorProps` until then)

| Prop | Signature |
|---|---|
| `onFieldChange` | `(field: keyof EditableKeyFields, value: string \| number \| undefined) => void` |
| `onSpChange` | `(sp: TouchKeySpValue) => void` |
| `onApplyFix` | `(fix: TouchKeyFix, finding: TouchKeyFinding) => void` |
| `onDelete` | `() => void` |
| `onMove` | `(direction: "left" \| "right" \| "up" \| "down") => void` |
| `onEscape` | `() => void` |

### `KeyGridCellProps`

`onSelectCell`, `onAddKeyAfter`, `onOpenCommandMenu` required. `onFollowNextLayer` required — the
**double-click gesture** is conditional on `cell.nextlayer` being present, not on the handler
being present.

### The absence rule (FR-003)

An affordance that cannot act is **absent from the DOM** — never `disabled`, never inert. The
three surfaces must now agree; today they do not (`KeyGridCell` hides, `KeyGrid` renders a dead
button, `KeyInspector` renders a reverting radio).

| Situation | Rendering |
|---|---|
| move-left on `keyIndex === 0` | absent |
| move-right on the last key of a row | absent |
| move-up on row 0 | absent |
| move-down on the last row | absent |
| a finding with no fix descriptor | the finding renders; no fix button |
| fewer than 2 platforms | no tablist |
| exactly 1 layer | the selector renders as a **label**, not a control |

The one sanctioned `disabled` is `assign-panel-confirm` while its field is empty or invalid —
a form-validity state, not a missing capability.

---

## 2. Test ids — existing, kept verbatim

Present in the codebase today. These are load-bearing for suites that pass now.

**Grid**: `key-grid` · `key-grid-live-region` · `key-grid-platform-tabs` ·
`key-grid-platform-tab-${platformId}` · `key-grid-provenance` · `key-grid-row-actions-${rowIndex}`
· `key-grid-pad-${address}`

**Cells**: `key-grid-cell-${address}` · `key-grid-cell-${address}-provenance` ·
`key-grid-cell-${address}-add-wedge` · `key-grid-cell-${address}-menu-wedge` ·
`key-grid-cell-${address}-finding-badge`

**Command menu**: `key-grid-command-menu` · `key-grid-command-${commandId}`

**Inspector** (folded into the property panel at US3; ids migrate per §4):
`key-inspector` · `key-inspector-empty` · `key-inspector-header` · `key-inspector-id` ·
`key-inspector-sp` · `key-inspector-sends` · `key-inspector-sends-override-note` ·
`key-inspector-produces` · `key-inspector-annotations` · `key-inspector-provenance` ·
`key-inspector-findings` · `key-inspector-finding-${i}` · `key-inspector-finding-${i}-severity` ·
`key-inspector-finding-${i}-title`

**Assign panel**: `assign-panel` · `assign-panel-empty` · `assign-panel-target` ·
`assign-panel-confirm` · `assign-panel-proposal` · `assign-panel-field-preview` ·
`assign-panel-field-error` · `assign-panel-rule-lines` · `assign-panel-guard-pair` ·
`assign-panel-case-triple-checkbox` · `assign-panel-case-triple-rules` ·
`assign-panel-case-triple-unavailable` · `assign-panel-no-case-triple-reason` ·
`assign-panel-no-proposal` · `assign-panel-opaque-warning` · `assign-panel-opaque-acknowledge`

**Dialogs**: `remove-key-dialog` (+ `-target`, `-shape`, `-collateral`, `-keep-row`,
`-keep-row-checkbox`, `-confirm`, `-cancel`, `-proposed-suppress`) · `rename-dialog` (+ `-target`,
`-field`, `-field-error`, `-impact`, `-orphan`, `-orphan-generated`, `-orphan-handwritten`,
`-orphan-remove-checkbox`, `-unchanged`, `-confirm`, `-cancel`) · `family-apply-dialog` (+
`-heading`, `-members`, `-member-${layerId}`, `-checkbox-${layerId}`, `-content-${layerId}`,
`-confirm`, `-cancel`) · `find-panel` (+ `-results`, `-result-${i}`)

**Stage chrome**: `touch-mode-tabs` · `touch-mode-tab-key` · `touch-key-mode-back` ·
`touch-key-mode-continue` · `touch-continue` · `touch-undo-button` ·
`key-edit-invalidation-warnings` (+ `-undo`, `-restore-note`, `-blocks-continue`) ·
`key-edit-rejections` · `touch-orphaned-key-edits-notice`

**The character field is addressed by label, not test id**: `getByLabel("Character or code point")`.
Its accessible name is part of this contract.

---

## 3. Test ids — pinned by the un-skip recipe (US1, FR-008)

These two do not exist yet and **must be created with exactly these strings**. The e2e walk
declares them as constants at `touch-key-add-remove.spec.ts:99–100` and must pass unmodified.

| Id | Attaches to |
|---|---|
| `touch-key-mode-add-key` | the add-key trigger acting on the currently selected cell |
| `touch-key-mode-remove-key` | the remove trigger that opens `remove-key-dialog` |

The walk drives them as: `Tab` → focus a `[role="gridcell"]` → click `touch-key-mode-add-key` →
fill `Character or code point` → click `assign-panel-confirm` → `ArrowRight` → click
`touch-key-mode-remove-key` → `remove-key-dialog-proposed-suppress` → `remove-key-dialog-confirm`.
The add trigger must therefore act on the **focused cell** without requiring a prior click, and
the remove trigger must be reachable while a cell holds focus.

## 4. Test ids — new in this feature

| Id | Requirement | Slice |
|---|---|---|
| `key-layer-selector` | FR-004 | US1 |
| `key-layer-selector-option-${layerId}` | FR-004 | US1 |
| `key-layer-selector-group-${plane}` | FR-005 | US1 |
| `key-layer-selector-count-${layerId}` | FR-005 | US1 |
| `key-grid-row-metrics-${rowIndex}` | FR-013 | US2 |
| `key-grid-row-crowded-${rowIndex}` | FR-014 | US2 |
| `key-grid-cell-${address}-id` | FR-023 (key id on the keycap) | US3 |
| `key-property-panel` | FR-018 | US3 |
| `key-property-panel-field-${field}` | FR-018 — `field` ∈ `text`,`hint`,`id`,`sp`,`layer`,`nextlayer`,`width`,`pad` | US3 |
| `key-property-panel-width-minimum-note` | FR-015 | US3 |
| `key-property-panel-delete` | FR-019 | US3 |
| `key-property-panel-move-${direction}` | FR-020 — `direction` ∈ `left`,`right`,`up`,`down` | US3 |
| `key-property-panel-id-alternatives` | the proposal disclosure | US5 |
| `gesture-panel` | FR-026 | US4 |
| `gesture-panel-longpress` / `-multitap` / `-flick` | FR-026 | US4 |
| `gesture-panel-flick-${direction}` | FR-026 — `direction` ∈ `n`,`ne`,`e`,`se`,`s`,`sw`,`w`,`nw` | US4 |
| `gesture-panel-add-${kind}` | FR-026 — `kind` ∈ `longpress`,`multitap`,`flick` | US4 |
| `gesture-panel-subkey-panel` | FR-027 | US4 |
| `key-property-panel-no-proposal-reason` | FR-032 | US5 |

At US3 the `key-inspector-*` ids **migrate** onto the merged panel rather than disappearing: the
panel keeps `key-inspector-empty`, `key-inspector-findings`, `key-inspector-finding-${i}*`,
`key-inspector-sends`, `key-inspector-produces`, `key-inspector-annotations`,
`key-inspector-provenance` so the existing assertions keep meaning what they meant. Field editing
arrives under the new `key-property-panel-field-${field}` ids.

## 5. Test ids removed

| Id | Why |
|---|---|
| `key-grid-fill-row-${rowIndex}` | FR-007 — the control is withdrawn |
| `key-grid-even-out-row-${rowIndex}` | FR-007 — the control is withdrawn |
| `key-grid-row-slack-${rowIndex}` | FR-012 — the hatch is withdrawn; replaced by `key-grid-row-metrics-${rowIndex}` |

`key-grid-row-actions-${rowIndex}` **stays**: it is the row-actions container whose accessibility
fix spec 058 SC-009 landed and FR-038 forbids regressing. It hosts the metrics readout instead of
the two removed buttons.

---

## 6. Roles and accessibility (FR-038)

Non-negotiable, and asserted by the existing a11y suite:

- The grid stays a conformant ARIA grid: `role="grid"` → `role="row"` → `role="gridcell"`, with a
  roving tabindex (`useGridNav`) and one tab stop into the grid.
- `key-grid-live-region` stays the single `aria-live="polite"` announcer for grid-level changes,
  riding the existing debounce cycle (FR-039). No new live region.
- The layer selector is a **tablist** (`role="tablist"`/`role="tab"`) when it has ≥2 options,
  matching `key-grid-platform-tabs` — one composite-widget pattern on this surface, not two.
- Every keycap's accessible name is codepoint-derived per
  [docs/accessibility.md](../../../docs/accessibility.md); FR-023's visible key id is **additional**
  to that name, not a replacement for it.
- Every editing path is completable by keyboard alone (SC-004). Move is keyboard-reachable through
  the panel's buttons; the grid's own arrow keys stay **navigation**, never movement — an author
  arrowing across the board must not silently reorder it.

## 7. Layout (FR-024)

`AssignLoopShell.rightContent` becomes optional. In **key** mode `TouchGallery` passes no
`rightContent`, and the left pane occupies the full width. In **character** mode it passes
`GalleryPreviewPane` exactly as today, with `editor.assignLoop.touch.previewHeading` unchanged.

The key-mode-only heading id `editor.assignLoop.touch.keyMode.previewHeading` ("Live keyboard — for
testing") becomes unreachable and is **removed** from the catalog — an id whose surface is gone is
not a rename, so no translation is orphaned in the sense the i18n rules protect against.
