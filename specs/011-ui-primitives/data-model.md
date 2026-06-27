# Phase 1 Data Model: Primitive Surface & Theme Tokens

P1 introduces no domain data and no contract types. The "model" here is the **public surface** of the `ui/` library — the primitives, their variant axes, and the theme tokens — which later phases (P2/P4) build against. Prop shapes are the contract; full signatures live in [contracts/ui-primitives.contract.md](contracts/ui-primitives.contract.md).

## Primitives (entities)

Each primitive: a React component with a stable public name, exported from `ui/index.ts`, themed via CSS custom properties (Decision 2), behavior-identical to the inline control it replaces.

| Primitive | Variant / mode axis | Replaces (inline today) |
|---|---|---|
| `Button` | `variant: primary \| secondary \| back`; `disabled` | `NEXT_BTN_ENABLED/DISABLED`, `BACK_BTN`, submit buttons |
| `Card` | `selected: boolean`; clickable | `CARD_BASE`/`CARD_SELECTED` |
| `TextField` | `error: boolean`; `mono?: boolean` | `<input type=text>` + `INPUT_STYLE` |
| `Textarea` | `error: boolean`; `rows` | `<textarea>` + `INPUT_STYLE` |
| `Autocomplete` | `options: string[]` | `<input list>` + `<datalist>` |
| `Dropdown` | `options: {value,label}[]` | `<select>` |
| `RadioGroup` | `mode: list \| bool`; `accent?` | `RadioField` + `BoolField` |
| `MultiSelect` | `options`, `selected` | `MultiSelectField` checkbox rows |
| `Checkbox` | `checked` | standalone `<input type=checkbox>` |
| `Label` | `required?: boolean` | `LABEL_STYLE`/`OPTION_LABEL_STYLE` + required marker |
| `ErrorText` | `tone: error \| warning \| hint` (→ `role=alert`/`status`) | conditional error/warning/hint `<div>`s |
| `Notice` | `tone: info \| warn \| error` | `NoticeField` banner |
| `Field` | composes `Label` + control slot + `ErrorText`/help | implicit field-row wrappers |
| `Badge` | `tone` | status tag (`REASON_COLOR`, `ImportBadge`) |

### Behavioral rules (from requirements)

- **Zero-diff (FR-005)**: a primitive must render the same element, `role`, and resolved style values as the inline control it replaces. Divergent call-site colors are passed through, not normalized (Decision 2).
- **`RadioGroup` bool mode** preserves the existing green accent (`#3fb950`) for yes/no; list mode uses the standard accent.
- **`ErrorText` tone → ARIA**: `error`/`warning` → `role=alert`; `hint` → `role=status` (mirrors current usage).
- **Required marker** lives in `Label` (`required` prop renders the existing `#e74c3c` asterisk).

## Theme token model (`ui/theme.ts`)

Single token source. Canonical tokens map to the CSS custom properties already defined in `index.css` and consumed by `BaseResolution`.

| Token (semantic) | CSS var | Hex (current) | Legacy `galleryTheme` name |
|---|---|---|---|
| page background | `--app-bg` / `BG_PAGE` | `#0d1117` | `BG_PAGE` |
| surface | `--app-surface` | `#161b22` | `BG_CARD` |
| border | `--app-border` | `#30363d` | `BORDER` |
| accent | `--app-accent` | `#6ea8fe` | `ACCENT` |
| text dim | `--app-text-muted` | `#8b949e` | `TEXT_DIM` |
| text main | `--app-text` | `#e6edf3` | `TEXT_MAIN` |
| action blue | — | `#1f6feb` | `BLUE_ACTION` |
| font | `--app-font` | system-ui stack | `FONT` |

`ui/theme.ts` re-exports the legacy hex names so `lib/galleryTheme.ts` can become a shim (Decision 3).

### Divergent values — PRESERVED, flagged for post-P1 normalization

These are kept exactly (zero-diff) and recorded as drift candidates; **not changed in P1**:

| Value | Where | Canonical it's near | Action in P1 |
|---|---|---|---|
| `#283040` border | ScaffoldForm, TrackOneIdentityPanel | `#30363d` border | preserve exact |
| `#9aa7b8` label | ScaffoldForm, TrackOneIdentityPanel | `#8b949e` text-dim | preserve exact |
| `#7a2a2a` error border | ScaffoldForm, TrackOneIdentityPanel | (none) | preserve as `error-border` token |
| `#f0a0a0` error text | ScaffoldForm, TrackOneIdentityPanel | (none) | token: `error-text` |
| `#f85149` slug error | ProjectNameStep | (none) | local one-off |
| `#238636` success | ScaffoldForm | (none) | local one-off |
| `#d29922` warning | TrackOneIdentityPanel | (none) | token: `warning` |
| `#7ee787` green / `--sil-green` | TrackOneIdentityPanel, BaseResolution | (none) | token: `success-accent` |

## Non-goals (model boundary)

- No `IRPath`, no `inputs`/`writes` — that is P2's contract change.
- No `steps/` types, no manifest entries — P4.
- No change to `KeyboardIR`, `Pattern`, or any `packages/contracts` type.
