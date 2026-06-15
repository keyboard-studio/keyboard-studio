# Week-1 Smoke Run — Real Keyman Developer E2E

**Issue:** #54 — Day-7 buffer: E2E smoke test with real Keyman Developer (S-09)
**Goal:** Take a studio-produced output zip, open + build it in Keyman Developer 17+ on Windows, install it, type a short sequence — catch anything the in-browser oracle (kmcmplib WASM + KeymanWeb `simulate()`) missed.

> **Partly machine-confirmed, partly human-run.** The **build** half (AC #1/#2) has been run against the real `kmc` 19.0 command-line compiler — results are recorded under "Confirmed KD build evidence". The **install + typing** half (AC #3/#5) still requires a person on Windows with the KD GUI, and the go/no-go (final section) is a project-leadership decision recorded on the project board.

---

## Artifact under test

The studio's **Download .zip** button is wired to the engine `toZip` pipeline ([PreviewShell.tsx:354](../packages/studio/src/components/PreviewShell.tsx#L354)), so the studio can already emit this artifact interactively. This smoke run uses a scripted generator instead — [utilities/smoke-artifact/gen.ts](../utilities/smoke-artifact/gen.ts) — for a **reproducible** artifact from a **known, pinned base** with no browser in the loop, driving the **same** pipeline the button does:

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
| Built against | `main` @ `6f3d428` |
| Studio commit | `6f3d428` (2026-06-15) |
| Compiler used | Keyman Developer `kmc` **19.0.240-alpha** (≥ KD 17 requirement) |

> **Why `akan`, not the issue's `khmer_angkor` / `sil_euro_latin`?** Under #351 the scaffolder routes the base `.kmn` through the codec (`parse → emit`), and the codec cannot parse either named base — `sil_euro_latin` uses a `$keymanweb:` conditional directive (a genuine, v1-out-of-scope codec feature gap) and `khmer_angkor` hits a tokenizer continuation bug (#365), both of which throw `Malformed rule`. `akan` is one of the ~360 codec-"clean" release keyboards (per the supportability scanner), so it scaffolds. See Pre-flight finding #3.

---

## Pre-flight findings (verified against `main` @ `6f3d428`, before KD)

Regenerating the artifact on current `main` surfaced two scaffolder defects **before** opening KD; both were then **confirmed against the real `kmc` 19.0 compiler** (see "Confirmed KD build evidence" below).

1. **[build failure — #364, now partial] Scaffolder leaves the `&BITMAP` file-reference store stale after rename.** `renameFilesInVfs` ([scaffolder/index.ts:107](../packages/engine/src/scaffolder/index.ts#L107)) renames `source/<baseId>.ico` / `.kvks` / `.keyman-touch-layout` to `<keyboardId>.*` whenever those id-named siblings exist, while `rewriteSiblingPathStores` ([scaffold-ir.ts:122](../packages/engine/src/scaffolder/scaffold-ir.ts#L122)) rewrites the matching stores. As of `6f3d428` it rewrites `&VISUALKEYBOARD` / `&LAYOUTFILE` / `&KMW_EMBEDCSS` / `&KMW_EMBEDJS` / `&KMW_HELPFILE` — but **intentionally skips `&BITMAP`** (icons are "usually not base-id-named", e.g. `Cameroon.ico`). akan is the counter-case: its icon **is** id-named (`akan.ico`), so the file is renamed to `e2e_smoke_akan.ico` while the store still reads `akan.ico`. Confirmed in the emitted `e2e_smoke_akan.kmn`:
   - `store(&BITMAP) 'akan.ico'` → actual file `e2e_smoke_akan.ico` **(stale — build fails here)**
   - `store(&VISUALKEYBOARD) 'e2e_smoke_akan.kvks'` → correct ✓ (was stale before #364's partial fix)
   - `store(&LAYOUTFILE) 'e2e_smoke_akan.keyman-touch-layout'` → correct ✓

   Tracked under **#364** (still open). The remaining gap is the `renameFilesInVfs` ↔ `rewriteSiblingPathStores` tension: the rename pass renames id-named `.ico` files, but the store-rewrite pass deliberately won't touch `&BITMAP`. A complete fix either rewrites `&BITMAP` when the icon was in fact renamed, or stops renaming id-named icons.

2. **[package build failure — #416] Scaffolded `.kps` is an empty stub.** Past the `&BITMAP` ref, the `.kmn` compiles clean but the **package** step fails KM04021 because the scaffolder emits `<Package><Info/><Files/></Package>` ([index.ts:237](../packages/engine/src/scaffolder/index.ts#L237)) — no version, no `<FollowKeyboardVersion/>`, no files. Filed as **#416**. Blocks `.kmp` production and install (AC #5).

   > **Interaction noted in KD:** the scaffolded `.kpj` is retained under the *base* id (`akan.kpj`, not `e2e_smoke_akan.kpj`). This did **not** mask either defect — `kmc` errored hard on `&BITMAP` regardless.

3. **[scaffold failure on codec gaps] #351 routes scaffold through the codec, which can't parse many real keyboards.** `scaffold()` now does `parse → scaffoldIR → emit` ([index.ts:257](../packages/engine/src/scaffolder/index.ts#L257)); the `parse()` result is not guarded by a try/catch, so a codec parse error propagates to the caller and rejects the whole scaffold. Both of the issue's named bases fail, for **two different reasons**:
   - `sil_euro_latin` → `Malformed rule … $keymanweb: store(&CasedKeys) …` — a **genuine codec feature gap**: the `$keymanweb:` conditional-compilation directive is not recognized (v1-out-of-scope).
   - `khmer_angkor` → `Malformed rule at line 117 … [RALT K_EQUAL] [RALT K_3] …` — **not** a RALT-context problem (single-modifier vkeys parse fine). The real cause is a **tokenizer bug** (#365): physical line 116 ends with `\` + trailing whitespace, so the continuation is not joined and line 117 tokenizes as an orphaned, malformed rule.

   This affects every base the codec can't parse — the supportability scanner counted **77 ParseFailures** + 408 round-trip-divergent of 912. Relates to codec `bug` #349. `akan` was chosen as a codec-clean base so this run can proceed.

4. **[zip hygiene — moot for this run] Khmer shared-font path traversal.** `khmer_angkor.kmn` references `../../../shared/fonts/…`, which serialises as a `..` zip entry some tools reject. Khmer can't be scaffolded under #351 anyway (finding #3), so it is not the artifact; noted for whenever khmer becomes scaffoldable.

---

## Confirmed KD build evidence (`kmc` 19.0.240-alpha, `main` @ `6f3d428`)

The pre-flight findings above were checked against the real Keyman Developer command-line compiler — not just predicted. This covers the build half of the smoke run (AC #1 / AC #2); the install + 5-keystroke typing half (AC #3 / #5) still requires a person on Windows once #364 and #416 land.

**Run 1 — artifact as generated.** `kmc build akan.kpj` over the extracted `e2e_smoke_akan.zip`:

```
akan.kpj - info KM05002: Building akan.kpj
e2e_smoke_akan.kmn - info KM05002: Building source/e2e_smoke_akan.kmn
e2e_smoke_akan.kmn:6 - error KM02031: Cannot open the bitmap or icon file for reading
e2e_smoke_akan.kmn - info KM05007: source/e2e_smoke_akan.kmn failed to build.
akan.kpj - info KM0500C: Project akan.kpj failed to build.
```

Line 6 is `store(&BITMAP) 'akan.ico'` — confirms finding #1 (#364) against the real compiler. The `.kpj`-naming concern did **not** mask it.

**Run 2 — `&BITMAP` ref patched to `e2e_smoke_akan.ico`** (simulating #364's fix, to expose what's behind it):

```
e2e_smoke_akan.kmn - info KM05006: source/e2e_smoke_akan.kmn built successfully.
e2e_smoke_akan.kps - error KM04021: Package version is not following keyboard version, but the package version field is blank.
e2e_smoke_akan.kps - info KM05007: source/e2e_smoke_akan.kps failed to build.
```

The keyboard itself **compiles cleanly** and emits `build/e2e_smoke_akan.kmx` + `build/e2e_smoke_akan.kvk`. The build then dies on the stub `.kps` — confirms finding #2 (#416). So the two scaffolder defects are sequential build blockers: fix #364 → hit #416.

**Net:** AC #1 (opens in KD) ✓ — `kmc` opens the auto-discovery `.kpj` and builds its members. AC #2 (zero-error build) ✗ — blocked on #364 then #416; both filed as follow-ups per AC #4. The `.kmn` compilation path itself is sound.

---

## Prerequisites

- [ ] Keyman Developer **17 or later** installed on Windows
- [ ] The artifact zip extracted to a working folder
- [ ] A scratch text field for typing (Notepad, WordPad, browser textbox)

---

## Smoke-Run Steps

1. - [ ] Extract `e2e_smoke_akan.zip`. Confirm it expands without errors and contains `source/e2e_smoke_akan.kmn` plus its sibling files under `source/`, with the `.kpj` and `NEXT_STEPS.md` at the zip root.
2. - [ ] In Keyman Developer, **Open Project** → the `.kpj` in the extracted folder. _(It is a v2.0 auto-discovery project, so KD finds `source/*.kmn` regardless of the `.kpj` filename.)_ — **AC #1: opens cleanly.**
3. - [ ] **Build** the project. — **AC #2.** _Already exercised with `kmc` 19.0 (see "Confirmed KD build evidence"): the build **fails first on `&BITMAP`** (#364, `KM02031`), and once that ref is fixed it **fails next on the stub `.kps`** (#416, `KM04021`). Re-confirm in the KD **GUI** and log any divergence. Outcomes:_
       - _**Build fails on `&BITMAP` (`KM02031`)** → expected (#364); log it and treat AC #2 as **blocked on #364 → #416**, then stop (cannot proceed to install)._
       - _**Build fails on the `.kps` (`KM04021`)** → expected next blocker (#416); also blocks install._
       - _**Build passes** → a divergence from the CLI result; verify store filenames + `.kps` contents and record it under Discrepancies._
       - _**Any other error** → a new regression; log it under Discrepancies._
4. - [ ] If build succeeds: **Install** the produced `.kmp`/keyboard into Windows. — **AC #5: installs without error.**
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

| # | Keystrokes | studio simulate() | real KD (`kmc` 19.0) | Severity | Issue filed |
|---|-----------|-------------------|---------|----------|-------------|
| 1 | _(build)_ | clean compile | `KM02031` — stale `&BITMAP` ref (`akan.ico` vs renamed `e2e_smoke_akan.ico`) | major | #364 — pre-flight #1 |
| 2 | _(package)_ | clean compile | `KM04021` — stub `.kps` has blank package version | major | #416 — pre-flight #2 |
|   |           |                   |         |          |             |

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
