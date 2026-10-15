# Keyboard documentation templates and version policy (design)

**Status:** Design approved in brainstorming, 2026-10-14. Input to `/speckit-specify` for spec 095.
**Owners:** Engine (slot model, renderer, version resolution, studio wiring); Content (template
wording and section order, spec §12).
**Builds on:** [spec 061](../../specs/061-help-docs-generation/AS-BUILT.md) (help docs generation),
[spec 080](../../specs/080-documentation-completeness/AS-BUILT.md) (documentation completeness),
[spec 094](../../specs/094-test-and-revise/AS-BUILT.md) (test builds, `output-version.ts`),
[docs/criteria.md](../criteria.md) §2 (version bumping), §3 (HISTORY), §5 (README), §11 (help).

## Problem

1. **Version.** A Track 1 keyboard ships at the *copied keyboard's* version, unchanged
   (`resolvePublishVersion`, mode `new-from-base`; preserved deliberately in
   `projectWorkingCopyVfs.ts` so the `.kmn`, `.kps` and zip filename agree). Copying a v3.2
   keyboard into a brand-new keyboard therefore ships a "3.2" with no 1.0 before it. The studio
   also has no notion of whether the author is making a new keyboard *from* another one or a
   *variant of* it, so it cannot version or describe the two differently.
2. **Docs say nothing about how the keyboard works.** The six generated documentation members
   carry the author's Phase F prose plus layout charts. Nothing generated explains which
   keystrokes produce which characters, which mechanisms the keyboard uses, or what is on the
   touch layout, although every fact is in the working copy.
3. **No form.** Each file's structure is hand-assembled string code in `helpDocsRender.ts`, so
   wording and section order can only change through an engine code change.

## Decisions

| # | Decision | Chosen |
| --- | --- | --- |
| Q1 | What "adapt" means | A **new keyboard (new ID)** made as a variant of someone else's keyboard. Updating one's own published keyboard stays Track 2. |
| Q2 | Adapt version | **Bump the source keyboard's version** (2.3 → 2.4). |
| Q3 | How copy vs adapt is known | **Author chooses up front**, recorded as a decision, changeable later. |
| Q4 | "How it works" content | Typing guide, mechanism summary, layout charts (existing), touch notes, character inventory. *Not* a changes-from-source section (HISTORY covers it). |
| Q5 | What "form" means | **Fill-in template per file** with named slots, filled automatically; author edits only free-text answers. |
| Q6 | Architecture | **Templates as data, slot values computed in TS** (approach 1). |
| Q7a | Adapt inherits source prose | **Yes for Adapt, no for Copy.** |
| Q7b | Drafts saved before this change | Default to **Copy**; the question is asked on next visit to the step. |
| Q9 | Inherited docs already have a typing table | **Suppress the generated typing guide.** |
| Q10 | Adapt from a source with an invalid version | **Fall back to `1.0` and notify the author** (non-blocking notice). |

## 1. Copy vs Adapt, and versions

### The choice

The choose-starting-keyboard step (step id `choose_base`, kept) gains one question after a
keyboard is picked:

- **Copy** — "Use it as the basis for a new keyboard"
- **Adapt** — "Make a variant of this keyboard"

The answer is recorded in the decision record as `start-relationship` with value
`copy | adapt`, through the existing survey-answer path, and is editable from the decision
trail like any other decision. It is additive: no `Pattern` schema change, no change to
existing decision ids or the persisted `base-keyboard` id. A draft with no recorded answer reads
as `copy` and the step shows the question unanswered.

### Version rules

All resolution stays in `resolvePublishVersion` / `resolveTestBuildVersion`
(`packages/engine/src/output/output-version.ts`). `OutputVersionMode` becomes three modes:

| Mode | Path | Publishes at | Test build N |
| --- | --- | --- | --- |
| `copy` (was `new-from-base`) | Track 1, Copy | `1.0` | `0.N` (existing copy rule with P = 1.0) |
| `adapt-variant` (new) | Track 1, Adapt | `bumpKeyboardVersion(source)` | existing adapt rule: V.N, or a.b.(c+N) for three-part V |
| `adapt-existing` (unchanged) | Track 2 | `bumpKeyboardVersion(current)` | unchanged |

