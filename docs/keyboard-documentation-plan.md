# Documentation plan for an authored keyboard

A generic, reusable checklist for writing the human-facing documentation of a keyboard produced
by the studio (or authored by hand following the same layout). Distilled from the corpus at
`../keyboards`, [docs/criteria.md](criteria.md)'s PR-review checklist, and
[docs/archive/making-a-template.md](archive/making-a-template.md). Complements those two — this doc is the
authoring *plan*; criteria.md is the review *checklist* the result gets held to.

## What the tool already gives you

**Every produced package ships all six documentation members** — `README.md`, `HISTORY.md`,
`LICENSE.md`, `source/readme.htm`, `source/welcome/welcome.htm`, and `source/help/<id>.php` —
regardless of base or how far the author got
([specs/080-documentation-completeness](../specs/_archive/080-documentation-completeness/spec.md) FR-001).
`projectWorkingCopyForOutput` regenerates them on every production
([packages/engine/src/shared/helpDocsRender.ts](../packages/engine/src/shared/helpDocsRender.ts),
[renderHistoryMd.ts](../packages/engine/src/shared/renderHistoryMd.ts)), via the SAME render
modules the in-studio preview uses, so the two cannot visibly disagree.

**Three source tiers, in priority order** (079 FR-005): facts *derived* from the keyboard itself
(names, language, platforms, holder) are always applied; content *inherited* from the base is
used on a Track 2 adaptation (welcome page and its images, help body, README description,
HISTORY entries — the author's answers are appended below, never replacing it); content
*authored* in the Phase F help-docs step wins where it exists. A Track 1 copy inherits only the
base's welcome images and page skeleton, never its prose (FR-007). The Output step's
documentation checklist shows which tier filled each member and marks any member still on its
fallback stub; `deriveDocMemberStates`
([packages/engine/src/shared/deriveDocMemberStates.ts](../packages/engine/src/shared/deriveDocMemberStates.ts))
is the one source of that record (FR-022). The checklist informs and never blocks download or
submission (FR-018).

**The welcome page lives in the folder convention** — `source/welcome/welcome.htm`, with its
images beside it and every file listed in the `.kps` `<Files>` as `welcome\…`; a flat
`source/welcome.htm` never appears in output (FR-002). A base using either convention is found
and inherited. **A fresh help page opens with the corpus-standard help-site header**
(`$pagename = '<Display Name> Keyboard Help'`, `$pagetitle = $pagename`,
`require_once('header.php')`); an inherited help page keeps its own (FR-003).

**Layout charts** (079 FR-013..016): one deterministic SVG per (platform, layer) —
`ks-layout-<platform>-<layer>.svg`, generated from the keyboard model by
`renderLayoutCharts` (`packages/engine/src/layout-chart/`) — is written into `source/welcome/`,
referenced from the welcome page's "Keyboard Layout" section, and listed in the descriptor.
Combining marks draw on a dotted-circle carrier, characters outside the renderer's declared
coverage table as `U+XXXX`, empty keys with a distinct keycap. When the base ships its own
images they are kept and no charts are generated unless the author opts to regenerate (the
control sits on the checklist's welcome row).

**Every file is rendered from a form** (spec 102). The six files and the shared welcome/help
body are fill-in forms in
[packages/contracts/data/doc-forms.json](../packages/contracts/data/doc-forms.json), owned by the
content team. A form has two constructs: `{{slot}}` inserts a value and `{{#slot}}…{{/slot}}`
keeps a section only when its value is non-empty, so an empty section disappears with its
heading. The slots are listed in
[packages/engine/src/shared/docSlots.ts](../packages/engine/src/shared/docSlots.ts). To change a
heading, wording or section order, edit the form: no engine code changes, and `pnpm -r test`
fails naming the form if it references an unknown slot or does not parse. The version appears
only in `HISTORY.md` and the year only in `LICENSE.md`.

**The welcome and help pages explain how the keyboard works**, with no answers needed. They are
derived from the keyboard as built, including rules inherited from the starting keyboard
([packages/studio/src/lib/docContent.ts](../packages/studio/src/lib/docContent.ts)):

| Section | Content |
| --- | --- |
| Typing Guide | each produced character outside printable ASCII, its Unicode name and its shortest keystrokes, by code point; a grouped summary above 200 characters |
| How This Keyboard Works | one paragraph per mechanism the keyboard uses: deadkeys, right-Alt layer, repeat-to-cycle, combining-mark order (wording in `doc-forms.json` under `mechanisms`) |
| On Phones and Tablets | long-press and flick characters; absent when there is no touch layout |
| Characters on This Keyboard | every character, grouped as letters, marks, punctuation and symbols, and digits |

Marks sit on a dotted circle and every character carries its Unicode name or `U+XXXX`. With no
answers at all, the welcome and help pages open with "Welcome to `<name>`" and carry these
sections; `README.md` has its title, a link to the keyboard's help-site page and the platforms;
`source/readme.htm` has the name and the help link.

**On an adaptation** the original welcome and help prose comes first and the generated sections
follow once, between `<!-- ks:generated:start -->` and `<!-- ks:generated:end -->`; an older
generated block in the original is replaced. If the original already has a table or list
covering half the typing guide's characters, the guide is left out and the checklist says so.

**Version** (spec 102): a copy (Track 1) is a new keyboard and ships at 1.0, with test builds at
0.1, 0.2, …; its history opens with "Created from `<id>` v`<version>` via keyboard-studio.". An
adaptation (Track 2) ships the original's version with its last number increased, as before.
`&KEYBOARDVERSION`, the `.kps` `<Version>`, the file name and the newest HISTORY heading always
agree.

**`HISTORY.md` is proposed, not stubbed** (079 FR-010..012): the Phase F `pf_history_entry`
screen proposes a first entry built from the decision record — the base it started from,
characters added, mechanisms assigned, keys removed — under `## <version> (<YYYY-MM-DD>)`.
Confirm, edit, or dismiss it; a dismissed proposal leaves the stub and the checklist marks
HISTORY as placeholder. On an adaptation the "Adapted from `<id>` v`<version>` via
keyboard-studio." bullet is always present (criterion 19.2) and the base's entries are preserved
below (criterion 3.4).

| File | Auto-generated content |
| --- | --- |
| `LICENSE.md` | MIT body + `Copyright © <year> <holder>` line (scaffolder / `ensurePackageFiles`) |
| `HISTORY.md` | the confirmed proposal, else `## <version> (<date>)\n* Initial release.`; the "Created from" bullet comes first on a copy, the "Adapted from" bullet alone on an adaptation |

**Thirteen documentation criteria run as Layer C warnings inside the existing validation cycle**
(079 FR-019; `packages/keyboard-lint/src/checks/docs/`): HISTORY order, cumulativeness, entry
format, version agreement (both sides), stale file references, copyright-holder consistency,
README platforms vs. targets, HTML well-formedness, help-page layer list, page-name format, and
welcome/help body and style parity. A finding the base's own files already carried shows as an
upstream finding (muted) until the member is edited (FR-020).

## Write order

1. **Identity first** — the `.kps` Info block: `Name`, `Author`/copyright holder, BCP47 language
   list. Every file below quotes this rather than deriving its own copy; a holder-name typo fixed
   in isolation on one file, but not the other four, is criteria.md's #1 recurring reviewer
   finding (e.g. `jinland` PR #3647 — a misspelling the reviewer fixed in `LICENSE.md`, `HISTORY.md`,
   and `.kps` across three separate commits).

2. **`README.md`** — package-manager-facing description:
   - Description, commonly bilingual (native-language paragraph + English — see
     `../keyboards/release/b/bambara/README.md`)
   - `Links`: keyboard homepage + `http://help.keyman.com/keyboard/<id>`; omit a line entirely if
     it doesn't apply rather than leaving it blank
   - `Supported Platforms`, pruned to match the `.kmn`'s `store(&TARGETS)`
   - No version number, no copyright year — those live only in `HISTORY.md`/`.kmn`/`LICENSE.md`

3. **`source/readme.htm`** — same description, condensed for the package-details popup.
   Well-formed HTML (balanced `<h1>`/`<h2>`, closed `<p>`). No version/copyright here either.

4. **`source/welcome/welcome.htm`** — the first-run page (folder convention, images beside it):
   - Description
   - `<html lang="...">` set to the keyboard's *primary* BCP47 tag
   - A "Keyboard Layout" section: the generated `ks-layout-*.svg` charts (or the base's own
     images when kept), one per platform and layer
   - No install instructions — link to `help.keyman.com/products/` instead
   - No version/copyright

5. **`source/help/<id>.php`** — now generated for every keyboard, net-new or adapted (spec 061):
   `helpDocsRender.ts` shares ONE rendered body between `welcome.htm` and this file, a structural
   guarantee rather than a "draft one, then mirror it" discipline — writing them independently and
   reconciling afterward is how the two used to drift apart. When adapting a base that already
   shipped its own hand-authored `help/<id>.php`, the original body is preserved and new answers
   are appended below it (FR-013), never replaced.

6. **`HISTORY.md`** — confirm or edit the proposed first entry (what the keyboard does, notable
   design choices, what it was adapted from) rather than shipping "Initial release.". Keep it
   cumulative on every future version bump; never delete prior entries.

## Final consistency pass

Each of these is a real reviewer-caught defect in criteria.md's citations, not a hypothetical —
check all of them once, after drafting, rather than per-file:

- Copyright holder name identical in `LICENSE.md`, `.kmn`, `.kps`, `README.md`, `HISTORY.md`
- No version number anywhere except `HISTORY.md`/`.kmn`; no copyright year anywhere except
  `LICENSE.md`
- `.kmn` version === top `HISTORY.md` entry
- `welcome/welcome.htm` body === `help/<id>.php` body (byte-identical after stripping the help
  header and the welcome page's layout section and normalizing whitespace)
- `<html lang>` in `welcome/welcome.htm`/`.php` matches the primary language
- PUA codepoints, if used, flagged in `readme.htm`, `welcome.htm`, the `.php`, and the `.kps`
  description
- No stray `docs/` folder duplicating `HISTORY.md`/`README.md`; no duplicate `welcome.htm` copies
