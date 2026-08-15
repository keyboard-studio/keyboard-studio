# WCAG 2.2 A+AA Conformance Tracker

Single source of truth for the studio's compliance percentage (spec [056-ada-accessibility](spec.md), measurement contract in [docs/accessibility.md](../../docs/accessibility.md)).

**Rules.** Status is one of `unknown` / `pass` / `fail` / `n/a`. A row becomes `pass` only with evidence (CI-gating check, committed test file, or dated manual-audit note). A row becomes `n/a` only with a justification naming the condition that would re-apply it. `fail` rows link a filed `bug(studio)` issue. Compliance % = `pass` / (55 − `n/a`), recomputed in the summary line whenever a row changes.

**Summary (2026-08-03, Cycle 1 in progress):** pass 0 · fail 0 · n/a 6 · unknown 49 · **compliance 0 / 49 = 0%** — the two automated gates landed (spec 056 FR-002 jsx-a11y at error severity in `pnpm lint`; FR-003 @axe-core/playwright serious/critical assertions in `boot-smoke.spec.ts` and the four walk specs), and one grep-verified block confirmed the six media-related criteria as `n/a`. **No criterion flipped to `pass`** — the honest reason: axe/lint each cover ≤ ~30–40% of real violations, none of the walk-spec surfaces have been scanned yet in this branch (corpus absent from the dev container), and no manual keyboard or screen-reader pass has run. FR-004's full baseline flip lands when the walk-spec axe runs and the keyboard-only pass execute in the corpus-having lane. Interim partial-evidence notes recorded on rows below.

Criterion links: [How to Meet WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/).

## Perceivable

| SC | Name | Level | Status | Evidence | Notes |
|---|---|---|---|---|---|
| 1.1.1 | Non-text Content | A | unknown | — | Glyph cells/key caps need codepoint-derived names (FR-007) |
| 1.2.1 | Audio-only and Video-only (Prerecorded) | A | n/a | 2026-08-03 grep `packages/studio/src` for `<audio`/`<video`/`new Audio`/`AudioContext`/`<track ` returned zero hits | Re-applies if any media shipped |
| 1.2.2 | Captions (Prerecorded) | A | n/a | 2026-08-03 same grep | Re-applies if any prerecorded video shipped |
| 1.2.3 | Audio Description or Media Alternative (Prerecorded) | A | n/a | 2026-08-03 same grep | Re-applies if any prerecorded video shipped |
| 1.2.4 | Captions (Live) | AA | n/a | 2026-08-03 same grep | Re-applies if any live media surfaced |
| 1.2.5 | Audio Description (Prerecorded) | AA | n/a | 2026-08-03 same grep | Re-applies if any prerecorded video shipped |
| 1.3.1 | Info and Relationships | A | unknown | — | Landmarks, headings, label/field association |
| 1.3.2 | Meaningful Sequence | A | unknown | — | Three-pane layout DOM order vs. visual order |
| 1.3.3 | Sensory Characteristics | A | unknown | — | |
| 1.3.4 | Orientation | AA | unknown | — | |
| 1.3.5 | Identify Input Purpose | AA | unknown | — | Few identity fields; check author-name/e-mail inputs |
| 1.4.1 | Use of Color | A | unknown | — | Partial (2026-08-03): axe `use-of-color` passes on app root + lint demo (`packages/studio/e2e/boot-smoke.spec.ts`), but walk surfaces (survey, galleries, output) are unscanned pending the corpus e2e lane — insufficient to flip |
| 1.4.2 | Audio Control | A | n/a | 2026-08-03 same grep — no audio of any kind | Re-applies if any auto-playing audio surfaced |
| 1.4.3 | Contrast (Minimum) | AA | unknown | 2026-08-15: the OSK iframe's `.kmw-spacebar-caption` sub-finding (excluded via `OSK_IFRAME_DEBT`/local `KNOWN_CONTRAST_DEBT` arrays in every walk spec touching Output/Preview/Trail) is now fixed at the source: [packages/studio/public/osk-frame.html](../../packages/studio/public/osk-frame.html) carries a scoped `#osk-host .kmw-spacebar-caption { color: #000 !important; }` rule, sized (via ID-selector specificity) to beat every selector in KeymanWeb's own vendored `kmwosk.css` regardless of load order or `prefers-color-scheme`. All axe exclusions for it were removed so those specs scan the OSK iframe's contents for real going forward. Still `unknown` overall — a full app-wide 1.4.3 sweep (FR-009 token-level check) has not run; this closes only the one named sub-finding | Token-level check (FR-009); OSK iframe caption sub-finding fixed |
| 1.4.4 | Resize Text | AA | unknown | — | 200% zoom, Cycle 2 |
| 1.4.5 | Images of Text | AA | unknown | — | Rendered glyphs are content, not images of text — record reasoning |
| 1.4.10 | Reflow | AA | unknown | — | Three-pane layout at 320 CSS px, Cycle 2 |
| 1.4.11 | Non-text Contrast | AA | unknown | — | Focus rings, input borders, key-cap outlines |
| 1.4.12 | Text Spacing | AA | unknown | — | Cycle 2 |
| 1.4.13 | Content on Hover or Focus | AA | unknown | — | Tooltips, popovers (dismissable/hoverable/persistent) |