`adapt-variant` takes the same three-part-with-test-builds path as `adapt-existing`
(a.b.c → a.(b+1).0), because kmc-package caps versions at three parts.

A source version that kmc-package would reject (non-numeric, leading zeros, more than three
parts) is not bumped blindly: `adapt-variant` falls back to `1.0` and the author is notified.
The notification is an informational notice (never blocking download or submission) shown in
two places: on the `choose_base` step as soon as Adapt is chosen for such a source, and on the
Output step next to the version. It names the source version and the reason, e.g. "The original
keyboard's version `v2.3-beta` isn't a valid Keyman version number, so this keyboard starts at
1.0." The notice uses the existing aria-live cycle (no new timer) and new i18n ids. This differs from `adapt-existing`, which keeps today's `bumpKeyboardVersion` fallback because
Track 2 must stay above the deployed version.

### One version everywhere

The resolved version is the only version in the package: `.kmn` `&KEYBOARDVERSION`, `.kps`
`<Keyboards><Keyboard><Version>`, the zip / `.kmp` filename, and the top `HISTORY.md` heading.
The copy-path preservation in `projectWorkingCopyVfs.ts` (around line 1016) is **replaced** by
the resolved version rather than worked around. The `.kpj` `<Version>` (file-format version) is
never touched (criterion 2.7). Existing Layer C checks 3.6/7.1 (version match) and 2.3–2.5
(format) cover the result.

### Criteria page

Criterion 2.6 ("strictly greater than the previously deployed version") is evaluated only for
`adapt-existing`. For `copy` and `adapt-variant` the criteria page (spec 084,
`packages/studio/src/criteria/assemblyVerdicts.ts`) reports it as *not applicable — new keyboard
ID* instead of comparing against the source keyboard.

### HISTORY lineage line (criterion 19.2)

- Copy: ``Created from `SOURCE_ID` vSOURCE_VERSION via Keyboard Studio.``
- Adapt: ``Adapted from `SOURCE_ID` vSOURCE_VERSION via Keyboard Studio.``
- Track 2: unchanged.

## 2. The slot model

One pure engine function:

```ts
buildDocSlotModel(input: DocSlotInput): DocSlotModel
```

`DocSlotInput` carries the final `KeyboardIR`, the parsed touch layout (if any), the decision
record, `HelpDocsAnswers`, identity, the start relationship, the fetched base docs, and the
resolved version and date. `DocSlotModel` is a flat record of slot id → rendered value (string,
already escaped for its target format), with an empty string meaning "absent". The type lives in
`@keyboard-studio/contracts` (additive).

**Principle: describe the keyboard as built, not as decided.** "How it works" slots derive
from the **final IR**, because a copy or adaptation inherits rules the author never touched. The
decision record contributes labels and wording hints only.

| Slot | Content | Source |
| --- | --- | --- |
| `typingGuide` | Table: character, Unicode name, keystroke sequence | every character the keyboard outputs that the base keyboard does not; shortest keystroke sequence by simulating the IR |
| `mechanisms` | One paragraph per mechanism actually present: deadkeys, AltGr / right-Alt layer, rota (repeat to cycle), combining-mark typing order | rule shapes in the IR (`rule-shape` classification); absent mechanism → no paragraph |
| `layoutCharts` | Existing per-layer SVG charts section | `renderLayoutCharts`, `renderWelcomeLayoutSection` (unchanged) |
| `touchNotes` | Long-press and flick assignments per character | parsed `.keyman-touch-layout`; empty when no touch layout |
| `charInventory` | All typeable characters grouped: letters, marks, punctuation & symbols, digits | IR outputs + Unicode general category |
| `displayName`, `keyboardId`, `languages`, `platforms`, `copyrightHolder`, `year`, `docLang`, `helpHeader` | identity facts | identity, `&TARGETS`, `HelpDocsAnswers.docLanguageTags` |
| `version`, `date`, `lineageLine`, `historyEntries`, `inheritedHistory` | HISTORY only | resolved version, confirmed `pf_history_entry` proposal, base HISTORY |
| `description`, `usageTips`, `credits`, `contact`, `optInSections` | author prose | `HelpDocsAnswers` (contract unchanged) |
| `inherited` | source keyboard's welcome/help prose | base docs; **Adapt and Track 2 only**, never Copy |

