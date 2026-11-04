# README template driven by authoring choices — design

Date: 2026-11-02 · Status: draft for review

## Intent

A generated keyboard's `README.md` should answer the two questions its reader has. The reader
is **someone deciding whether to use the keyboard**:

1. Will this keyboard produce the characters I need?
2. How do I type them?

Today the shipped README (`renderReadmeMd`, `packages/engine/src/shared/helpDocsRender.ts:593`,
form `readmeMd` in `packages/contracts/data/doc-forms.json`) holds only the title, description,
links and platforms. `source/readme.htm` (`renderReadmeHtm`, same file :622) is a one-line
description plus a help link. Neither reflects what the author actually built.

The fix is a README template whose sections are filled from what the author chose and built,
plus a brief `readme.htm` built from the same facts. The `readme.htm` decision was revised in
conversation: it was first a duplicate, and is now short, per Keyman's guidance.

## Goals

- README states languages, script, copied keyboard, the character inventory, and a short
  "how to type" summary drawn from the working copy.
- Each optional section appears only when there is something true to say. No "to be confirmed"
  placeholders.
- `readme.htm` becomes a brief install-time page drawn from the same facts (see below).
- Short: about 40–60 lines for a typical keyboard.

## Non-goals

- A full per-key typing guide in the README. That stays on the welcome/help page, and the
  README points to it.
- Layout images in the README.
- Copyright in the README. It stays in `LICENSE.md`, per spec 102 FR-007.
- Installation steps. The keyman.com and help links cover them.
- "What's new" history and related-keyboards sections. They were considered and deferred.

## Anti-goals (failure even if it "works")

- The README claims a character, key or font the keyboard doesn't actually have. Every
  statement must derive from the built IR or an explicit author answer.
- `README.md` and `readme.htm` state different facts. They may differ in length, never in what
  they say.
- The legacy generic filler returns ("comprehensive diacritic support", "touch-friendly
  layouts").

## Decided

### Template

The template has the following sections, in this order. A section marked *if any* is dropped
when it has no content.

```markdown
# {displayName}

{description}                                              (if any)

For typing **{languageName}** ({autonym}, `{bcp47}`) in the {script} script.
Based on the {copiedKeyboard} layout ({layoutFamily}).     (if any)
Suited to: {useCase}.                                      (if answered)

## Characters
- Letters: …
- Marks: …
- Punctuation and symbols: …                               (if any)
- Digits: …                                                (if any)
- Removed from {copiedKeyboard}: …                         (if any)

{composition sentence}                                     (if any marked characters)

## How to type
| Keys | Gives |
|------|-------|
…  at most 8 example rows, plus literal-trigger rows
Full guide with every key: see the welcome page.           (when rows were left out)

## Fonts                                                    (see rule below)
## Tips                                                     (usageTips, if answered)
## Known limitations                                        (knownLimitations, if answered)
## Design notes                                             (for authors adapting it)
## Links
## Supported Platforms
```

A worked example (a made-up Hausa keyboard) was agreed in conversation:

- The language line reads "Hausa (Harshen Hausa, `ha-Latn-NG`)".
- Characters: ɓ ɗ ƙ ƴ ʼ and the tone marks.
- "How to type" rows include `Right Alt + b → ɓ`, `; then a → à`, `; then ; → ;` and
  `long-press b (touch) → ɓ`.
- The font note names Andika and Charis SIL because the author supplied them.
- The finished README is about 50 lines.

### Section rules

- **Characters.** One line per group, and each group is listed in full rather than truncated,
  because truncating defeats question 1. Groups and source: the existing
  `producedChars` / `renderInventory` grouping in `packages/studio/src/lib/docContent.ts`.
  "Removed from" comes from the carve decision (`carved-layout`).
- **How to type.** At most **8** example rows. Pick one example per typing method in use
  (deadkey, Right Alt, sequence, touch long-press, …), then fill the remaining rows. When rows
  are left out, end with the pointer to the welcome page. The source is the existing
  `guideRows` / mechanism detection in `docContent.ts`.
- **Literal-trigger rows (item 1).** For each deadkey or trigger key in use, add a row showing
  how to type the key's own character (`; then ;` → `;`). These rows don't count toward the
  cap of 8.
- **Composition sentence (item 3).** One plain sentence stating whether accented letters come
  out as single precomposed characters or as letter + combining mark. It is shown only when the
  inventory has marked characters.
- **Font note (item 2).** If the author answered the font-guidance question, that answer is
  used. Otherwise the note is shown only when the inventory has characters outside basic Latin,
  and it doesn't name a specific font.
- **Suited to (item 4).** From the `use-case` survey answer, rendered as plain prose.
- **Design notes.** This section was added at the user's request, after Keyman's guidance that
  README.md also serves other keyboard authors who might adapt the keyboard. It is short, at
  most about 6 bullets, in plain words, and each bullet is shown only when it has content. The
  bullets below are the designer's selection:
  - *Starting point:* "Started from {copiedKeyboard} {version}" (Track 1), or "Adapted from the
    released {version}" (Track 2), from `startKeyboard`.
  - *Typing methods:* which method covers which group, e.g. "Hooked letters: Right Alt; tones:
    deadkey `;`". The source is the `physical-layout` assignments' strategy ids, mapped to plain
    names. Strategy ids (S-01…) are not printed.
  - *Marks:* the input order (mark after letter or before it) and what a stray mark does
    (swallowed or passed through), from `marks-treatment` and `fallbackPolicy`.
  - *Touch layout:* "generated from the desktop layout" or "adapted from {copiedKeyboard}'s",
    from `touch-seed-source`.
  - *Removed keys:* the count of characters removed from the copied keyboard, from
    `carved-layout`. The list itself is under Characters.
  - *Rationale:* the author's `designRationale` help-docs answer, if given.
  - The Design notes section is **not** included in `readme.htm`.

### Adapted keyboards (Track 2)

The generated README **replaces** the original README entirely. This is a change from today:
`renderReadmeMd` currently keeps `startReadmeMdText` and ships it verbatim when no description
was answered (`helpDocsRender.ts:597`), or appends the generated part below it. The
replacement applies even when the author answered nothing.

**The original description is reused** when the author hasn't written a new one (user
decision). Designer's call on the source, in order:

