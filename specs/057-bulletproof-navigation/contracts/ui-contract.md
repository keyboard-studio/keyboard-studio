# Contract: UI surface — message ids, accessible names, test identifiers

The author-facing and test-facing identifiers this feature adds, retires, or must not touch. Filenames and helper names the spec pins are reproduced **exactly** as it wrote them.

---

## 1. Message ids

House rule: an id is a permanent handle. A *meaning* change takes a new id; a *wording* change keeps the old one ([046 catalog-format](../../046-i18n-localization/contracts/catalog-format.md)).

### Retired (FR-020, FR-073)

| Id | Current `en` | Current `fr` | Note |
|---|---|---|---|
| `nav.preview` | `"Preview"` | `""` (untranslated) | Retired, not reused. `fr` is empty, so no translation is lost. |
| `preview.heading` | `"Live preview"` | `"Aperçu en direct"` | Retired **for this tab**. The `fr` value is a real translation and will be lost — the new id starts untranslated, which is correct: it is a different string about a different thing. |
| `preview.pane.label` | `"Preview pane"` | `"Volet d'aperçu"` | Same treatment. |

Target-locale catalogs MUST NOT be left claiming a translation for a retired id (FR-073).

### Added

| Id | `en` message | Surface |
|---|---|---|
| `nav.compare` | `Compare` | Nav tab label (FR-020) |
| `compare.heading` | *(a heading naming the inspected keyboard)* | Compare pane heading |
| `compare.pane.label` | *(pane aria-label)* | Compare pane `<section>` |
| `footer.ariaLabel` | *(landmark name)* | Footer landmark (FR-048). The footer **is** the breadcrumb (Q7) — there is no `breadcrumb.*` id set. |
| `footer.project.label` | *(project-name label)* | FR-041 |
| `footer.dot.completed.ariaLabel` | *(interpolates the question label)* | FR-043, FR-044 |
| `footer.dot.current.ariaLabel` | *(interpolates the current question's label)* | FR-060, FR-061 — must read as "you are here", not as completed progress |
| `footer.dot.upcoming.ariaLabel` | *(interpolates the stage label)* | FR-043 — must announce "not yet reached" |
| `footer.overflow.label` | *(overflow affordance)* | FR-047 |
| `trail.jump.label` | *(deep-link affordance)* | FR-030 |
| `trail.jump.unreachable.*` | one per `UnreachableReason` | FR-035 and FR-045 — a reason, not a dead link. Shared by the trail and the footer's upcoming dots. |

### MUST NOT be renamed (FR-026, explicit)

`usePreviewArtifact` (the hook, and its role on Output), `basePreviewStatusStore`, the Studio tab's live OSK preview, `editor.assignLoop.preview.heading`, and the `preview` **route token** (see [location-grammar.md](location-grammar.md#1-hash-grammar)). These are unrelated uses of the word.

---

## 2. Accessibility contract

Per [docs/accessibility.md](../../../docs/accessibility.md) house rules; the footer dots are the highest-risk surface in this spec.

| Requirement | Contract |
|---|---|
| FR-043 | Each dot is a real `<button type="button">`. Not a `div`, not a decorative `span` with a `title`. |
| FR-043, FR-044 | Each dot's accessible name is its question's or stage's label in the active locale, resolved through `createLookupQuestionLabel` for questions — the *same* label hover reveals. Available without hovering. |
| FR-043 | An `upcoming` dot's name announces that it is **not yet reached**, so it is not mistaken for completed progress. |
| FR-044 | Hover reveals the label as a shortcut, not as the mechanism. |
| US4 sc. 3 | Every dot reachable by `Tab`; activated by both `Enter` and `Space` (native `button` semantics give both). |
| FR-046 | **No class or state conveyed by colour alone.** Question dots and stage dots differ by **size or shape as well as colour**; the `current` marker carries a non-colour cue too. Non-text contrast ≥ 3:1; focus indicator visible on each dot. |
| FR-047 | The row includes the journey ahead, so it is longer than a completed-only row. Overflow degrades legibly — no silent truncation, no horizontal overflow of the page body, every mark reachable, and the **current position stays visible without scrolling**. |
| FR-061 | The `current` marker is not a jump target to itself. |
| FR-045 | An `upcoming` dot behind a gate is **refused with a reason** (`beyond-gate`), never a silent forward skip past a lock. |
| FR-048 | All footer strings, including accessible names and tooltips, go through the catalog. |
| SC-010 | `expectNoSeriousAxeViolations` reports no new violations on any tab, footer included. |

The footer is a `<footer>` landmark with `footer.ariaLabel`. Note `<footer>` currently appears once in the codebase inside an unrelated panel — the new one is the first top-level landmark of its kind.

---

## 3. E2E identifiers — pinned verbatim by the spec

### New specs (spec "Required new specs")

| Path | Story | Gating |
|---|---|---|
| `e2e/tab-roundtrip.spec.ts` | US1 | **yes** (FR-080) |
| `e2e/compare-isolation.spec.ts` | US2 | **yes** (FR-080) |
| `e2e/decision-deeplink.spec.ts` | US3 | no |
| `e2e/footer-progress.spec.ts` | US4 | no |

### New shared helper (FR-082)

`switchTab` — added to `e2e/helpers/surveyFlow.ts`. The tab switches become this one helper rather than inline hash assignments per spec. Existing helpers to reuse unchanged: `seedReturningVisitor`, `driveIdentityLite`, `pickBaseKeyboard`, `chooseAdaptTrack`.

### Specs that must be extended, not left alone

`browser-back.spec.ts` (SC-014 — a tab round trip inserted mid-walk; its browser-Forward-is-a-no-op assertion stays as-is per FR-016), `copy-edit.spec.ts`, `touch-derivation-us1.spec.ts`, `touch-derivation-us2.spec.ts`, `locale-switch.spec.ts` (the Compare label in a non-English locale, FR-020/SC-006).

### Harness rules (unchanged, restated because they are easy to break)

- Specs import from `"playwright/test"`. **Do not** add `@playwright/test` as a second runner package.
- No spec added by this feature may be committed `.skip`-ped (FR-083).
- E2E stays out of the unit CI lanes (FR-081); a green run is a named prerequisite, produced deliberately and reported with its output.
- Every touched spec calls `expectNoSeriousAxeViolations` on the screens it visits.

---

## 4. Existing tests that encode the old contract

Rewritten to encode the new contract, **not** deleted (FR-072):

- `StudioShell.test.tsx` — the route/landing tests.
- `CharactersStep.test.tsx` — the substage test.
- `useSurveyBrowserHistorySync.test.ts` — the tag/prediction behaviour under a *preserved* position (FR-017).
- `PreviewShell.test.tsx` and any preview-screen test asserting today's shared-store behaviour.

The e2e walk helpers are updated in the same change so a tab switch mid-walk is exercised at least once end to end (FR-072).