### Rules for every slot

- **Code-point-derived names.** Characters render with their Unicode name; combining marks on a
  dotted-circle carrier; characters outside the renderer's coverage as `U+XXXX`
  (spec 056 accessibility rules, same convention as the layout charts).
- **Escape once.** `.htm`/`.php` values go through `shared/escapeHtml.ts`; Markdown values get a
  minimal Markdown escaper. Templates themselves are trusted.
- **Deterministic.** Same keyboard → byte-identical output. Tables sort by code point;
  mechanisms in a fixed order.
- **Empty slot removes its section,** heading included. No "N/A" sections.
- **Scale guard.** The typing guide omits characters the base keyboard already types (plain
  ASCII letters and digits). Above a row threshold (initial value 200, set in planning) it
  becomes a grouped summary that points at the layout charts.
- **D3.** The docs preview calls `buildDocSlotModel` synchronously, as today's preview does
  (spec 061 D-08). No new timer.

### Typing-guide suppression (Q9)

When inherited docs are present (Adapt, Track 2), `typingGuide` is set empty if any `<table>`,
`<ul>`/`<ol>`, or Markdown table/list in the inherited prose contains **at least half** of the
characters the generated guide would list. The check is content-based, so it works whatever
language the inherited docs are in. When suppressed, the documentation checklist on the Output
step notes: "Typing guide not generated: the original docs already include one." Other
generated sections are unaffected.

## 3. Templates

**Location:** `packages/contracts/data/doc-templates/` — `body.tmpl`, `welcome.htm.tmpl`,
`help.php.tmpl`, `README.md.tmpl`, `readme.htm.tmpl`, `HISTORY.md.tmpl`, `LICENSE.md.tmpl`.
Content-owned data. A test asserts every slot a template references exists in `DocSlotModel`,
and every template parses.

**Syntax — two constructs, no logic:**

- `{{slotId}}` — insert the slot value (same placeholder syntax as the `Pattern` contract).
- `{{#slotId}} … {{/slotId}}` — emit the enclosed block only when the slot is non-empty.

No loops, else-branches, expressions, or partials. `body` is rendered first and passed into
`welcome` and `help` as the `body` slot; that is the only composition.

### The forms

```text
body.tmpl                       (rendered once; shared by welcome and help → 11.10 parity by construction)
  {{inherited}}
  {{description}}
  {{#mechanisms}}    ## How this keyboard works       {{mechanisms}}    {{/mechanisms}}
  {{#typingGuide}}   ## Typing guide                  {{typingGuide}}   {{/typingGuide}}
  {{#touchNotes}}    ## On phones and tablets         {{touchNotes}}    {{/touchNotes}}
  {{#charInventory}} ## Characters on this keyboard   {{charInventory}} {{/charInventory}}
  {{#usageTips}}     ## Usage tips                    {{usageTips}}     {{/usageTips}}
  {{#credits}}       ## Credits                       {{credits}}       {{/credits}}
  {{#contact}}       ## Contact                       {{contact}}       {{/contact}}
  {{optInSections}}

welcome.htm.tmpl   <html lang="{{docLang}}"> … <h1>{{displayName}}</h1> {{body}} {{layoutCharts}} …
help.php.tmpl      {{helpHeader}} {{body}}                 (fragment only, spec 080 Decision B)
README.md.tmpl     # {{displayName}} / {{description}} / ## Links (homepage; help.keyman.com/keyboard/{{keyboardId}})
                   / ## Supported Platforms {{platforms}}  (no typing guide; the help link covers it)
readme.htm.tmpl    <h1>{{displayName}}</h1> {{description}} "See the help page for a typing guide."
HISTORY.md.tmpl    ## {{version}} ({{date}}) / {{historyEntries}} / {{lineageLine}} / {{inheritedHistory}}
LICENSE.md.tmpl    MIT body / Copyright © {{year}} {{copyrightHolder}}   (content unchanged)
```

