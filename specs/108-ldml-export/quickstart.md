# Quickstart: validating the LDML export

The commands that prove spec 108 works, and what green looks like. Harness details are in
[contracts/test-harnesses.md](contracts/test-harnesses.md).

## Prerequisites

- Node ≥ 22.19.0, pnpm 9, `pnpm install` at the repo root, and `pnpm build`, which runs
  `prebuild`.
- `../keyboards` checked out at the `keyboard-studio/keyboards` fork's `master`. It is needed by
  the corpus suites only.
- No Keyman install is needed. The compiler, schema and XSD validators are pinned
  devDependencies.

## 1. Unit and contract checks (no corpus)

```
pnpm --filter @keyboard-studio/engine test -- ldml-export
```

Green means:

- the profile contract-parity test passes: every row and code in both contract files exists in the
  profile tables;
- FR-065 holds both ways: `46` is compilable and `49` is TR35-only;
- the classifier, lowering, serializer and report unit tests pass;
- the TR35-checker negative tests pass;
- the determinism test (H8) passes;
- `browser-bundle-safety.test.ts` passes.

## 2. Corpus checks

```
pnpm --filter @keyboard-studio/engine exec vitest run -c vitest.corpus.config.ts ldml-export
```

Green means:

- **H1**: profile-46 exports compile with Keyman, and the error set equals the K-row set (empty
  for hardware-only keyboards);
- **H2**: the export is valid against Keyman's schema (profile 46);
- **H3**: the export is valid against the CLDR XSD (both profiles);
- **H4**: every touch form conforms to TR35;
- **H5**: no unexplained keystroke mismatch. The run prints `[OK] <keyboard> <n> sequences`, or
  `[FAIL] …` with the keys and both outputs;
- **H9**: `ibono_chwerty` matches its hand-written XML on every shared position;
- **H10**: the export takes under 2 s.

## 3. Two-path parity (studio)

```
pnpm --filter @keyboard-studio/studio exec vitest run -c vitest.corpus.config.ts ldmlParity
```

Green means the authoring-time findings and the download report have the same A/N site keys for
every corpus working copy (SC-005).

## 4. In the app

1. `pnpm dev`, then pick or import a keyboard that uses `if(&opt = '1')` rules and
   `begin PostKeystroke`, for example the option-store corpus keyboard named in the harness
   contract.
2. **Authoring time (Story 2)**:
   - The `rules` step badges LDML codes, counted once per code.
   - The `touch` step shows `NO_KEY_TRIGGER`.
   - The `.kmp` and `.zip` downloads stay enabled.
3. **Output page (Story 1)**:
   - The LDML panel shows a profile picker with `46` preselected and labelled as compilable by
     Keyman, and `49` labelled "TR35-only (awaiting Keyman)".
   - Its findings list is grouped by code.
   - "Download LDML" saves `<id>-<version>-ldml.zip`.
4. Unzip it and check:
   - it contains `<id>.kpj`, `source/<id>.xml`, `source/<id>.kps`, the docs, and
     `LDML-EXPORT-REPORT.md`;
   - there is no `NEXT_STEPS.md`;
   - the report names the profile, the base keyboard and every option-guarded rule by line.
5. Download again without changes. The two zips must be identical (`certutil -hashfile` or
   `sha256sum`).
6. Switch the interface to French and download again. The zip is still identical.
7. Switch to profile `49` and download. Check `conformsTo="49"` and `info/@attribution`, and
   that the report's "Version change" section lists rows 4.10 and 3.7/3.8.
8. Optionally, with Keyman Developer installed, run `kmc build <id>.kpj` on the extracted
   profile-46 project. It builds with zero errors (Story 3).

## 5. Story 5 (only after the FR-070 trial passes)

Use the Phase 7 Playwright spec, which builds the production bundle, runs a profile-46 compile
in the browser, and compares its messages with H1's. Its result and the bundle-size cost are
recorded in [research.md](research.md) R29.
