# Documentation plan for an authored keyboard

A generic, reusable checklist for writing the human-facing documentation of a keyboard produced
by the studio (or authored by hand following the same layout). Distilled from the corpus at
`../keyboards`, [docs/criteria.md](criteria.md)'s PR-review checklist, and
[docs/making-a-template.md](making-a-template.md). Complements those two — this doc is the
authoring *plan*; criteria.md is the review *checklist* the result gets held to.

## What the tool already gives you

The scaffolder (`packages/engine/src/scaffolder/index.ts`) and `ensurePackageFiles`
(`packages/engine/src/output/ensurePackageFiles.ts`, via
[packages/engine/src/shared/packageDocs.ts](../packages/engine/src/shared/packageDocs.ts)) write
these automatically, but only to satisfy `kmc-package`'s "listed file must exist" check
(`KM04003`) — not as real documentation:

| File | Auto-generated content |
| --- | --- |
| `LICENSE.md` | MIT body + `Copyright © <year> <holder>` line |
| `HISTORY.md` | `## 1.0 (<date>)\n* Initial release.` (+ an "Adapted from `<sourcePath>`" bullet if imported) |
| `README.md` | `# <displayName>` — a bare heading |
| `source/welcome.htm` | `Welcome to <name>` — one line |
| `source/readme.htm` | `<name> keyboard` — one line |

None of these will survive a real `keymanapp/keyboards` PR review as-is. The work below is
upgrading each of them, plus one file the tool never generates at all.

## Write order

1. **Identity first** — the `.kps` Info block: `Name`, `Author`/copyright holder, BCP47 language
   list. Every file below quotes this rather than deriving its own copy; a holder-name typo fixed
   in isolation on one file, but not the other four, is criteria.md's #1 recurring reviewer
   finding (e.g. `jinland` PR #3647 — a misspelling silently fixed in `LICENSE.md`, `HISTORY.md`,
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

4. **`source/welcome.htm`** — the first-run page:
   - Description
   - `<html lang="...">` set to the keyboard's *primary* BCP47 tag
   - A "Keyboard Layout" section: the Keyman-generated OSK div, or a width-constrained custom
     image
   - No install instructions — link to `help.keyman.com/products/` instead
   - No version/copyright

5. **`source/help/<id>.php`** — the tool does **not** generate this for a net-new keyboard (it's
   only carried over when adapting a base that already had one). Draft `welcome.htm` first, then
   mirror its body into the `.php` with the correct PHP header and a `pagename` matching
   help.keyman.com's table-of-contents convention — writing them independently and reconciling
   afterward is how the two drift apart.

6. **`HISTORY.md`** — replace "Initial release." with real bullets (what the keyboard does,
   notable design choices, what it was adapted from). Keep it cumulative on every future version
   bump; never delete prior entries.

## Final consistency pass

Each of these is a real reviewer-caught defect in criteria.md's citations, not a hypothetical —
check all of them once, after drafting, rather than per-file:

- Copyright holder name identical in `LICENSE.md`, `.kmn`, `.kps`, `README.md`, `HISTORY.md`
- No version number anywhere except `HISTORY.md`/`.kmn`; no copyright year anywhere except
  `LICENSE.md`
- `.kmn` version === top `HISTORY.md` entry
- `welcome.htm` body === `help/<id>.php` body (byte-identical after stripping headers and
  normalizing whitespace)
- `<html lang>` in `welcome.htm`/`.php` matches the primary language
- PUA codepoints, if used, flagged in `readme.htm`, `welcome.htm`, the `.php`, and the `.kps`
  description
- No stray `docs/` folder duplicating `HISTORY.md`/`README.md`; no duplicate `welcome.htm` copies