## Operable

| SC | Name | Level | Status | Evidence | Notes |
|---|---|---|---|---|---|
| 2.1.1 | Keyboard | A | unknown | — | Full-walk sweep, Cycle 2 (US1) |
| 2.1.2 | No Keyboard Trap | A | unknown | — | Popovers, modals, character map |
| 2.1.4 | Character Key Shortcuts | A | unknown | — | Audit any single-key shortcuts in editor/preview |
| 2.2.1 | Timing Adjustable | A | unknown | — | Expected trivial pass: no session timeouts in authoring |
| 2.2.2 | Pause, Stop, Hide | A | unknown | — | Check for auto-updating/moving content |
| 2.3.1 | Three Flashes or Below Threshold | A | unknown | — | Expected trivial pass |
| 2.4.1 | Bypass Blocks | A | unknown | — | Skip link / landmark navigation |
| 2.4.2 | Page Titled | A | unknown | — | SPA: title per step/screen |
| 2.4.3 | Focus Order | A | unknown | — | |
| 2.4.4 | Link Purpose (In Context) | A | unknown | — | |
| 2.4.5 | Multiple Ways | AA | unknown | — | May be n/a-adjacent for a linear wizard — record reasoning honestly |
| 2.4.6 | Headings and Labels | AA | unknown | — | |
| 2.4.7 | Focus Visible | AA | unknown | — | Cycle 2 sweep |
| 2.4.11 | Focus Not Obscured (Minimum) | AA | unknown | — | Sticky panes/preview overlaying focused element |
| 2.5.1 | Pointer Gestures | A | unknown | — | |
| 2.5.2 | Pointer Cancellation | A | unknown | — | |
| 2.5.3 | Label in Name | A | unknown | — | Visible label text contained in accessible name |
| 2.5.4 | Motion Actuation | A | unknown | — | Expected trivial pass |
| 2.5.7 | Dragging Movements | AA | unknown | — | Key-placement/drag interactions need single-pointer alternative; Cycle 3 |
| 2.5.8 | Target Size (Minimum) | AA | unknown | — | Character-map cells, zoom control; Cycle 3 |

## Understandable

| SC | Name | Level | Status | Evidence | Notes |
|---|---|---|---|---|---|
| 3.1.1 | Language of Page | A | unknown | — | `lang` on html; lingui locale switch must update it |
| 3.1.2 | Language of Parts | AA | unknown | — | Sample text, autonyms need `lang`/`dir`; Cycle 2 |
| 3.2.1 | On Focus | A | unknown | — | |
| 3.2.2 | On Input | A | unknown | — | Survey auto-advance behavior needs checking |
| 3.2.3 | Consistent Navigation | AA | unknown | — | Cycle 3 |
| 3.2.4 | Consistent Identification | AA | unknown | — | Cycle 3 |
| 3.2.6 | Consistent Help | A | unknown | — | Cycle 3 |
| 3.3.1 | Error Identification | A | unknown | — | Validator diagnostics surfaced in text, Cycle 2 |
| 3.3.2 | Labels or Instructions | A | unknown | — | |
| 3.3.3 | Error Suggestion | AA | unknown | — | Diagnostics already carry fix hints — verify exposure; Cycle 2 |
| 3.3.4 | Error Prevention (Legal, Financial, Data) | AA | unknown | — | Output/PR submission review step; Cycle 3 |
| 3.3.7 | Redundant Entry | A | unknown | — | Survey re-asks vs. working-copy prefill; Cycle 3 |
| 3.3.8 | Accessible Authentication (Minimum) | AA | unknown | — | GitHub OAuth path (our side only); Cycle 3 |

## Robust

| SC | Name | Level | Status | Evidence | Notes |
|---|---|---|---|---|---|
| 4.1.2 | Name, Role, Value | A | unknown | — | Custom widgets (FR-006); axe covers subset, manual completes |
| 4.1.3 | Status Messages | AA | unknown | — | aria-live for diagnostics/autosave (FR-008, D3 constraint) |

*(4.1.1 Parsing was removed in WCAG 2.2 and is intentionally absent.)*
