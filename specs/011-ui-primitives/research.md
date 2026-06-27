# Phase 0 Research: `ui/` Primitive Library

Grounded in a read-only audit of the six affected files plus `lib/galleryTheme.ts` and the Form-4 galleries. All decisions serve the hard constraint **FR-005: zero rendered diff**.

## Decision 1 — Primitive set (resolves FR-007)

**Decision**: The library exposes the baseline seven plus seven audit-surfaced additions:

| Primitive | Source patterns (audit) | Files using |
|---|---|---|
| `Button` | primary CTA, back, submit; enabled/disabled variants | 5/6 |
| `TextField` | `<input type=text>` + `INPUT_STYLE`; error-border variant | 4/6 |
| `Textarea` | `<textarea>` + `INPUT_STYLE`, resize:vertical | QuestionField |
| `Autocomplete` | `<input list>` + `<datalist>` composite | QuestionField |
| `Dropdown` | `<select>` + options | QuestionField |
| `RadioGroup` | multi-option **and** bool(yes/no) modes | QuestionField |
| `MultiSelect` | checkbox-row group | QuestionField |
| `Checkbox` | standalone checkbox | QuestionField |
| `Label` | `LABEL_STYLE`/`OPTION_LABEL_STYLE` + required marker | 4/6 |
| `ErrorText` | `role=alert`/`status`, error/warning/hint colors | 5/6 |
| `Notice` | read-only info/warn/error banner | QuestionField + |
| `Card` | `CARD_BASE`/`CARD_SELECTED` clickable container | 2/6 |
| `Field` | label + control + help/error row wrapper | 3/6 (implicit) |
| `Badge` | small status tag | BaseResolution + BaseKeyboardPicker |

**Rationale**: Each is duplicated in ≥1 file with a stable shape; `Label`/`ErrorText`/`Button`/`TextField`/`Field` are the high-reuse wins (4–5 files). `RadioGroup` absorbs the bool(yes/no) pair as a `mode` rather than a separate primitive.

**Kept as local one-offs, NOT primitives** (single-use, project-specific): the slug-validation display in `ProjectNameStep`, the success-green submit color in `ScaffoldForm`. These stay inline (documented), per the spec's "control not covered by the kit" edge case.

**Alternatives considered**: (a) Exactly the seven — rejected: leaves `Label`/`ErrorText`/`Textarea`/`Checkbox` duplicated, defeating the dedup goal. (b) A maximal kit including the one-offs — rejected: a single-use primitive adds API surface without removing duplication.

## Decision 2 — Theme token mechanism

**Context**: The codebase has **two** theming styles. `BaseResolution.tsx` consumes CSS custom properties (`var(--app-accent)`, `var(--app-font)`, …) defined in `index.css`. The other five files + `galleryTheme.ts` hardcode hex (`#0d1117`, `#30363d`, …). There is **measurable drift** between them: e.g. borders `#283040` (ScaffoldForm/TrackOneIdentityPanel) vs `#30363d` (`BORDER`); labels `#9aa7b8` vs `TEXT_DIM #8b949e`.

**Decision**: `ui/theme.ts` is the single token module and **primitives consume CSS custom properties** (the `var(--app-*)` family already proven by `BaseResolution` and defined in `index.css`). `ui/theme.ts` exports **typed accessors/names** for those CSS vars, plus the legacy hex constants (`BG_PAGE`…`BLUE_ACTION`) re-exported for `galleryTheme` compatibility.

**Zero-diff rule for the migration**: theme unification collapses a call site's value to a shared token **only when the value is provably identical** to that token. Where a call site's value **diverges** (the `#283040`/`#9aa7b8`/`#7a2a2a` cases), the exact value is **preserved** — passed as an explicit prop/override or kept as a distinct named token. **No color is normalized in P1**, because changing a rendered hex would violate FR-005.

**Drift is flagged, not fixed**: the divergent borders/labels look like accidental drift. They are recorded in `data-model.md` as a **follow-up normalization candidate** (separate, opt-in, post-P1) — never silently changed here.

