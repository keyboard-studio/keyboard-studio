# Week-1 Smoke Run — Real Keyman Developer E2E

**Issue:** #54 — Day-7 buffer: E2E smoke test with real Keyman Developer (S-09)
**Goal:** Take a studio-produced output zip, open + build it in Keyman Developer 17+ on Windows, install it, type a short sequence — catch anything the in-browser oracle (kmcmplib WASM + KeymanWeb `simulate()`) missed.

> **Build half green; install + typing still human-run.** The **build** half (AC #1/#2) now passes against the real `kmc` 19.0 command-line compiler — a scaffolded `akan` builds end-to-end to an installable `.kmp` with zero diagnostics (see "Confirmed KD build evidence"). The two scaffolder defects that originally blocked it are fixed: **#364** (stale `&BITMAP` store, fixed in #421) and **#416** (stub `.kps`, fixed in #436). The **install + typing** half (AC #3/#5) still requires a person on Windows with the KD GUI, and the go/no-go (AC #6, final section) is a project-leadership decision recorded on the project board.

---

## Artifact under test

The studio's **Download .zip** button ([PreviewShell.tsx:383](../packages/studio/src/components/PreviewShell.tsx#L383), `handleDownload`) serialises via `serializeWorkingCopy()` → engine `toZip` ([serializeWorkingCopy.ts:151](../packages/studio/src/lib/serializeWorkingCopy.ts#L151)), so the studio can already emit this artifact interactively. This smoke run uses a scripted generator instead — [utilities/smoke-artifact/gen.ts](../utilities/smoke-artifact/gen.ts) — for a **reproducible** artifact from a **known, pinned base** with no browser in the loop, driving the **same** pipeline the button does:

```
pick base keyboard → createScaffolderService().scaffold() → toZip()
```

Regenerate with:

```sh
TSX_TSCONFIG_PATH=utilities/smoke-artifact/tsconfig.json \
  pnpm dlx tsx utilities/smoke-artifact/gen.ts --base akan --out <path>.zip
```

| Field | Value |
|-------|-------|
| Primary artifact | `e2e_smoke_akan.zip` (scaffolded from `akan`, Latin/QWERTY — a codec-clean base) |
| Engine path exercised | `scaffolder.scaffold()` (parse → scaffoldIR → emit, #351) + `output.toZip()` |
| Built against | `main` @ `f277e52` (post-#436, 2026-06-16) |
| Compiler used | Keyman Developer `kmc` **19.0.240-alpha** (≥ KD 17 requirement) |

> **Why `akan`, not the issue's `khmer_angkor` / `sil_euro_latin`?** Under #351 the scaffolder routes the base `.kmn` through the codec (`parse → emit`). Both named bases now parse — `khmer_angkor` since the #365 tokenizer fix, and `sil_euro_latin` (the codec recognises its `$keymanweb:` target-prefix directive). `akan` is used simply because it is a small, codec-clean Latin/QWERTY base that builds end-to-end to a `.kmp`. See Pre-flight finding #3.

---

## Pre-flight findings

Regenerating the artifact originally surfaced two scaffolder defects that blocked the KD build. **Both are now fixed and verified green** (history retained for the record):

1. **[RESOLVED — #364, fixed in #421] Scaffolder left the `&BITMAP` file-reference store stale after rename.** `renameFilesInVfs` renamed `source/<baseId>.ico` to `<keyboardId>.ico` when the icon was id-named (akan ships `akan.ico`), but `rewriteSiblingPathStores` deliberately skipped `&BITMAP`, so the store still read `akan.ico` while the file was `e2e_smoke_akan.ico` → `kmc` errored `KM02031`. #421 rewrites `&BITMAP` when the icon basename matches the base id; all three file-reference stores (`&BITMAP` / `&VISUALKEYBOARD` / `&LAYOUTFILE`) now resolve and the `.kmn` builds clean.

2. **[RESOLVED — #416, fixed in #436] Scaffolded `.kps` was an empty stub.** The scaffolder emitted `<Package><Info/><Files/></Package>` — no version, no `<FollowKeyboardVersion/>`, no files — so the package step failed `KM04021` (blank package version) and, behind it, `KM09010` (missing `<Info><Description>`). #436 emits a buildable `.kps` (`<FollowKeyboardVersion/>`, a non-empty `<Description>`, ≥1 language, and a `<Files>` list derived from the actual build outputs), clearing both, so the package now compiles to a `.kmp`.

3. **[codec coverage — informs base choice] #351 routes scaffold through the codec (`parse → scaffoldIR → emit`), so a base must be codec-parseable to scaffold.** Both of the issue's named bases now parse:
   - `khmer_angkor` — originally failed on a tokenizer continuation bug (#365: a `\` + trailing whitespace at line 116 wasn't joined). **#365 is fixed**, so khmer parses today; it remains a more complex base (shared-font path traversal, finding #4), so `akan` is used here for simplicity.
   - `sil_euro_latin` — parses today; the codec tokenises its `$keymanweb:` target-prefix lines (earlier doc versions reporting a `Malformed rule` throw are **stale**). The remaining limitation is semantic, not a parse failure: the codec does not yet enforce build-target *suppression* for `$keymanweb:`-scoped lines (v1-out-of-scope), so output fidelity for such keyboards isn't guaranteed.

   Corpus context (supportability scanner, refreshed): **0 ParseFailures**, 426 round-trip-divergent of 912 (relates to codec `bug` #349). `akan` is a codec-clean base that round-trips and builds, so this run proceeds.

4. **[zip hygiene — moot for this run] Khmer shared-font path traversal.** `khmer_angkor.kmn` references `../../../shared/fonts/…`, which serialises as a `..` zip entry some tools reject. khmer now parses (finding #3, #365 fixed), so this is no longer hypothetical — verify the `..` zip-entry handling whenever khmer is used as a base. `akan` (no shared-font refs) is the artifact here, so it does not arise for this run.

---

## Confirmed KD build evidence (`kmc` 19.0.240-alpha, `main` @ `f277e52`)

The build half (AC #1 / AC #2) is verified green against the real Keyman Developer command-line compiler. Regenerate the artifact and `kmc build akan.kpj` over the extracted `e2e_smoke_akan.zip`:

```
akan.kpj - info KM05002: Building akan.kpj
e2e_smoke_akan.kmn - info KM05002: Building source/e2e_smoke_akan.kmn
e2e_smoke_akan.kmn - info KM05006: source/e2e_smoke_akan.kmn built successfully.
e2e_smoke_akan.kps - info KM05002: Building source/e2e_smoke_akan.kps
e2e_smoke_akan.kps - info KM05006: source/e2e_smoke_akan.kps built successfully.
akan.kpj - info KM05002: Building akan.kpj
akan.kpj - info KM05006: akan.kpj built successfully.
akan.kpj - info KM0500B: Project akan.kpj built successfully.
```

Output: `build/e2e_smoke_akan.kmx`, `build/e2e_smoke_akan.js`, `build/e2e_smoke_akan.kvk`, and the package **`build/e2e_smoke_akan.kmp`** — **zero diagnostics** (no errors, warnings, or hints).

**History:** before #421/#436 this build failed in two stages — `KM02031` on the stale `&BITMAP` store (#364), then `KM04021` on the stub `.kps` (#416). Both are fixed; the sequence above is the current result.

**Net:** AC #1 (opens in KD) ✓ — `kmc` opens the auto-discovery `.kpj` and builds its members. **AC #2 (zero-error build) ✓** — the project builds clean to an installable `.kmp`. The install + 5-keystroke typing half (AC #3 / #5) is the remaining human-run step on Windows.

---

## Prerequisites

- [ ] Keyman Developer **17 or later** installed on Windows
- [ ] The artifact zip extracted to a working folder
- [ ] A scratch text field for typing (Notepad, WordPad, browser textbox)

---

## Smoke-Run Steps

1. - [ ] Extract `e2e_smoke_akan.zip`. Confirm it expands without errors and contains `source/e2e_smoke_akan.kmn` plus its sibling files under `source/`, with the `.kpj` and `NEXT_STEPS.md` at the zip root.
2. - [ ] In Keyman Developer, **Open Project** → the `.kpj` in the extracted folder. _(It is a v2.0 auto-discovery project, so KD finds `source/*.kmn` regardless of the `.kpj` filename.)_ — **AC #1: opens cleanly.**
3. - [ ] **Build** the project. — **AC #2.** _Verified green with `kmc` 19.0 (see "Confirmed KD build evidence"): the project builds clean to `build/e2e_smoke_akan.kmp` with zero diagnostics. Re-confirm in the KD **GUI** and log any divergence. Outcomes:_
       - _**Build succeeds, `.kmp` produced** → expected; proceed to install._
       - _**Build fails on `KM02031` (`&BITMAP`) or `KM04021` (`.kps`)** → a regression of #364 / #416; log it under Discrepancies._
       - _**Any other error/warning** → a new finding; log it under Discrepancies._
4. - [ ] **Install** the produced `.kmp` into Windows. — **AC #5: installs without error.**
5. - [ ] Pick a 5-keystroke smoke sequence and record the **expected** output from the studio preview (`simulate()`) first:

       | # | Key(s) pressed | Expected (studio simulate) |
       |---|----------------|----------------------------|
       | 1 |                |                            |
       | 2 |                |                            |
       | 3 |                |                            |
       | 4 |                |                            |
       | 5 |                |                            |

6. - [ ] Type that exact sequence with the installed keyboard in the scratch field. — **AC #3: types expected output.**
7. - [ ] Record the **actual** KD output beside the expected, and screenshot the result.

---

## Discrepancies: studio `simulate()` vs. real KD

File each row as its own follow-up issue (**AC #4 — discrepancies are follow-ups, not blockers**).

_No open build discrepancies — the build path matches `simulate()` (both produce a clean compile). The two original build failures are fixed and closed:_

| # | Keystrokes | studio simulate() | real KD (`kmc` 19.0) | Severity | Status |
|---|-----------|-------------------|---------|----------|-------------|
| 1 | _(build)_ | clean compile | ~~`KM02031` — stale `&BITMAP` ref~~ → now builds clean | major | **resolved** — #364 (#421) |
| 2 | _(package)_ | clean compile | ~~`KM04021` — stub `.kps`~~ → now builds to `.kmp` | major | **resolved** — #416 (#436) |
| _typing_ |  |  | _record here during the human-run typing step_ |  |  |

---

## Screenshots

_Attach at run time (add the files under `docs/img/` and link them here):_

- KD build output panel — `docs/img/week-1-smoke-build.png`
- Installed-keyboard typing result — `docs/img/week-1-smoke-typing.png`

---

## Go / No-Go for Week 2

**AC #6 — record this decision on the project board.**

Decision criteria:

- **GO** — artifact opens in KD 17+, build succeeds (zero errors; warnings logged), installed keyboard types the expected 5-keystroke output, and any `simulate()`-vs-KD differences are minor follow-ups.
- **NO-GO** — build errors, wrong typed output, or a discrepancy serious enough to undermine trust in the in-browser oracle. Fix before week 2.

| | |
|---|---|
| **Call** | [ ] GO  [ ] NO-GO |
| **Rationale** | |
| **Blocking follow-ups** | |
| **Decided by / date** | |
| **Recorded on board** | [ ] |

---

## Sign-Off

| Step | Result | Tester | Date |
|------|--------|--------|------|
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |
| 4 |  |  |  |
| 5 |  |  |  |
| 6 |  |  |  |
| 7 |  |  |  |