Headings shown in Markdown form; the `.htm`/`.php` templates use `<h2>`. Exact markup is
pinned in planning to match today's rendered output where the content is unchanged, so
existing Layer C checks and snapshot tests keep passing.

### Guarantees by construction

- `{{version}}` appears only in `HISTORY.md.tmpl`; `{{year}}` only in `LICENSE.md.tmpl`
  (criteria 5.x, 3.6/7.1).
- One `copyrightHolder` slot feeds every file (criteria.md's most-cited recurring defect).
- Welcome and help share `body` (criterion 11.10).
- `.htm`/`.php` stay well-formed (criterion 11.5): templates are checked once, values are escaped.

### Regeneration over inherited docs

On Adapt and Track 2, generated sections sit between `<!-- ks:generated:start -->` and
`<!-- ks:generated:end -->` markers. Each output run replaces only the marked block, so
sections never accumulate and the source's hand-written prose is untouched. Copy has no
inherited prose, so the whole body is generated. The spec 061 merge (author answers appended
below inherited text, never replacing it) is kept.

## Code touched (indicative; pinned in planning)

- `packages/contracts`: `DocSlotModel` type + zod mirror (drift-guarded); `start-relationship`
  decision value; `data/doc-templates/*`.
- `packages/engine/src/output/output-version.ts`: three modes, `adapt-variant` rules.
- `packages/engine/src/shared/`: new `docSlotModel.ts`, `renderDocTemplate.ts`;
  `helpDocsRender.ts` and `renderHistoryMd.ts` reimplemented on top of them, public exports
  kept.
- `packages/studio`: the `choose_base` question; `serializeWorkingCopy.ts` and
  `projectWorkingCopyVfs.ts` use the resolved version; `flowStepOptions.tsx` and
  `useDocumentationFindings.ts` pass the new mode; `assemblyVerdicts.ts` 2.6 not-applicable
  branch; documentation checklist suppression note; i18n ids for the new strings.
- `docs/keyboard-documentation-plan.md`: update the "what the tool gives you" section.

## Testing

- `output-version` unit table: every mode × one/two/three-part source × with/without test
  builds × invalid source.
- Package consistency: for each mode, `.kmn`, `.kps`, filename and HISTORY heading agree.
- `buildDocSlotModel` over corpus fixtures: a deadkey keyboard, an AltGr keyboard, a rota
  keyboard, a combining-mark keyboard, one with a touch layout, one without; snapshot per slot.
- Determinism: render twice, compare bytes.
- Template lint: all slots known, all templates parse, `.htm`/`.php` well-formed after render.
- Suppression: inherited doc with a typing table → guide absent + checklist note; without → present.
- Regeneration: render over an already-generated adapted doc twice → exactly one marked block.
- Existing Layer C documentation checks (13 codes) stay green on generated output.
- E2E: choose a keyboard, pick Copy → Output shows 1.0; switch to Adapt → shows bumped version.
- Invalid source version + Adapt → version 1.0, notice visible on `choose_base` and Output,
  download still enabled.

## Out of scope

- Translated template sets (templates are English; author prose may be any language).
- An on-screen form for editing generated sections.
- A "changes from the starting keyboard" docs section.
- Any change to Track 2 version policy.

## Open items for `/speckit-clarify`

- Exact typing-guide row threshold and the grouped-summary format.
- Whether `mechanisms` paragraphs live in the templates (content-owned, one block per
  mechanism) or in a separate content catalog the slot builder reads.
