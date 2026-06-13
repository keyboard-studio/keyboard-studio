# Week-1 Smoke Run — Real Keyman Developer E2E

**Issue:** #54 — Day-7 buffer: E2E smoke test with real Keyman Developer (S-09)
**Goal:** Take a studio-produced output zip, open + build it in Keyman Developer 17+ on Windows, install it, type a short sequence — catch anything the in-browser oracle (kmcmplib WASM + KeymanWeb `simulate()`) missed.

> **This is a human-run checklist.** Steps 1–10 require Keyman Developer on Windows and physical typing; only a person can sign them off. The go/no-go (final section) is a project-leadership decision recorded on the project board.

---

## Artifact under test

The studio download button currently emits the compiled `.js` only (see the `[LIMITATION]` note in `packages/studio/src/components/PreviewShell.tsx`); the VirtualFS `.zip` path is engine-complete (`toZip`, spec §12) but not yet wired to a UI button. To unblock this smoke run, the zip is produced by [utilities/smoke-artifact/gen.ts](../utilities/smoke-artifact/gen.ts), which drives the **same** pipeline the button eventually will:

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
| Built against | current `main` @ `8b0e9cb` (includes #351 scaffold-over-IR) |
| Studio commit | _(fill in: `git rev-parse HEAD`)_ |

> **Why `akan`, not the issue's `khmer_angkor` / `sil_euro_latin`?** Under #351 the scaffolder routes the base `.kmn` through the codec (`parse → emit`), and the codec cannot parse either named base — `sil_euro_latin` uses a `$keymanweb:` conditional directive and `khmer_angkor` uses RALT multi-key contexts, both of which throw `Malformed rule`. `akan` is one of the ~360 codec-"clean" release keyboards (per the supportability scanner), so it scaffolds. See Pre-flight finding #2.

---

## Pre-flight findings (verified against current `main` @ #351, before KD)

Regenerating the artifact on current `main` surfaced two scaffolder defects **before** opening KD. Confirm them in KD and log under Discrepancies.

1. **[build failure] Scaffolder leaves stale `.kmn` file-reference stores after rename.** `renameFilesInVfs` ([scaffolder/index.ts:61](../packages/engine/src/scaffolder/index.ts#L61)) renames `.ico` / `.kvks` / `.keyman-touch-layout` and rewrites internal refs only for `.kps`/`.kvks`; `scaffoldIR` ([scaffold-ir.ts](../packages/engine/src/scaffolder/scaffold-ir.ts)) rewrites only the **identity** stores (`&NAME` / `&COPYRIGHT` / `&VERSION`). Neither updates the `.kmn`'s file-reference stores. Confirmed in the emitted `e2e_smoke_akan.kmn`:
   - `store(&BITMAP) 'akan.ico'` → actual file `e2e_smoke_akan.ico`
   - `store(&VISUALKEYBOARD) 'akan.kvks'` → actual file `e2e_smoke_akan.kvks`
   - `store(&LAYOUTFILE) 'akan.keyman-touch-layout'` → actual file `e2e_smoke_akan.keyman-touch-layout`

   The generated `.kpj` sets `CompilerWarningsAsErrors=True`, so KD's build is expected to **error** on three missing files. `bug(scaffolder)` follow-up (file before relying on scaffolded output).

2. **[scaffold failure on codec gaps] #351 routes scaffold through the codec, which can't parse many real keyboards.** `scaffold()` now does `parse → scaffoldIR → emit` ([index.ts:257](../packages/engine/src/scaffolder/index.ts#L257)); the `parse()` is outside the try/catch, so a codec parse error rejects the whole scaffold. Both of the issue's named bases fail:
   - `sil_euro_latin` → `Malformed rule … $keymanweb: store(&CasedKeys) …` (conditional-compilation directive)
   - `khmer_angkor` → `Malformed rule … [RALT K_EQUAL] [RALT K_3] …` (RALT multi-key context)

   This affects every base the codec can't parse — the supportability scanner counted **77 ParseFailures** + 408 round-trip-divergent of 912. `bug(scaffolder)`; relates to codec `bug` #349. `akan` was chosen as a codec-clean base so this run can proceed.

3. **[zip hygiene — moot for this run] Khmer shared-font path traversal.** `khmer_angkor.kmn` references `../../../shared/fonts/…`, which serialises as a `..` zip entry some tools reject. Khmer can't be scaffolded under #351 anyway (finding #2), so it is not the artifact; noted for whenever khmer becomes scaffoldable.

---

## Prerequisites

- [ ] Keyman Developer **17 or later** installed on Windows
- [ ] The artifact zip extracted to a working folder
- [ ] A scratch text field for typing (Notepad, WordPad, browser textbox)

---

## Smoke-Run Steps

1. - [ ] Extract `e2e_smoke_akan.zip`. Confirm it expands without errors and contains `source/e2e_smoke_akan.kmn` plus siblings.
2. - [ ] In Keyman Developer, **Open Project** → the `.kpj` in the extracted folder. _(It is a v2.0 auto-discovery project, so KD finds `source/*.kmn` regardless of the `.kpj` filename.)_ — **AC #1: opens cleanly.**
3. - [ ] **Build** the project. — **AC #2: zero errors (warnings logged).** _(Per Pre-flight finding #1, expect `&BITMAP` / `&VISUALKEYBOARD` / `&LAYOUTFILE` file-not-found errors. Log the exact messages.)_
4. - [ ] If build succeeds: **Install** the produced `.kmp`/keyboard into Windows.
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

| # | Keystrokes | studio simulate() | real KD | Severity | Issue filed |
|---|-----------|-------------------|---------|----------|-------------|
| 1 | _(build)_ | clean compile | _stale `&BITMAP`/`&VISUALKEYBOARD`/`&LAYOUTFILE` refs_ | major | bug(scaffolder) — pre-flight #1 |
|   |           |                   |         |          |             |

---

## Screenshots

_(Attach: KD build output panel; installed-keyboard typing result.)_

- ![KD build output](./img/week-1-smoke-build.png)
- ![Typed output](./img/week-1-smoke-typing.png)

---

## Go / No-Go for Week 2

**AC #6 — record this decision on the project board.**

Decision criteria:

- **GO** — artifact opens in KD 17+, build succeeds (zero errors; warnings logged), installed keyboard types the expected 5-keystroke output, and any `simulate()`-vs-KD differences are minor follow-ups.
- **NO-GO** — build errors, wrong typed output, or a discrepancy serious enough to undermine trust in the in-browser oracle. Fix before week 2.

| | |
|---|---|
| **Call** | ☐ GO ☐ NO-GO |
| **Rationale** | |
| **Blocking follow-ups** | |
| **Decided by / date** | |
| **Recorded on board** | ☐ |

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