1. The starting point's `.kps` `<Description>`.
2. The text under the original README's `Description` heading or `__DESCRIPTION__` marker.
   Both forms are common in the corpus.
3. If neither is found, no description.

The reused text is treated as plain text and escaped like any other description.

### readme.htm (revised: a brief page, not a duplicate)

`readme.htm` is shown while the package is being installed. Keyman's own guidance
([Writing Keyboard Documentation](https://help.keyman.com/developer/19.0/guides/walkthrough/07-writing-keyboard-documentation))
says it "should be kept as short as possible" and that usage instructions belong in
`welcome.htm`, and criterion 6.2 says the same. So it answers one question only: is this the
right keyboard? It runs to about 6–8 lines:

```html
<h1>{displayName}</h1>
<p>{description}</p>                                          (if any)
<p>For typing {languageName} ({autonym}) in the {script} script.
   Based on {copiedKeyboard} ({layoutFamily}).</p>            (clauses as in README)
<p>Adds: {letters and marks beyond plain typing}</p>          (if any)
<p>{font line}</p>                                            (same rule as README)
<p>After installing, see the welcome page for how to type each character.</p>
```

- **Not on this page:** the How-to-type table, Links, Supported Platforms, the composition
  sentence and "Suited to".
- **The "Adds:" line** holds letters and marks only. It is the one place that truncates, as
  "… and N more" past a cap the builder picks (around 20 characters), because the full list is
  on the welcome page.
- **It shares the README's section model** (one source of facts, two renderers), so the two
  files cannot contradict each other even though they differ in length.

### Spec and criteria changes

These are consequences of the decisions above, and all need recorded amendments:

- **Spec 102 FR-029.** It currently says the README "MUST NOT include the typing guide" and
  keeps the package readme condensed.
- **Spec 102 User Story 4 and spec 080 FR-006.** Both preserve an adapted keyboard's original
  documentation. That no longer holds for the README.
- **Spec 102 FR-029, the package-readme clause.** It currently allows only the description and
  a help-page pointer. It must be widened to the brief page above. Criterion
  `6.2-readme-htm-short` stays as it is, because the new page still satisfies it.

## Calls made in review (the designer's, not the user's — check these)

- **Characters lists only what goes beyond plain typing.** That means produced characters
  outside printable ASCII (U+0020–U+007E), using the same filter as `guideRows`. Listing the raw
  produced set would dump a–z and ASCII punctuation into the README. Basic letters that were
  carved away still show, under "Removed from". An "Other" group is shown when it is non-empty.
- **Where the language and layout lines get their values:**
  - `{autonym}` comes from the `language-autonym` decision and is dropped when unanswered.
  - `{copiedKeyboard}` is `startKeyboard.displayName`, Track 1 only.
  - The layout family comes from the `windows-layout` decision. That is the Keyman **base
    keyboard** (the OS layout), so the line reads "Based on {copiedKeyboard}, for a {QWERTY}
    base keyboard", keeping the copied-versus-base vocabulary straight.
  - On Track 2 the "Based on" clause is dropped, because the starting point is the keyboard
    itself.
  - Each of these values needs a new `HelpDocsRenderInput` field, plumbed through
    `serializeWorkingCopy.ts` and `useDocsPreview.ts`.
- **Several languages: list them all**, as "Hausa (`ha-Latn-NG`), Fulfulde (`ff-Latn-NG`)", with
  the autonym only on the primary one.
- **Fixed template strings stay English**, as the README's fixed headings ("Links", "Supported
  Platforms") are today. Localizing them is future work.
- **No suppression of "How to type" in the README.** The welcome page's
  `typingGuideSuppressed` exists because inherited prose already holds a guide. The README no
  longer inherits prose, so the summary always renders when there are rows.
- **Use-case wording.** `literacy` → "learning to read and write", `messaging` → "texting and
  chat", `official` → "official and formal documents". For `general` the line is dropped,
  because it says nothing. Content team may revise the wording.

## Left to the builder

- How the Markdown versions of the characters and "how to type" sections are produced. The
  existing slots in `docContent.ts` are pre-escaped HTML for the .htm/.php forms. Options are
  structured rows rendered twice, or separate Markdown renderers.
- How the cap picks its 8 rows beyond "one per typing method first".
- How the composition sentence is detected. Deriving it from the IR's actual output is
  preferred over the survey answer, since the IR is what ships.
- How to guarantee that README.md and readme.htm stay in sync. The expected approach is one
  section model with two renderers, plus a test that fails if they diverge.
- Retiring the dead legacy `readmeMd` / `readmeHtm` in `packages/engine/src/shared/packageDocs.ts`
  (the scaffolder stub that the projection overwrites).
- Whether this lands as a spec 102 amendment or as a new `specs/NNN` (check the
  `spec-extraction` skill and open PRs for number claims).
