# Week-1 Smoke Run — Real Keyman Developer E2E

**Issue:** #54 — Day-7 buffer: E2E smoke test with real Keyman Developer (S-09)
**Goal:** Take a studio-produced output zip, open + build it in Keyman Developer 17+ on Windows, install it, type a short sequence — catch anything the in-browser oracle (kmcmplib WASM + KeymanWeb `simulate()`) missed.

> **This is a human-run checklist.** Steps 1–10 require Keyman Developer on Windows and physical typing; only a person can sign them off. The go/no-go (final section) is a project-leadership decision recorded on the project board.

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
| Built against | current `main` (rebased 2026-06-13); scaffold-over-IR is #351 @ `0fb5e1a` |
| Studio commit | _fill in at run time:_ `git rev-parse HEAD` |

> **Why `akan`, not the issue's `khmer_angkor` / `sil_euro_latin`?** Under #351 the scaffolder routes the base `.kmn` through the codec (`parse → emit`), and the codec cannot parse either named base — `sil_euro_latin` uses a `$keymanweb:` conditional directive (a genuine, v1-out-of-scope codec feature gap) and `khmer_angkor` hits a tokenizer continuation bug (#365), both of which throw `Malformed rule`. `akan` is one of the ~360 codec-"clean" release keyboards (per the supportability scanner), so it scaffolds. See Pre-flight finding #2.

---

## Pre-flight findings (verified against current `main` @ #351, before KD)

Regenerating the artifact on current `main` surfaced two scaffolder defects **before** opening KD. Confirm them in KD and log under Discrepancies.

1. **[build failure] Scaffolder leaves stale `.kmn` file-reference stores after rename.** `renameFilesInVfs` ([scaffolder/index.ts:61](../packages/engine/src/scaffolder/index.ts#L61)) renames `.ico` / `.kvks` / `.keyman-touch-layout` and rewrites internal refs only for `.kps`/`.kvks`; `scaffoldIR` ([scaffold-ir.ts](../packages/engine/src/scaffolder/scaffold-ir.ts)) rewrites only the **identity** stores (`&NAME` / `&COPYRIGHT` / `&VERSION`). Neither updates the `.kmn`'s file-reference stores. Confirmed in the emitted `e2e_smoke_akan.kmn`:
   - `store(&BITMAP) 'akan.ico'` → actual file `e2e_smoke_akan.ico`
   - `store(&VISUALKEYBOARD) 'akan.kvks'` → actual file `e2e_smoke_akan.kvks`
   - `store(&LAYOUTFILE) 'akan.keyman-touch-layout'` → actual file `e2e_smoke_akan.keyman-touch-layout`

   The generated `.kpj` sets `CompilerWarningsAsErrors=True`, so KD's build is expected to **error** on three missing files. Filed as **#364**. The complete fix covers six file-reference stores (`&BITMAP`, `&VISUALKEYBOARD`, `&LAYOUTFILE`, `&KMW_HELPFILE`, `&KMW_EMBEDJS`, `&KMW_EMBEDCSS`); akan only uses the first three.

   > **Interaction to watch in KD:** the scaffolded `.kpj` is retained under the *base* id (`akan.kpj`, not `e2e_smoke_akan.kpj`), so KD's auto-discovery project may not pick up `CompilerWarningsAsErrors` from it — in which case the build can **pass** and mask this defect. If the build is clean, manually confirm the `.kmn` store filenames against the files on disk before signing off AC #2.

2. **[scaffold failure on codec gaps] #351 routes scaffold through the codec, which can't parse many real keyboards.** `scaffold()` now does `parse → scaffoldIR → emit` ([index.ts:257](../packages/engine/src/scaffolder/index.ts#L257)); the `parse()` result is not guarded by a try/catch, so a codec parse error propagates to the caller and rejects the whole scaffold. Both of the issue's named bases fail, for **two different reasons**:
   - `sil_euro_latin` → `Malformed rule … $keymanweb: store(&CasedKeys) …` — a **genuine codec feature gap**: the `$keymanweb:` conditional-compilation directive is not recognized (v1-out-of-scope).
   - `khmer_angkor` → `Malformed rule at line 117 … [RALT K_EQUAL] [RALT K_3] …` — **not** a RALT-context problem (single-modifier vkeys parse fine). The real cause is a **tokenizer bug** (#365): physical line 116 ends with `\` + trailing whitespace, so the continuation is not joined and line 117 tokenizes as an orphaned, malformed rule.

   This affects every base the codec can't parse — the supportability scanner counted **77 ParseFailures** + 408 round-trip-divergent of 912. Relates to codec `bug` #349. `akan` was chosen as a codec-clean base so this run can proceed.

3. **[zip hygiene — moot for this run] Khmer shared-font path traversal.** `khmer_angkor.kmn` references `../../../shared/fonts/…`, which serialises as a `..` zip entry some tools reject. Khmer can't be scaffolded under #351 anyway (finding #2), so it is not the artifact; noted for whenever khmer becomes scaffoldable.

---

## Prerequisites

- [ ] Keyman Developer **17 or later** installed on Windows
- [ ] The artifact zip extracted to a working folder
- [ ] A scratch text field for typing (Notepad, WordPad, browser textbox)

---

## Smoke-Run Steps

1. - [ ] Extract `e2e_smoke_akan.zip`. Confirm it expands without errors and contains `source/e2e_smoke_akan.kmn` plus its sibling files under `source/`, with the `.kpj` and `NEXT_STEPS.md` at the zip root.
2. - [ ] In Keyman Developer, **Open Project** → the `.kpj` in the extracted folder. _(It is a v2.0 auto-discovery project, so KD finds `source/*.kmn` regardless of the `.kpj` filename.)_ — **AC #1: opens cleanly.**
3. - [ ] **Build** the project. — **AC #2.** _Per Pre-flight finding #1, this build is **expected to fail** (until #364 lands) with `&BITMAP` / `&VISUALKEYBOARD` / `&LAYOUTFILE` file-not-found errors — **unless** the `.kpj`-naming interaction masks it (see finding #1). Outcomes:_
       - _**Build fails with exactly those three errors** → expected; log the messages and treat AC #2 as **blocked on #364**, then stop (cannot proceed to install)._
       - _**Build passes** → manually verify the three `.kmn` store filenames match the files on disk before accepting; record whether masking occurred._
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

| # | Keystrokes | studio simulate() | real KD | Severity | Issue filed |
|---|-----------|-------------------|---------|----------|-------------|
| 1 | _(build)_ | clean compile | _stale `&BITMAP`/`&VISUALKEYBOARD`/`&LAYOUTFILE` refs_ | major | #364 — pre-flight #1 |
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
