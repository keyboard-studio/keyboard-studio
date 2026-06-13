# Keyman Keyboard PR Review Criteria

Each item is a pass/fail check. Group order roughly follows the order a reviewer would walk through a PR.

Legend:
- <span style="color:green">**Green**</span> — **Deterministic.** Can be checked mechanically from the keyboard files (file presence, regex/syntax, parsing, diffs, version comparisons).
- <span style="color:goldenrod">**Yellow**</span> — **LLM-judgeable, possibly with a web lookup.** Requires reading and understanding text/code content, or consulting a publicly accessible web resource (e.g. langtags / Ethnologue databases, `s.keyman.com`, an organization's website). A capable LLM with web access can answer it.
- <span style="color:red">**Red**</span> — **Needs information that is not publicly available.** Requires out-of-band author communication (e.g. emailing the original author for relicensing permission), private project knowledge, or reviewer workflow state that no public source records.
- **Unmarked** — Meta-criterion or workflow step (not a check on artifacts).

## 1. Repository hygiene

- <span style="color:green">[ ] No files modified outside the keyboard's own folder (e.g. root `build.sh`, root `README.md` untouched).</span>
- <span style="color:green">[ ] Keyboard lives under `release/` or `experimental/`.</span>
- <span style="color:green">[ ] Keyboard sits under an organizing folder (single alphabetic letter, or an organization code) — not at the root of `release/` or `experimental/`.</span>
- <span style="color:green">[ ] No source files placed at the repo root.</span>
- <span style="color:green">[ ] The keyboard ID (folder name) is not already used in `experimental/`, `legacy/`, or `release/`.</span>
- <span style="color:green">[ ] Keyboard ID / name / folder does **not** contain the word "keyboard" — it's redundant in a keyboards repo. _(Ref: [PR #3986](https://github.com/keymanapp/keyboards/pull/3986), `mising_keyboard` → `mising`)_</span>
- <span style="color:green">[ ] No `keyboard.info` file in the keyboard folder — its contents now live in the `.kps`. _(Ref: [PR #3991](https://github.com/keymanapp/keyboards/pull/3991), `sil_senegal_bsc_azerty`)_</span>
- <span style="color:green">[ ] No `docs/` (or similar) subfolder containing duplicate `HISTORY.md` / `README.md` / `INSTALL.md` — those files live at the keyboard root only. _(Ref: [PR #3950](https://github.com/keymanapp/keyboards/pull/3950), `mara` had a duplicate `docs/` folder.)_</span>
- <span style="color:green">[ ] No duplicate copies of the same source file inside the keyboard (e.g. `welcome.htm` at both `source/welcome.htm` and `source/welcome/welcome.htm`). _(Ref: [PR #3755](https://github.com/keymanapp/keyboards/pull/3755) — `ibono_chwerty`: Lorna silently deleted a duplicate `welcome.htm` and a duplicate `.xml` file.)_</span>
- <span style="color:goldenrod">[ ] `.kpj` uses the current/newest project-file format (older `.kpj` formats should be migrated when the keyboard is touched). _(Ref: [PR #3742](https://github.com/keymanapp/keyboards/pull/3742) — `german_enhanced`: Lorna silently updated the `.kpj` with the note "Use new kpj format for future maintenance".)_</span>
- <span style="color:green">[ ] No `.kpj.user` files committed (user-specific Keyman Developer state). _(Ref: [PR #3440](https://github.com/keymanapp/keyboards/pull/3440) — `cantonese_telex`: Lorna silently deleted `cantonese_telex.kpj.user`; [PR #3638](https://github.com/keymanapp/keyboards/pull/3638) — `sisaali`: same.)_</span>
- <span style="color:green">[ ] No `build/` folder contents committed (compiled outputs `.kmx`/`.kvk`/`.js`/`.kmp` live only in the final package, not in a sibling `build/` directory in the source tree). _(Ref: [PR #3440](https://github.com/keymanapp/keyboards/pull/3440) — Lorna: "Do not include compiled files".)_</span>
- <span style="color:green">[ ] No stray scratch / test files in the keyboard folder (e.g. `testt.txt`). _(Ref: [PR #3277](https://github.com/keymanapp/keyboards/pull/3277) — `mjh_hudum`: Lorna silently deleted a stray `testt.txt`.)_</span>

## 2. Version bumping

- <span style="color:green">[ ] If any file that ships in the package was modified, the keyboard version was bumped.</span>
- <span style="color:green">[ ] If only non-package files were modified (e.g. `README.md`, `HISTORY.md`, `keyboard.php`), the version was *not* required to bump.</span>
- <span style="color:green">[ ] Version number is dot-separated and entirely numeric. SemVer (`1.0`, `1.0.1`, `2.2.5`) and CalVer (`2026.04.30`, `2026.10.31`) are both accepted. _(Ref: [PR #3949](https://github.com/keymanapp/keyboards/pull/3949) — `engram_en`; mcdurdin confirmed CalVer is fine in `&keyboardversion`.)_</span>
- <span style="color:green">[ ] No component of the version has a leading zero (e.g. `1.01` is rejected).</span>
- <span style="color:green">[ ] Version has no `v` prefix and no non-numeric labels (e.g. `v2025-04-01`, `v1.0-beta`, `v2025.10.31` are all rejected). _(Ref: [PR #3949](https://github.com/keymanapp/keyboards/pull/3949) — `store(&KEYBOARDVERSION) 'v2025.10.31'` was rejected.)_</span>
- <span style="color:green">[ ] New version is strictly greater than the previously deployed version.</span>
- <span style="color:green">[ ] The `.kpj` file's `<Version>` field has **not** been bumped — that field is the `.kpj` file-format version, not the keyboard version. _(Ref: [PR #3949](https://github.com/keymanapp/keyboards/pull/3949) — Lorna: "The .kpj file should not be updated. That version number in there is referencing the format of the .kpj file, not the version number of the keyboard.")_</span>

## 3. `HISTORY.md`

- <span style="color:green">[ ] File exists.</span>
- <span style="color:goldenrod">[ ] Header is sensible.</span>
- <span style="color:green">[ ] Most recent change is at the top of the file. _(Ref: [PR #3962](https://github.com/keymanapp/keyboards/pull/3962) — `mon_k_nemin`: "above the current text, add in what you changed".)_</span>
- <span style="color:green">[ ] File is **cumulative** — prior entries are preserved, not overwritten. _(Ref: [PR #3962](https://github.com/keymanapp/keyboards/pull/3962) `mon_k_nemin`; [PR #3949](https://github.com/keymanapp/keyboards/pull/3949) `engram_en` — Lorna: "The HISTORY.md file is intended to provide a complete history.")_</span>
- <span style="color:green">[ ] Each entry follows the format `<version> (<YYYY-MM-DD>)` on one line, underlined with hyphens on the next, followed by `*`-bulleted change items. _(Ref: [PR #3962](https://github.com/keymanapp/keyboards/pull/3962), [PR #3949](https://github.com/keymanapp/keyboards/pull/3949).)_</span>
- <span style="color:green">[ ] Top entry's version matches the version in the `.kmn` file. _(Ref: [PR #3972](https://github.com/keymanapp/keyboards/pull/3972) — `vietnam`: Lorna silently bumped `HISTORY.md` from `2.0.4` to `2.0.5` to match the `.kmn` after the author forgot.)_</span>
- <span style="color:green">[ ] HISTORY.md bullets do not reference files that no longer exist in the keyboard (e.g. files mentioned in a "documentation added" bullet must still be present). _(Ref: [PR #3950](https://github.com/keymanapp/keyboards/pull/3950) — `mara`: Lorna silently removed bullets that referenced `README.md`, `INSTALL.md`, and `HISTORY.md` under the deleted `docs/` folder.)_</span>

## 4. `LICENSE.md` (copyright)

- <span style="color:green">[ ] Copyright statement is present with year(s).</span>
- <span style="color:goldenrod">[ ] If the keyboard has been updated across multiple calendar years, the copyright statement uses a year range (e.g. `Copyright © 2025-2026 cathaylab`). _(Ref: [PR #3984](https://github.com/keymanapp/keyboards/pull/3984) — `lac_viet`: Lorna asked author to extend the year.)_</span>
- <span style="color:red">[ ] Copyright holder is the author themselves, or a legal entity they are entitled to claim on behalf of (not a third-party org).</span>
- <span style="color:goldenrod">[ ] If an organization is named, its current legal name is used (not an outdated/former name).</span>
- <span style="color:green">[ ] Copyright line follows the exact syntax: `Copyright © <year> <copyright holder>` — the literal word "Copyright" is present, and there's a space between `©` and the year. _(Ref: [PR #3991](https://github.com/keymanapp/keyboards/pull/3991) — `sil_senegal_bsc_azerty`: author wrote `©2021-2026 SIL International`; Lorna silently fixed to `Copyright © 2021-2026 SIL International` with the note "Add the word 'Copyright' back in or the package will not build.")_</span>
- <span style="color:green">[ ] Copyright **year** is not embedded in the `.kmn` or `.kps` copyright strings — only in `LICENSE.md` (so the years aren't duplicated and don't need yearly updating). _(Ref: [PR #3991](https://github.com/keymanapp/keyboards/pull/3991) — `sil_senegal_bsc_azerty`: Lorna preference.)_</span>
- <span style="color:green">[ ] Copyright **holder name** is identical across `LICENSE.md`, `.kmn`, `.kps`, `README.md`, and `HISTORY.md`. Author can't claim one name in one file and another (e.g. a misspelling) in another. _(Ref: [PR #3647](https://github.com/keymanapp/keyboards/pull/3647) — `jinland`: Lorna silently fixed the copyright-holder name in `LICENSE.md`, `HISTORY.md`, and `.kps` in three matching commits "fix name of copyright holder".)_</span>
- <span style="color:green">[ ] If the keyboard spans years and a range is used, the range starts at the **original** year and extends to the current year (e.g. `2024-2025`, not just `2025`). _(Ref: [PR #3271](https://github.com/keymanapp/keyboards/pull/3271) — Lorna: "we always want the beginning and ending range of years. So, in this case we keep the 2024 and extend it to 2024-2025.")_</span>

## 5. `README.md`

- <span style="color:goldenrod">[ ] Has a good header.</span>
- <span style="color:green">[ ] No version number embedded in the README, **nor** in `readme.htm`, `welcome.htm`, or the help `.php` — the version belongs only in `HISTORY.md` and the `.kmn`. _(Ref: [PR #3986](https://github.com/keymanapp/keyboards/pull/3986) — `mising`: Lorna asked author to remove version from `welcome.htm` and `mising.php`; [PR #3742](https://github.com/keymanapp/keyboards/pull/3742) — `german_enhanced`: Lorna silently removed version from `README.md`, `readme.htm`, and `welcome.htm`.)_</span>
- <span style="color:green">[ ] No copyright year/statement in the README, **nor** in `readme.htm` or `welcome.htm` (so those files don't need yearly updating). _(Ref: [PR #3742](https://github.com/keymanapp/keyboards/pull/3742) `german_enhanced` and [PR #3857](https://github.com/keymanapp/keyboards/pull/3857) `remington_gail` — Lorna silently removed copyright statements from `readme.htm` and `welcome.htm`.)_</span>
- <span style="color:goldenrod">[ ] Description makes sense.</span>
- <span style="color:green">[ ] Includes link to keyboard home: `https://keyman.com/keyboards/<file_name>`.</span>
- <span style="color:green">[ ] Includes link to keyboard help: `http://help.keyman.com/keyboard/<file_name>`.</span>
- <span style="color:green">[ ] Targets listed match those in the `.kmn`.</span>

## 6. Documentation files (`source/`)

### `readme.htm`
- <span style="color:green">[ ] Exists in `source/`.</span>
- <span style="color:goldenrod">[ ] Content is short — just a brief description (this is what shows on first install of the `.kmp`).</span>

### `welcome.htm`
- <span style="color:green">[ ] Exists in `source/`.</span>
- <span style="color:goldenrod">[ ] Describes how to use the keyboard (e.g. keyboard image, table, or written description like `' + a produces á (works for aAeEoO)`).</span>
- <span style="color:goldenrod">[ ] Does *not* include instructions for installing Keyman or the keyboard package — references the help URLs at https://help.keyman.com/products/ instead. _(Ref: [PR #3950](https://github.com/keymanapp/keyboards/pull/3950) — `mara`: Lorna asked author to remove `INSTALL.md` and reference the help pages.)_</span>
- <span style="color:green">[ ] The `<html lang="...">` attribute matches the keyboard's primary BCP47 language tag (e.g. `<html lang="mnw">` for a Mon keyboard). _(Ref: [PR #3962](https://github.com/keymanapp/keyboards/pull/3962) inline review on `mon_k_nemin/source/welcome/welcome.htm`.)_</span>
- <span style="color:goldenrod">[ ] Content is not political or self-promoting.</span>

## 7. Keyboard source (`.kpj` → Keyboards tab → `.kmn`)

- <span style="color:green">[ ] `.kmn` version matches `HISTORY.md`.</span>
- <span style="color:green">[ ] `.kmn` `targets` line uses `any` alone when `any` covers all platforms — does not list individual targets alongside `any`. _(Ref: [PR #3986](https://github.com/keymanapp/keyboards/pull/3986) — `mising`: Lorna: "make sure the targets is just `any`. Don't include the other targets since `any` covers them all.")_</span>
- <span style="color:green">[ ] `.kmn` `targets` list does not include `mobile` (or other platforms) for which no actual touch-layout / platform support exists in the keyboard. _(Ref: [PR #3737](https://github.com/keymanapp/keyboards/pull/3737) — `wyandot`: Lorna silently changed target `mobile` → `web` with the note "There is no mobile keyboard yet".)_</span>
- <span style="color:green">[ ] Modifier-key names are consistent across `.kmn`, `.kvks`, and `.keyman-touch-layout` — e.g. if the `.kmn` uses `RALT`, the `.kvks` is `RALT` and the touch layout is `rightalt`, not a mix of `ALT` / `alt` in some files. _(Ref: [PR #3733](https://github.com/keymanapp/keyboards/pull/3733) — `linear_b_full_syllabary`; [PR #3638](https://github.com/keymanapp/keyboards/pull/3638) — `sisaali`: Lorna silently changed `ALT → RALT` across all source files.)_</span>
- <span style="color:green">[ ] If the keyboard uses `RALT` (right-alt / AltGr), the `.kvks` includes the `usealtgr` tag. _(Ref: [PR #3638](https://github.com/keymanapp/keyboards/pull/3638) — `sisaali`: Lorna silently added the `usealtgr` tag to the `.kvks` after converting `ALT → RALT`.)_</span>
- <span style="color:green">[ ] Keyboard compiles locally with no errors **and no warnings** — e.g. "store-not-defined" or "character-not-in-store" warnings should be resolved. _(Ref: [PR #3519](https://github.com/keymanapp/keyboards/pull/3519) — `burushaski_girminas`: Lorna silently updated a store with the note "eliminate warning messages about stores".)_</span>
- <span style="color:goldenrod">[ ] Keyboard's display name (the human-readable name inside `.kmn`/`.kps`, not the folder ID) does not contain underscores from the ID — it should be a readable phrase like `Dazaga Gourane Karra`, not `dazaga_gourane_karra`. _(Ref: [PR #3530](https://github.com/keymanapp/keyboards/pull/3530) — `dazaga_gourane_karra`: Lorna silently changed the display name with the note "Change keyboard name to not use the ID with underscores".)_</span>
- <span style="color:goldenrod">[ ] RTL flag in `.kmn` / `.kps` matches the script's actual writing direction (don't set RTL on a left-to-right script). _(Ref: [PR #3440](https://github.com/keymanapp/keyboards/pull/3440) — `cantonese_telex`: Lorna silently deleted the RTL header from `.kmn` and `.kps`.)_</span>
- <span style="color:green">[ ] `store(&BITMAP)` references the actual keyboard `.ico` for this keyboard — not a placeholder like `qaa.ico` left over from a template. _(Ref: [PR #3970](https://github.com/keymanapp/keyboards/pull/3970) inline review on `poorigbelle.kmn` — Darcy flagged BITMAP pointing to template icon.)_</span>
- <span style="color:green">[ ] All `.kmn` string-literal stores (`&MESSAGE`, `&COPYRIGHT`, etc.) have balanced quotes and valid syntax — the keyboard compiles cleanly. _(Ref: [PR #3970](https://github.com/keymanapp/keyboards/pull/3970) — `store(&MESSAGE)` had an unbalanced quote; [PR #3950](https://github.com/keymanapp/keyboards/pull/3950) — `mara` had an invalid `Author` statement.)_</span>
- <span style="color:green">[ ] Author name belongs in the `.kps`, not in a `.kmn` `Author` store (use `&MESSAGE` for end-user-visible text). _(Ref: [PR #3950](https://github.com/keymanapp/keyboards/pull/3950) `mara`.)_</span>
- <span style="color:green">[ ] If keyboard uses PUA characters, it is in `experimental/` (not `release/`).</span>
- <span style="color:goldenrod">[ ] If keyboard uses PUA characters, documentation explicitly states the characters / script are not in Unicode.</span>
- <span style="color:green">[ ] If the keyboard ships a PUA-encoded font (e.g. `KbdKhmr.ttf`, `KbdArab.ttf`), the `.kmn` includes `store(&DISPLAYMAP) '<path-to>/<fontbase>.json'` so the display map is compiled into the `.kmx`. _(Ref: [PR #3964](https://github.com/keymanapp/keyboards/pull/3964) — `khmer_traditional`: Lorna required `store(&DISPLAYMAP) '../../../shared/fonts/kbd/kbdkhmr/KbdKhmr.json'`.)_</span>
- <span style="color:goldenrod">[ ] OSK has been reviewed (rules, output characters, layout consistent with stated language coverage).</span>
- <span style="color:green">[ ] The `.kvks` (on-screen keyboard layout) is populated — not blank. Even if the layout matches a standard keyboard, the keys must be imported so users don't see blank labels. _(Ref: [PR #3986](https://github.com/keymanapp/keyboards/pull/3986) — `mising`: ".kvks file needs you to import the layout (right now it's blank). Even if it's the same as the standard keyboard, if you leave it blank the keys will also be blank".)_</span>
- <span style="color:goldenrod">[ ] If a special font is needed to display the output characters, an appropriate font is selected in the OSK.</span>
- <span style="color:goldenrod">[ ] Touch layout reviewed (layers, output, fingering).</span>
- <span style="color:green">[ ] If both phone and tablet layouts exist and are identical, removal of one was requested.</span>
- <span style="color:green">[ ] Same font is selected for phone and tablet layouts.</span>
- <span style="color:green">[ ] Keyboard compiles locally with no errors. _(Ref: [PR #3994](https://github.com/keymanapp/keyboards/pull/3994) — Zou: "Your keyboard doesn't build"; [PR #3991](https://github.com/keymanapp/keyboards/pull/3991) — `sil_senegal_bsc_azerty` had build errors.)_</span>

## 8. Package contents (`.kps` → Packaging tab → Files)

### Must be included
- <span style="color:green">[ ] Compiled `.kmx` (from `.kmn` + `.ico` or `.bmp`).</span>
- <span style="color:green">[ ] Compiled `.kvk` (from `.kvks`).</span>
- <span style="color:green">[ ] Compiled `.js` (from `.keyman-touch-layout`) — only if a mobile layout exists.</span>
- <span style="color:green">[ ] `LICENSE.md`.</span>
- <span style="color:green">[ ] `readme.htm`.</span>
- <span style="color:green">[ ] `welcome.htm` and any associated graphics referenced from it.</span>
- <span style="color:green">[ ] All required fonts (preferably referenced from `shared/fonts`), with all typefaces (Regular + others), not just Regular.</span>

### Must NOT be included
- <span style="color:green">[ ] No `.php` help file.</span>
- <span style="color:green">[ ] No files from the `help/` folder.</span>
- <span style="color:green">[ ] No uncompiled sources: `.kmn`, `.ico`, `.kvks`, `.keyman-touch-layout`, `.kps`.</span>
- <span style="color:green">[ ] No font display-map `.json` files (e.g. `KbdKhmr.json`) — these are compiled into the `.kmx` via `store(&DISPLAYMAP)` in the `.kmn`. _(Ref: [PR #3964](https://github.com/keymanapp/keyboards/pull/3964) — `khmer_traditional`.)_</span>
- <span style="color:green">[ ] No industry fonts (Arial, Times, Tahoma, etc.).</span>

### Compiled-file/target consistency
- <span style="color:green">[ ] Targets declared in `.kmn` match the compiled files listed in the `.kps`.</span>

## 9. Font licensing

- <span style="color:green">[ ] Every bundled font has a license field that is non-empty. _(Ref: [PR #3964](https://github.com/keymanapp/keyboards/pull/3964) — `khmer_traditional`: "These fonts have an empty license field" → rejected.)_</span>
- <span style="color:green">[ ] License identifier matches a known Open license (OFL, GPL, LGPL, MIT, Apache, CC-BY, CC-BY-SA, etc.). _(Ref: [PR #3964](https://github.com/keymanapp/keyboards/pull/3964) — Lorna: "They need to be licensed under OFL, GPL, MIT, or Apache would be okay. It cannot say freeware".)_</span>
- <span style="color:goldenrod">[ ] License text/spirit is genuinely Open — not just labeled "free to everyone" or "freeware" in free-form text.</span>
- <span style="color:green">[ ] If the font is used by more than one keyboard, it lives under `shared/fonts` (not in the keyboard's local folder).</span>
- <span style="color:goldenrod">[ ] Shared font path points to the **current/newest** shared-fonts location, not a deprecated duplicate (e.g. `shared/fonts/sil/busra`, not legacy `shared/fonts/khmer/khmerbusra`). _(Ref: [PR #3964](https://github.com/keymanapp/keyboards/pull/3964) — Lorna directed Meng-Heng to the newer `sil/busra` path.)_</span>
- <span style="color:green">[ ] No `.woff` / web-only font formats in keyboard packages — packages should ship `.ttf` (or `.otf`). _(Ref: [PR #3632](https://github.com/keymanapp/keyboards/pull/3632) — `gff_amh_7`: Lorna silently removed a `.woff` font with the note "We should not include woff fonts in keyboard packages".)_</span>
- <span style="color:goldenrod">[ ] If approving an experimental keyboard that ships a font (e.g. PUA), the font has also been submitted to `s.keyman.com`.</span>

## 10. Package metadata (`.kps`)

### Keyboards tab
- <span style="color:green">[ ] Font is selected (if a font is included in Files). _(Ref: [PR #3964](https://github.com/keymanapp/keyboards/pull/3964) — `khmer_traditional`: "the font isn't selected in the .kps in the Keyboards tab".)_</span>
- <span style="color:green">[ ] Language tag(s) are selected (mandatory for touch layout installation).</span>
- <span style="color:goldenrod">[ ] Tags are minimal (no unnecessary script/region subtags).</span>
- <span style="color:goldenrod">[ ] If the tag is new/unusual, flagged for possible submission to langtags / Ethnologue.</span>
- <span style="color:goldenrod">[ ] If keyboard is for a conlang, flagged for special review.</span>
- <span style="color:green">[ ] If the tag includes numeric regional codes, flagged for special review.</span>

### Details tab
- <span style="color:green">[ ] `readme.htm`, `welcome.htm`, and `LICENSE.md` are selected — in particular the **License file** field on Details points to `LICENSE.md`. If missing, the build fails with `KM0900A: No license for the keyboard was found.` _(Ref: [PR #3991](https://github.com/keymanapp/keyboards/pull/3991) — `sil_senegal_bsc_azerty`: build emitted `KM0900A`.)_</span>
- <span style="color:green">[ ] "Follow keyboard version" is selected.</span>
- <span style="color:green">[ ] Description field is present (non-empty). _(Ref: [PR #3991](https://github.com/keymanapp/keyboards/pull/3991) — Lorna: "the description disappeared from the .kps in your last commit".)_</span>
- <span style="color:goldenrod">[ ] Description is meaningful (this becomes the keyboard home page content).</span>
- <span style="color:goldenrod">[ ] No spelling errors in user-facing `.kps` text fields (Description, Author name, WebSite text). _(Ref: [PR #3977](https://github.com/keymanapp/keyboards/pull/3977) — `cantonese_telex`: Lorna silently fixed `Unversial` → `Universal` in the Description with the commit message "Fix spelling for Universal".)_</span>

## 11. Online help (`source/help/<name>.php`)

- <span style="color:green">[ ] File exists and has the proper PHP header.</span>
- <span style="color:green">[ ] If using OSK syntax, all desktop *and* mobile layers are selected (cross-check against OSK and touch layout code).</span>
- <span style="color:green">[ ] All style information is inside the PHP header, not outside it. _(Ref: [PR #3986](https://github.com/keymanapp/keyboards/pull/3986) — `mising`: Lorna directed author to the `sil_cheyenne.php` template.)_</span>
- <span style="color:green">[ ] `.php` does **not** contain closing `</body>` or `</html>` tags — the PHP template wraps the body content. _(Ref: [PR #3877](https://github.com/keymanapp/keyboards/pull/3877) — `manchu_cyrillic`: Lorna silently removed closing `body`/`html` tags with the note "Remove closing body and html tags".)_</span>
- <span style="color:goldenrod">[ ] HTML in `welcome.htm` and the help `.php` is well-formed — balanced tags, properly-formed headings (`<h1>`/`<h2>` open and close), no unclosed/swapped paragraph tags. _(Ref: [PR #3782](https://github.com/keymanapp/keyboards/pull/3782) `soninke_n_ti` "Fix h2 tag to be properly formed"; [PR #3739](https://github.com/keymanapp/keyboards/pull/3739) `hoisan` "Clean up html (using closing paragraphs rather than opening ones)"; [PR #3745](https://github.com/keymanapp/keyboards/pull/3745) `cantonese_telex` "Clean up html, especially fixing end tags"; [PR #3786](https://github.com/keymanapp/keyboards/pull/3786) `tfnalgonquin` "Fix h2 header" / "Fix h1 and paragraphs".)_</span>
- <span style="color:green">[ ] `.php` `osk` `data-states` list every layer that the `.kmn` / touch layout defines (e.g. if a `rightalt-shift` layer was added, the `data-states` includes it). _(Ref: [PR #3742](https://github.com/keymanapp/keyboards/pull/3742) — `german_enhanced`: Lorna silently added `rightalt-shift` to the `.php` osk with the note "Add rightalt-shift layer to display new character on that layer"; [PR #3638](https://github.com/keymanapp/keyboards/pull/3638) — `sisaali`: "Add rightalt layers into OSK".)_</span>
- <span style="color:green">[ ] `.php` `pagename` follows the standard format expected by the help-site table of contents (used to group / order entries on help.keyman.com). _(Ref: [PRs #3582](https://github.com/keymanapp/keyboards/pull/3582), [#3583](https://github.com/keymanapp/keyboards/pull/3583) — `devanagari_kagapa_phonetic` / `modi_kagapa_phonetic`: Lorna silently adjusted `pagename` with the note "follow our standard for the sake of consistency in the help page table of contents".)_</span>
- <span style="color:goldenrod">[ ] OSK keyboard graphics either use the Keyman-generated form (`<div id='osk' data-states='...'></div>` and `<div id='osk-phone' data-states='...'></div>`) **or** custom images are constrained (e.g. `width="720"`) so they don't overflow the online help page. _(Ref: [PR #3962](https://github.com/keymanapp/keyboards/pull/3962) inline review on `mon_k_nemin.php` — Darcy: "the screenshots for each layer are large and getting cut off".)_</span>
- <span style="color:green">[ ] **Cross-file body parity:** the rendered browser output of `welcome.htm` and `source/help/<name>.php` is byte-for-byte identical after (a) stripping the page headers (the `.htm` `<head>...</head>` and the `.php` PHP-header block) and (b) normalizing non-rendering whitespace (collapsed runs of spaces/newlines outside `<pre>` / `white-space: pre`). Any other difference means an author updated one file and forgot the other — the bundled help and the online help will disagree. _(Same check applies to any other `<name>.htm` in `source/` that has a `<name>.php` counterpart in `source/help/`.)_</span>
- <span style="color:green">[ ] **Cross-file style parity:** the CSS that styles the `.htm` body (inline `<style>`, linked stylesheets, and any same-named `.css` next to the file) and the CSS that styles the `.php` body (the `$pagestyle` block in the PHP header, plus any linked or same-named stylesheets) are byte-for-byte identical, modulo non-rendering whitespace. Equivalent rules in different syntax (e.g. `color: red` vs `color: #f00`) are not accepted — the author must pick one form and use it in both places. The intended UX is a side-by-side diff where the author merges differences until the two sides match. Applies to any matched `<name>.htm` / `<name>.php` pair and their referenced stylesheets.</span>
  - Reference: https://help.keyman.com/developer/keyboards/phphelpfile

## 12. Language tagging (BCP47)

- <span style="color:goldenrod">[ ] BCP47 tag is correct for the language/script.</span>
- <span style="color:green">[ ] No ISO 639-5 (collective language) codes used.</span>
- <span style="color:green">[ ] No numeric regional codes used unless explicitly contrastive (e.g. `nan-Latn-035` vs another `nan-Latn`).</span>
- <span style="color:green">[ ] `001` is never used.</span>
- <span style="color:goldenrod">[ ] If a language uses a different script in this keyboard than what's currently in langtags, the mismatch is flagged.</span>
- <span style="color:goldenrod">[ ] The flagged script mismatch has actually been submitted to langtags.</span>

## 13. Encoding / script issues

- <span style="color:green">[ ] PUA codepoint use → keyboard is in `experimental/`.</span>
- <span style="color:goldenrod">[ ] PUA codepoint use → explicit PUA notices appear in `readme.htm`, `welcome.htm`, `.php` help, and `.kps` description.</span>
- <span style="color:goldenrod">[ ] Keyboard does not reuse existing codepoints for unencoded scripts (e.g. unrelated characters on Arabic codepoints); if it does, warnings equivalent to PUA notices are in place.</span>
- <span style="color:green">[ ] No mathematical Latin look-alike characters (U+1D400–U+1D7FF) in keyboard output.</span>
- <span style="color:goldenrod">[ ] If math-Latin or other Latin look-alikes *are* present, the use case does not look like spoofing.</span>

## 14. Authorship / change provenance

- <span style="color:red">[ ] If a third party (not the original author) submits a patch to an existing keyboard, original author was consulted / approved — especially for non-trivial changes.</span>

## 15. Deprecating a keyboard

When deprecating a `legacy/` keyboard in favor of a new one in `release/`:

- <span style="color:red">[ ] Original author has granted permission to relicense under MIT.</span>
- <span style="color:green">[ ] New keyboard has been created in `release/` (renamed if needed to fit naming conventions).</span>
- <span style="color:green">[ ] In the new keyboard's `.kps` → Details → **Related packages / Add**, the legacy package ID is listed and marked **Deprecated**.</span>
- <span style="color:green">[ ] A `DEPRECATED.md` file has been created in the legacy keyboard's folder, naming the replacement (e.g. `This keyboard has been deprecated and replaced by release/<org>/<new_keyboard_id>`).</span>
- <span style="color:green">[ ] The deprecated keyboard's help `.php` title includes " (deprecated)" so users searching the help site can distinguish it from the replacement. _(Ref: [PR #3883](https://github.com/keymanapp/keyboards/pull/3883) — `lao_on_thai_layout`: Lorna silently appended "(deprecated)" to the old keyboard's help title with the note "Adding ' (deprecated) ' to the old keyboard help file helps it not be confused with the new one".)_</span>

## 16. Partner-organization packages

When the keyboard is part of a partner-organization bundle:

- <span style="color:goldenrod">[ ] Partner package's "note for keyboard maintainers" (in its folder under `release/packages/`) has been followed.</span>
- <span style="color:green">[ ] Keyboard version has been updated in the partner's `keyboards.csv` under `oem/` (for the iOS app).</span>

## 17. Build trigger

- [ ] All above checks have passed (meta-criterion over everything above).
- <span style="color:goldenrod">[ ] Author has resolved all PR comments before triggering a build on Team City.</span>
- <span style="color:red">[ ] For a new author's first PR: PR was pulled locally and checked thoroughly (not only online review).</span>
- <span style="color:goldenrod">[ ] After the build runs, any issues it catches that local review missed (e.g. `LICENSE.md` copyright format, `LICENSE.md` missing from `.kps`) were fed back to the author.</span>

## 18. Design heuristics (DISCUS)

_(Section 18 covers DISCUS design heuristics enforced by the survey flow; those entries appear in `criteria.json` only and are not part of the PR review checklist.)_

## 19. Import output

Applies to keyboards adapted from an existing `release/` keyboard via the v1.1.0 import feature. This check is a mechanical green-criterion — auto-enforced by the keyboard-studio output service at PR submission time.

- <span style="color:green">[ ] PR body includes the attribution block: adapted-from path, commit SHA, round-trip status, and opaque feature inventory.</span>

- <span style="color:green">[ ] `HISTORY.md` contains an "Adapted from `<sourcePath>`" bullet under the 1.0 entry (mandatory D14 carrier, auto-enforced by the scaffolder).</span>