**Rationale**: CSS vars are the maintainable single source and let `BaseResolution` refactor onto primitives with literally the same token (guaranteed zero-diff). Forcing the hardcoded files onto canonical tokens would change pixels; preserving their exact values keeps the structural dedup win without the visual risk.

**Alternatives considered**: (a) Exported TS hex constants everywhere (drop CSS vars) — rejected: would change `BaseResolution`'s rendering and abandon the better pattern. (b) Normalize all colors to one token set now — rejected: violates FR-005 (changes pixels). (c) Leave theme untouched, primitives take raw style props — rejected: fails FR-003 (no single token source).

## Decision 3 — `lib/galleryTheme.ts` fold strategy

**Decision**: Move the 8 token values into `ui/theme.ts`; reduce `lib/galleryTheme.ts` to a **thin re-export** (`export { BG_PAGE, … } from "../ui/theme.ts"`). The Form-4 galleries (`MechanismGallery`, `TouchGallery`, etc.) keep their existing `galleryTheme` imports and are **not** refactored.

**Rationale**: FR-003 wants a single token source; the shim gives that (one definition, in `ui/theme.ts`) without dragging the galleries into P1 (they are P4 / `editors/`). FR-003's "no second definition" is satisfied — the shim re-exports, it does not redefine.

**Alternatives considered**: Update all gallery imports to `ui/theme` now — rejected: expands P1 into P4-owned files for no functional gain. Delete `galleryTheme.ts` — rejected: breaks gallery imports; deletion belongs with the P4 gallery move.

## Decision 4 — Dependency-cruiser leaf rule (FR-004)

**Context**: `.dependency-cruiser.cjs` today has **only cross-package** rules; no intra-`studio/src` layering exists. This is the first.

**Decision**: Add a `forbidden` rule:

```js
{
  name: 'ui-is-a-leaf',
  comment: 'studio ui/ primitives are a dependency leaf: no imports from survey/, steps/, or stores/ (feature 011).',
  severity: 'error',
  from: { path: '^packages/studio/src/ui/' },
  to:   { path: '^packages/studio/src/(survey|steps|stores)/' },
}
```

`.test.tsx` files are already excluded by the global `exclude`. `ui/ → lib/` is **not** forbidden (theme/helpers may live in `lib/`); only `survey|steps|stores` are off-limits, matching the spec.

**Rationale**: Matches FR-004 verbatim and the repo's "fitness function" convention. Proven by a probe import in the quickstart (SC-003).

**Alternatives considered**: An `allowed`-style allowlist for all of `studio/src` — rejected: far larger change than P1 needs; the single forbidden edge is the minimal honest enforcement.

## Decision 5 — Zero-diff verification strategy (FR-005 / SC-002)

**Decision**: Three layers, no new tooling:
1. **Existing tests stay green unchanged.** `BaseResolution.test.tsx`, `TrackOneIdentityPanel.test.tsx`, `StudioShell.test.tsx`, and `QuestionField`-driven survey tests run as-is. Any required edit to those tests is treated as a regression signal, not an accommodation (SC-002).
2. **Per-primitive tests** (new) assert each primitive's render output + behavior (Testing Library), so the primitive is correct in isolation before call sites adopt it.
3. **Refactor-equivalence**: for each of the 6 call sites, the refactor commit changes imports/markup but is reviewed against the rendered DOM/attributes the old inline control produced (same element, same `role`, same resolved style values).

**No screenshot/visual-regression harness** is added (none exists; Playwright is `.skip`-ped per CLAUDE.md). DOM-level equivalence + unchanged tests are the P1 gate.

**Rationale**: Keeps P1 within existing tooling; the zero-diff claim is enforced by "tests didn't need editing" + DOM equivalence review rather than a new pixel-diff dependency.

## Open questions

None blocking. The one judgment call surfaced for visibility (not a blocker): whether to fold the divergent `#283040`/`#9aa7b8` values as distinct tokens or schedule the normalization follow-up immediately — defaulted to **preserve-and-flag** (Decision 2), revisited post-P1.
