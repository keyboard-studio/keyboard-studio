---
description: "Task list for spec 108: LDML keyboard export"
---

# Tasks: LDML keyboard export

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: included throughout. The spec mandates them: FR-050–FR-053 and FR-065 are test
requirements, and SC-001–SC-013 are test assertions. Harness definitions are in
[contracts/test-harnesses.md](contracts/test-harnesses.md) (H1–H10).

**Paths**: `LX/` means `packages/engine/src/ldml-export/`, and `ST/` means `packages/studio/src/`.
All other paths are from the repo root.

**Authority while implementing**:

- What to classify, and what to write for each construct:
  [contracts/ldml-mapping.md](contracts/ldml-mapping.md) (profile 46) and
  [contracts/ldml-mapping-49.md](contracts/ldml-mapping-49.md).
- Function signatures: [contracts/exporter-api.md](contracts/exporter-api.md).
- Bytes: [contracts/export-package.md](contracts/export-package.md).
- Studio placement: [contracts/findings-routing.md](contracts/findings-routing.md).

A construct the contract does not list is classified N with `KM_LINT_LDML_OPAQUE` (FR-008). Never
invent a row. If a row is missing, amend the contract and `profile46.ts` in the same commit.

**Commit cadence** (CLAUDE.md):

- One commit per phase, pushed to `108-ldml-export` when the phase's gates are green. The message
  names the tasks it closes (`spec 108 T0NN-T0NN`).
- Out-of-scope repairs get their own commit.
- Check the upstream before pushing (`git rev-parse --abbrev-ref --symbolic-full-name '@{u}'`
  must print `origin/108-ldml-export`).

**Gates for every phase**: `pnpm typecheck`, `pnpm -r test`, `pnpm lint`, and the phase's own
corpus suites where named.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task serves (US1–US5)

---

## Phase 1: Setup

**Purpose**: dependencies, vendored schemas, the empty module, and test discovery.

- [x] T001 Add engine **devDependencies** to `packages/engine/package.json`, pinned exactly (no `^`): `@keymanapp/kmc-ldml` `19.0.240-alpha`, `@keymanapp/common-types` `19.0.240-alpha`, and `xmllint-wasm` at the newest version published at least two weeks before today. Run `pnpm install` and commit `pnpm-lock.yaml`. Record the chosen `xmllint-wasm` version in [research.md](research.md) R30. Confirm with `pnpm why` that kmc-ldml resolves to the same `@keymanapp/developer-utils@19.0.240-alpha` and `kmc-kmn` the engine already uses (research R18)
- [x] T002 [P] Vendor the CLDR schemas into `LX/__testing__/cldr/46/` and `LX/__testing__/cldr/49/`, each holding `ldmlKeyboard3.xsd` and `ldmlKeyboard3.dtd`:
  - 46: copy from `../keyman/resources/standards-data/ldml-keyboards/46/dtd/`;
  - 49: copy from the CLDR repository tag `release-49`, `keyboards/dtd/`;
  - write `LX/__testing__/cldr/PROVENANCE.md` with the source, the commit or tag, the copy date, and the rule "regenerate, never hand-edit".
- [x] T003 [P] Vendor two CLDR sample keyboards for harness self-tests into `LX/__testing__/fixtures/cldr-samples/`, with their provenance in the same `PROVENANCE.md`:
  - one hardware sample from `../keyman/resources/standards-data/ldml-keyboards/46/3.0/`;
  - `fr-t-k0-test.xml`, which has touch forms and the `enter` gap key.
- [x] T004 Create the module skeleton in `packages/engine/src/ldml-export/` (`LX/index.ts`, `LX/types.ts`) and wire `packages/engine/src/index.ts`:
  - `LX/index.ts` (barrel; never exports `__testing__`);
  - `LX/types.ts` with every engine type in [data-model.md](data-model.md): `CompatibilityItem`, `LdmlClassification`, `LdmlClassifyInput`, `LdmlExportInput`, `LdmlExportResult`, `LdmlBaseLayout`, `LdmlExportMetadata`, `LdmlPackageFiles`, `LdmlProfileId`, `LdmlCode` (the union of the 34 codes in the mapping contract's code table), `RowId`;
  - in `packages/engine/src/index.ts`, re-export the ldml-export public API, with a comment stating that the barrel exposes no test tooling.
- [x] T005 [P] Confirm test discovery in `packages/engine/vitest.config.ts`, `packages/engine/vitest.corpus.config.ts` and `packages/studio/vitest.corpus.config.ts`:
  - the default `packages/engine/vitest.config.ts` runs `LX/**/*.test.ts` and excludes `*.corpus.test.ts`;
  - `packages/engine/vitest.corpus.config.ts` runs `LX/**/*.corpus.test.ts`;
  - `packages/studio/vitest.corpus.config.ts` runs `ST/test/ldmlParity/*.corpus.test.ts`.

  Adjust only the `include`/`exclude` globs.
- [x] T006 [P] Add the depcruise rule `ldml-testing-not-in-product` to `.dependency-cruiser.cjs`: no file under `packages/*/src` that is not a test (`*.test.ts`) and not under `LX/__testing__/` may import `LX/__testing__/`. Severity `error`. Confirm `pnpm lint` runs it.
- [x] T089 [P] Confirm the FR-080 reuse table in [plan.md](plan.md#upstream-reuse-fr-080) against the pinned `19.0.240-alpha` packages, and record the result in [research.md](research.md) R32. (ID appended so existing IDs stay stable.)
  - Check that `@keymanapp/common-types` exports `NFDAnalyzer`, `MarkerParser.nfd_markers` and `util.isNormalized`, and that importing them passes `packages/engine/src/browser-bundle-safety.test.ts` and a Vite build of the studio. If they pass, move `common-types` from devDependencies to dependencies in `packages/engine/package.json`. If not, mark the row "exception" with the failing reason.
  - Check whether `@keymanapp/kmc-generate@19.0.240-alpha`'s `ldml-keyboard` template can run in the browser: no `fs`/`path`/`node:` imports on its path, and its templates available without disk reads. If so, add it as an engine dependency for T036/T068. If not, mark the row "exception".
  - Check that a `<special xmlns:ks="https://keyboard-studio.github.io/ns/ldml-export/1">` child of `<keyboard3>` with namespaced children passes the pinned `LDMLKeyboardXMLSourceFileReader` (schema) and the vendored CLDR 46 and 49 XSDs (T015). If either rejects it, record a K row in [contracts/ldml-mapping.md](contracts/ldml-mapping.md) and write the FR-028 record to the report only (FR-028).
  - Amend the plan's reuse table in the same commit for any row that changes.

**Checkpoint**: `pnpm --filter @keyboard-studio/engine typecheck` and
`packages/engine/src/browser-bundle-safety.test.ts` are green.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: profiles as data, the deterministic writer and zip, the position tables, and the
four harnesses, each proven on CLDR's own samples before any exporter code exists.

### Profiles (FR-060, FR-061, FR-063, FR-065, FR-066)

- [x] T007 Implement `LX/profiles/types.ts` per [data-model.md](data-model.md):
  - `TargetProfile`;
  - `ProfileRow` (`id`, `status`, `code`, `severity`, `form`, `lift`, `keymanCodes`);
  - `RowDelta`.
- [x] T008 Implement `LX/profiles/profile46.ts`. It holds **every** row of [contracts/ldml-mapping.md](contracts/ldml-mapping.md) sections 1–6, including 1.4a, 1.4b, 2.22–2.26, 3.15a, 3.15b, 3.24–3.26, 4.15 and 4.16, with:
  - status, code and severity as the tables state;
  - a short `form` summary;
  - `lift` from the "Version deltas" table for every K row and every A/N row it lists (FR-063);
  - `keymanCodes: []` for K rows 4.10 and 5.15. The export writes the conservative form, so Keyman raises nothing.

  Profile fields: `namespace` `https://schemas.unicode.org/cldr/46/keyboard3`, `tr35Revision` `CLDR 49, tr35-79 (2026-10-21)`, `keymanRelease` `19.0.240-alpha`, `keymanCompilable: true`, `isDefault: true`, `writeAttribution: false`.
- [x] T009 Implement `LX/profiles/profile49.ts` (the deltas of [contracts/ldml-mapping-49.md](contracts/ldml-mapping-49.md): row 4.10 only; set mappings are not a delta (FR-023); `keymanRelease: null`, `keymanCompilable: false`, `writeAttribution: true`) and `LX/profiles/resolve.ts`:
  - `resolveLdmlProfile(id)` applies the deltas to profile 46, deep-freezes the result, and throws on an unknown id or on a delta naming a missing row;
  - `listLdmlProfiles()` lists the profiles newest first.
- [x] T010 Write `LX/profiles/profiles.test.ts` (H7), after T007–T009. It can run in parallel with T011–T018:
  - (a) parse the first column and the code table of both contract markdown files, and assert that the set of row ids and codes equals the profile tables, both ways;
  - (b) for FR-065, both ways: read the `conformsTo` enum from `@keymanapp/common-types` `Schemas.ldmlKeyboard3`, and assert `enum.includes(id) === profile.keymanCompilable` for every profile;
  - (c) exactly one default, and it is the newest compilable profile;
  - (d) every K row has a `lift`.

### Deterministic output (FR-030)

- [x] T011 [P] Extend `packages/engine/src/output/zip.ts`: `ToZipOptions` gains `nextSteps?: boolean` (default `true`) and `fixedMtime?: Date`, which is passed to every fflate entry as `mtime`. Add to `packages/engine/src/output/zip.test.ts`:
  - default output unchanged (existing tests);
  - `nextSteps: false` omits `NEXT_STEPS.md`;
  - two calls with `fixedMtime: new Date(1980, 0, 1)` are byte-identical across a 2-second wait.
- [x] T012 [P] Define the internal document model `LdmlDocument` in `LX/xml/model.ts` over developer-utils' `LDMLKeyboard` types (type-only imports; FR-080), adding a `comment` field where FR-042 needs one and a `special` record for FR-028: keys, flicks, displays, hardware `layers`, touch `layers[]`, variables, simple and backspace transform groups, and a `comment` on the header, each group and each transform. Then implement `LX/xml/writeKeyboard3.ts`:
  - element order from the DTD content model `keyboard3 ( import*, locales?, version?, info, settings?, displays?, keys?, flicks?, forms?, layers*, variables?, transforms*, special* )`;
  - attribute order fixed per element as in [contracts/export-package.md](contracts/export-package.md);
  - XML escaping of `& < > "` and of C0 controls in attributes;
  - comment text sanitised (`--` becomes `- -`, no trailing `-`);
  - `\n` line endings, two-space indent, a trailing newline;
  - empty containers omitted.

  Test it in `LX/xml/writeKeyboard3.test.ts`.
- [x] T013 [P] Implement `LX/lower/keyIds.ts`:
  - implied ids (`a`–`z`, `A`–`Z`, `0`–`9`, `space`, `gap`) when the output matches;
  - otherwise `u` + the lowercase hex code points joined by `_`, or `m_<marker>`, or `l_<layer>`;
  - marker ids mapped injectively to `[0-9A-Za-z_]{1,32}`;
  - collisions resolved by a numeric suffix assigned after sorting the colliding sources by code point, never by traversal order;
  - every id matches `[A-Za-z0-9][A-Za-z0-9_-]*`.

  Test it in `LX/lower/keyIds.test.ts`.
- [x] T014 [P] Implement `LX/lower/positions.ts`:
  - for each hardware form `us`, `iso`, `jis` and `abnt2`, the main-block `K_*` vkey → `{row, column}` rows (research R6);
  - the frame-key set (row 2.5), the form-only key sets (`K_oE2` → iso, `K_oC1` → abnt2, `K_oE0`/`K_oE1` → jis), and `K_SPACE` → `space`.

  `LX/lower/positions.test.ts` reads `@keymanapp/developer-utils/build/src/types/import/46/scanCodes-implied.xml` and asserts, for every form, that the row count, the per-row position count, and the scan-code order match the table.

### Harnesses (test-only, `LX/__testing__/`)

- [x] T015 [P] Implement `LX/__testing__/xsdValidate.ts` (H3): `validateAgainstCldr(xml, conformsTo)` removes the default `xmlns` attribute, runs `xmllint-wasm` `validateXML({ xml, schema })` with `LX/__testing__/cldr/<conformsTo>/ldmlKeyboard3.xsd`, and returns the errors. Self-test in `LX/__testing__/xsdValidate.test.ts`: the T003 samples validate under 46, and a document with an unknown element fails.
- [x] T016 [P] Implement `LX/__testing__/keymanCompile.ts` (H1, H2; research R21): `keymanCompile(xml, { build?: boolean }) → { messages: {code, severity, text}[], kmx?, kvk? }`:
  - uses `LdmlKeyboardCompiler` (`init`, `load`, `validate`, and `run` when `build`);
  - in-memory callbacks modelled on `packages/engine/src/compiler/index.ts:328-363`, with a real path join in `resolveFilename`;
  - `loadFile` serves the source and `developer-utils/build/src/types/import/46/*.xml`.

  Self-test in `LX/__testing__/keymanCompile.test.ts`: the T003 hardware sample compiles with zero errors, and a document with `conformsTo="49"` yields `Error_SchemaValidationError`.
- [x] T017 [P] Implement `LX/__testing__/tr35Conformance.ts` (H4; research R23): `tr35Conformance(xml) → Violation[]` covering every rule listed in R23, including the gap-key ban. In `LX/__testing__/tr35Conformance.test.ts`, write one minimal failing document per rule, and assert that the T003 touch sample conforms.
- [x] T018 [P] Implement `LX/__testing__/ldmlInterpreter.ts` (H5; research R24): `loadLdml(xml)`, then `type(keys: {vkey, modifiers, caps}[], initialContext?) → string`. It supports:
  - the hardware key map by layer (exact modifier match, caps layers);
  - `simple` transform groups in document order, first match per group, with every group run after each outputting key;
  - `backspace` transforms on `K_BKSP`;
  - markers;
  - `${str}`, `$[set]`, `[...]`/`[^...]`, `(...)` captures, `$1`–`$9`, and `$[1:set]` mapping;
  - NFD matching and NFC output;
  - `tapTouch(formWidth, layerId, keyId, context?)`: select the touch form by `minDeviceWidth`, apply the key's output, then run the transforms (used by the H5 touch pass in T078).

  Unit-test each feature with hand-written mini documents in `LX/__testing__/ldmlInterpreter.test.ts`.
- [x] T019 Implement `LX/__testing__/corpus.ts`. It resolves the corpus in [contracts/test-harnesses.md](contracts/test-harnesses.md) from `../keyboards/release` and `../keyboards/experimental` (path pattern of `packages/engine/src/pattern-apply/touchProductionEquivalence.corpus.test.ts:128`) and loads each keyboard's `.kmn`, `.keyman-touch-layout` and `.kvks` from disk for tests. It also needs three keyboards, picked using [docs/keyboard-index.md](../../docs/keyboard-index.md) and the `../keyboards` tree:
  - one mnemonic keyboard (`&MNEMONICLAYOUT '1'`);
  - one with `begin PostKeystroke` and a touch layout;
  - one with option stores (`if(&opt = '1')` and `set()`).

  Add a phonebook row to `docs/keyboard-index.md` for every corpus keyboard that lacks one, in the same commit.

**Checkpoint**: `pnpm --filter @keyboard-studio/engine test -- ldml-export` is green. The
profiles, parity, FR-065 and the four harness self-tests pass on CLDR's samples.

---

## Phase 3: User Story 1 — Download an LDML version of my keyboard (Priority: P1) MVP

**Goal**: "Download LDML" on the Output page produces a deterministic Keyman LDML project with a
valid keyboard3 hardware form and `LDML-EXPORT-REPORT.md`, under either profile. The package
here is the minimal Keyman project (`.kpj`, `.kps`, `.xml`, report). FR-004/FR-040's documents,
icon and fonts complete in Phase 5 (US3).

**Independent Test**: load a keyboard with only plain key assignments, deadkeys and stores, and
download under profile 46. The `.xml` passes H1–H3, the keystrokes match (H5), and the report
says "Nothing was lost.". Downloading twice gives identical bytes.

### Tests for User Story 1

- [ ] T020 [P] [US1] Add the engine fixtures in `LX/__fixtures__/`:
  - `plain.kmn`: positional keys, deadkeys, `any`/`index` stores, `nul`, backspace rules;
  - `options-postkeystroke.kmn`: `if(&opt = '1')` with a default `'0'`, a `set()` rule, `begin PostKeystroke`;
  - `ansi-only.kmn`;
  - `unruled.kmn`: keys with no rule;
  - `shared-output.kmn`: two keys produce the same character but have different context rules (trigger markers);
  - `all-opaque.kmn`: a keyboard whose every rule is an opaque fragment (spec Edge Cases);
  - `nul-beep.kmn`: `+ [K_Q] > nul`, `+ [K_W] > beep`, and a contextual `'a' + [K_E] > nul` ahead of a general `+ [K_E] > 'e'` (rows 3.15a, 3.15b, 3.16; FR-029);
  - `reread-rows.kmn`: `NUMLOCK`/`SCROLL` flags (2.22), `LCTRL RALT` mixed sides (2.23), `+ [K_BKSP]` with an empty context (2.24), `+ any(keys) > index(out, 1)` over a virtual-key store (2.25), `nul` in context (3.24), and `notany()` over a store with a precomposed character (3.10);
  - `us-base.ts`: an `LdmlBaseLayout` built from contracts' `US_BASE_LAYOUT`;
  - `azerty-base.ts`: built at test time by reading `packages/studio/src/lib/generated/baseLayouts.generated.json` with `fs`, so there is one source and no captured copy. Tests are depcruise-excluded, so reading studio data from an engine test is allowed. The fixture includes AZERTY's dead-key cells (row 2.26).
- [ ] T021 [P] [US1] Write `LX/classify/classify.test.ts`:
  - one assertion per row of mapping sections 1–4 and 6, using the T020 fixtures and inline IR;
  - exhaustiveness: every rule, store and group yields at least one item;
  - every `RawKmnFragment` yields exactly one item, and the fragment reasons route as row 6.1 says (FR-013);
  - an unknown construct gives N `KM_LINT_LDML_OPAQUE` (FR-008);
  - severity is `warning` for a rule and `hint` for anything else (FR-010);
  - `siteKey` and `nodeKey` are formed as the data model says;
  - items are sorted by `siteKey`, and the result is frozen.
- [ ] T022 [P] [US1] Write `LX/package.test.ts`, covering Story 1:
  - scenario 1: `plain.kmn` gives A=N=0 and the report sentence "Nothing was lost.";
  - scenario 2: `options-postkeystroke.kmn` exports, the option rule is at its default, PostKeystroke is omitted, and both are listed with lines and reasons;
  - scenario 3: in `unruled.kmn`, each unruled key types the base character (via `ldmlInterpreter`), except positions where the base has a dead key, which are omitted and reported as row 2.26 hints;
  - the ANSI-only result is `{ ok: false, reason: "ansi-only" }`;
  - scenario 5: two builds are byte-identical, also under `process.env.TZ = "Pacific/Auckland"` (H8);
  - the filename is `<kmnid>_ldml-<semver>.zip`, and every project file uses the id `<kmnid>_ldml` (FR-040);
  - `nul-beep.kmn`: `K_Q` and `K_W` are gap keys that override the base fill, the contextual `nul` is an empty-`to` transform ordered ahead of the general rule, and nothing is dropped (FR-029);
  - the `<special>` record lists every main-block position of every hardware layer once, as authored, filled or suppressed, and matches the key map (FR-028);
  - there is no `NEXT_STEPS.md`;
  - for `shared-output.kmn`, no trigger marker survives in any interpreter output (FR-024);
  - for `all-opaque.kmn`, the export succeeds, the key map comes from the base layout only, and every fragment has exactly one report row (spec Edge Cases, FR-013).

### Classifier (FR-008–FR-010, FR-013, FR-017, FR-025)

- [ ] T023 [US1] Implement `LX/classify/keystrokes.ts`:
  - split each rule at `isPlusSeparator` (`packages/contracts/src/rule-shape.ts:32`) into context and keystroke;
  - classify the keystroke: vkey (rows 2.1–2.5, 2.19–2.21), char (2.6/2.7), any;
  - classify the modifiers: rows 2.9–2.13, including `RSHIFT` → 2.12, and `LALT`/`RALT`/`ALT` kept distinct;
  - rows 2.22 (`NUMLOCK`/`SCROLL` flags), 2.23 (mixed sides: side-neutral when no other rule distinguishes those sides, else N), 2.24 (`K_BKSP` with an empty context) and 2.25 (virtual-key stores in keystroke position, expanded per item; `KEY_STORE` when lengths differ or an item does not resolve).
- [ ] T024 [US1] Implement `LX/classify/callGraph.ts`. It depends on T025 (`rawText.ts`), so implement T025 first:
  - entry points from `IRHeader.entryPoints`;
  - `use()` edges from typed `useGroup` outputs, and from `match`/`nomatch` `raw` right-hand sides through `rawText.ts`;
  - every-path vs some-path reachability (rows 1.5/1.6, with `nomatch` and the implicit default counted as paths);
  - keystroke groups called from keystroke groups (1.7);
  - unreachable groups (1.11);
  - `readonly`, `NewContext` and `PostKeystroke` groups (1.3, 1.4, 1.10). The 1.4a/1.4b split is US4 (T071): here every such group is a single N item.
- [ ] T025 [P] [US1] Implement `LX/classify/rawText.ts` (research R19) before T024; it is parallel with T023 and T027 only. Only these patterns are recognised: `use(g)`, `layer('x')`, `platform('…')`, `set(&layer='x')`, plus `RawKmnFragment.reason` routing (`option-store-directive`/`if-option-store` → 3.18, `call-return` → 1.12, everything else → 6.1 `OPAQUE` with the reason in `params.reason`). Never parse `sourceText` beyond these patterns (Art II).
- [ ] T026 [US1] Implement `LX/classify/ruleElements.ts`, covering rows 3.1–3.26, including 3.15a and 3.15b:
  - `index()` pairing and the capture-group count, against the group-1 limit (FR-023, the same in both profiles) and the cap `MAX_TRANSFORMS_PER_RULE = 1000` exported from `LX/lower/transforms.ts`;
  - `notany` with multi-code-point items;
  - `beep`, `nul`;
  - `if(option = 'v')` evaluated against the option store's initial value (spec Assumptions);
  - `platform`/`baselayout` conditions: compare the hardware and touch views, and evaluate against `input.baseLayout`;
  - `layer` state;
  - normalization, with common-types' helpers where T089 allows them (FR-080): 3.23 any output that differs from its NFC form, and 3.22 rule pairs whose contexts are equal under NFD with different outputs;
  - 3.10 negated classes: only NFD single code points, else N `NEGATED_CLASS`;
  - 3.15a/3.15b/3.16: `nul` and `beep` are M (`beep` with a `BEEP` hint) and never dropped (FR-029);
  - 3.24 `nul` in context → A `CONTEXT_START` hint;
  - 3.25 context rules that reorder are M with no hint (research R32).
- [ ] T027 [P] [US1] Implement `LX/classify/header.ts`:
  - rows 4.1–4.15 from system stores (`IRStore{isSystem:true}`) and the header;
  - 1.2 ANSI-only;
  - 2.15 caps modes;
  - 4.9 and 4.11 → `METADATA_PACKAGE_ONLY` hints;
  - 4.12 → `HEADER_UNSUPPORTED` hints;
  - 4.10 → its status from the resolved profile row (K in 46, M in 49);
  - 4.16 → `NO_LOCALE` hint when `metadata.languages` is empty.
- [ ] T028 [US1] Implement `LX/classify/classify.ts` (`classifyForLdml`). It composes T023–T027, and adds the row 2.26 items: one `BASE_DEADKEY` hint per (exported layer, main-block position) where `input.baseLayout` has a `"deadkey"` cell and no rule covers the position, with `nodeKey` `base:<layer>/<vkey>` and `side` `hardware`. It builds each item's `siteKey`, `nodeKey`, `line` (`sourceLine`), `owner` (FR-017), `side`, `params`, and English `construct` and `consequence` constants from the row. It sorts by `siteKey`, computes `counts`, `baseLayout`, `ansiOnly` and `touchPresent`, and deep-freezes the result. It reads statuses and codes only from the resolved profile and never compares profile ids (FR-061). Export it from `LX/index.ts`.

### Lowering (FR-020–FR-024)

- [ ] T029 [P] [US1] Implement `LX/lower/capsExpand.ts` (row 2.14): a rule with no caps flag is emitted into both the `X` and the `X caps` layers. The rule is kmcmplib's `ExpandCapsRulesForGroup`, driven by `&CasedKeys` and the base layout's cased keys. Test it in `LX/lower/capsExpand.test.ts`.
- [ ] T030 [P] [US1] Implement `LX/lower/precedence.ts` (FR-022, research R5): within a group, sort by trigger key, then context length descending, then `sourceLine`, applied after caps expansion. Test it in `LX/lower/precedence.test.ts` against the order kmcmplib documents (`developer/src/kmcmplib/src/Compiler.cpp:701-755`).
- [ ] T031 [US1] Implement `LX/lower/baseFill.ts` (FR-021, row 2.8):
  - every main-block position of the chosen form, in every exported layer, gets an explicit key: the rule output, or else the base layout's character for that layer;
  - the positions to fill are those spec 109's enumerator (its FR-040) reports as unhandled. If spec 109 has not landed, first build that enumerator where spec 109 places it, as its own commit (research R32);
  - a position whose rule outputs `nul` or `beep` with no context becomes `<key gap="true"/>`, overriding the fill (rows 3.15a, 3.16; FR-029). Positions spec 109 swallows reach here as such `nul` rules;
  - record each position's provenance (authored, filled, suppressed) for T090 (FR-028);
  - the caps layers are derived per research R26;
  - modifier combinations with no rule and no base output get no layer (2.17).
  - A `"deadkey"` cell at a position no rule covers is omitted from that layer (row 2.26). The classifier reports it (T028), so the position is never dropped silently.

  Test it in `LX/lower/baseFill.test.ts` with `us-base.ts` and `azerty-base.ts`.
- [ ] T032 [US1] Implement `LX/lower/triggers.ts` (mapping section 3):
  - a context-free character rule becomes the key's `output`;
  - a key with context rules gets its no-context output, or its base character, as the trigger;
  - keys that share a trigger text but have different context rules get a trigger marker `\m{…}` (ids from `keyIds.ts`);
  - one catch-all transform per marker, `\m{m}` → the key's default output, placed last in its group (FR-024).

  Test it in `LX/lower/triggers.test.ts`.
- [ ] T033 [US1] Implement `LX/lower/transforms.ts`. It renders `from`/`to` within Keyman 19's subset (research R3):
  - literals escaped, NFD, `\u{…}` for the supplementary planes and for characters that need escaping;
  - `$[set]` and `${str}` variables (`<set>`, or `<uset>` only for large single-code-point ranges never mapped);
  - markers;
  - capture groups and `$n` for `context(n)` (3.12, with 3.13 past 9);
  - `outs` inlined (3.14);
  - escaping by side (row 3.1): regex metacharacters escaped in `from` only; in `to` only `\\`, `\$` and `$$` are escapes; marks, controls (Cc), format characters (Cf) and non-space whitespace as `\u{…}` (3.2);
  - markers emitted before the character they belong with (3.3, 3.5);
  - `nul` in context → a leading `^` in `from` (3.24);
  - `nul`/`beep` with context → a transform with an empty `to`, ordered ahead of the more general rule (3.15b, 3.16; FR-029);
  - `index()` → `$[1:set]` when the rule meets 3.7, otherwise cartesian expansion capped at `MAX_TRANSFORMS_PER_RULE` (3.8/3.9), in both profiles (FR-023);
  - backspace rules → `<transforms type="backspace">` (2.18).

  Comments (FR-042, FR-017):
  - every group carries `KMN group: <name>`;
  - every transform carries `source/<id>.kmn:<line>` of its rule, including transforms from cartesian expansion;
  - a trigger-marker catch-all carries `exporter: trigger catch-all for <key id>`;
  - the first transform that uses a deadkey's marker carries `marker <id> = deadkey <original name>`, so the original names survive (spec Edge Cases). Test it in `LX/lower/transforms.test.ts`, including a `to` that must not be emitted as `\uXXXX`.
- [ ] T034 [US1] Implement `LX/lower/document.ts`. It assembles the `LdmlDocument`:
  - the hardware form choice (FR-020): `iso` when any ISO-only key is used or `baseLayout.isoFamily`, `abnt2`/`jis` for their keys, otherwise `us`; keys of another form give 2.4 items;
  - layers with `modifiers` (`none` for the base, no `id`);
  - keys from `baseFill` + `triggers`;
  - variables;
  - transform groups in call order (FR-025);
  - `info name` and `version number` (normalised to `major.minor.patch`, row 4.3);
  - `@locale` (the first tag reduced to minimal likely-subtags form with the engine's `langtags` module, never containing `-k0-`, FR-041; or `und` with the row 4.16 item) and `<locales>`;
  - keys expanded from virtual-key stores (row 2.25);
  - the FR-028 `<special>` record from T090;
  - the first lines of the header comment: the profile id with its TR35 revision, the base keyboard resolved against and its source (FR-027), and the report pointer (FR-062). T067 adds the rest of FR-042's header.

  N items are never lowered, and M/A items are always lowered (FR-009).
- [ ] T090 [US1] Implement `LX/lower/provenance.ts` (FR-028): from T031's per-position record, build the `<special>` element under `<keyboard3>` holding the base keyboard's id and `source` and one entry per (hardware layer, position) with `authored`, `filled` or `suppressed`, in sorted order. Use the namespace T089 confirmed; if T089 found the element rejected, return the record for the report only. Test it in `LX/lower/provenance.test.ts`, including "filled = spec 109's unhandled positions minus suppressed" (spec 109 SC-005). (ID appended so existing IDs stay stable.)
- [ ] T035 [US1] Implement `LX/report.ts`: `renderReport(classification, profile, context) → string`, with sections 1–8 exactly as [contracts/export-package.md](contracts/export-package.md):
  - English constants only;
  - rows sorted by section, then line, then code;
  - the base keyboard named, with its source (FR-027), and a provenance summary: counts of authored, filled and suppressed positions per layer (FR-028);
  - the Keyman 19 desktop-only delivery note;
  - the authority statement;
  - section 8 (version change) for profile 49, listing the rows that differ from 46 (FR-064).

  Test it in `LX/report.test.ts`.
- [ ] T036 [US1] Implement `LX/project/kpj.ts` and a minimal `LX/project/kps.ts`, through `@keymanapp/kmc-generate`'s `ldml-keyboard` template when T089 found it browser-safe, otherwise writing the same layout directly (plan, Upstream reuse). The project and package id is `<kmnid>_ldml` (FR-040):
  - the `.kpj` is Keyman project v2.0;
  - the `.kps` has the name, version and copyright `<Info>`, `<Keyboards>` with the languages, and `<Files>` listing `..\build\<kmnid>_ldml.kmx` and `..\build\<kmnid>_ldml.kvk`.

  The full metadata and documents are US3.
- [ ] T037 [US1] Implement `LX/package.ts` (`buildLdmlExport`, [contracts/exporter-api.md](contracts/exporter-api.md)): resolve the profile, classify, lower, serialise, render the report, and assemble the files. Zip with `toZip(vfs, { nextSteps: false, fixedMtime: new Date(1980, 0, 1) })`. Return `LdmlExportResult`. Export it from `LX/index.ts`. Make T021 and T022 pass.

### Corpus checks (FR-050, FR-051, FR-005, SC-001–SC-003, SC-006, SC-007)

- [ ] T038 [P] [US1] Write `LX/compile.corpus.test.ts` (H1 + H2 + H3). For every corpus keyboard under profile 46 (hardware form):
  - the Keyman compile's error codes equal the K-row `keymanCodes`, which is empty;
  - there is no `WARN_StringDenorm`;
  - the schema is valid;
  - the CLDR 46 XSD is valid.

  Under both profiles, `tr35Conformance(xml)` must return `[]`: the hardware-layer rules apply (`modifiers` present, no `id`, single-space rows). Under profile 49 the Keyman checks are skipped, and the CLDR 49 XSD and the TR35 checks are the gate (FR-050, last sentence). Print `[OK]` or `[FAIL] <keyboard> <profile> <codes>`.
- [ ] T039 [P] [US1] Write `LX/equivalence.corpus.test.ts` (H5; research R24):
  - **KMN side**: compile a test copy with `&TARGETS any`, then run `simulate` from `@keyboard-studio/engine/simulator`. The simulator's base is fixed to `us`, so the harness **always** exports with `us-base.ts` as `baseLayout`, whatever the keyboard's natural host. Fill for other hosts (AZERTY etc.) is proven by T031's unit test, not by H5.
  - **LDML side**: `ldmlInterpreter`.
  - **Sequences**: every key × layer, every context rule's `context + key` path, and 200 random walks of length 1–6 seeded by the keyboard id.
  - **Comparison**: `NFC(kmn) === ldml`.
  - **Pass**: a mismatch is allowed only when some `firedRule` maps to an A/N item. A keyboard with no A/N items allows zero mismatches (SC-002, SC-003).
- [ ] T040 [P] [US1] Write `LX/reference.corpus.test.ts` (H9, SC-006): for `ibono_chwerty`, per hardware position and layer that both files define, the export's output equals that of the hand-written `source/extras/ibono_chwerty.xml`, with its CLDR import ids resolved through the `developer-utils` `import/46` files.
- [ ] T041 [P] [US1] Write `LX/timing.corpus.test.ts` (H10, SC-007): the median of 5 `buildLdmlExport` runs on the largest corpus keyboard of ≤ 2 000 rules is under 2 s. Also log the median `classifyForLdml` time, reported but not asserted.

### Studio (FR-002, FR-003, FR-006, FR-007, FR-019, FR-062)

- [ ] T042 [P] [US1] Implement `ST/lib/ldmlBaseLayout.ts`:
  - `resolveLdmlBaseLayout({ windowsLayoutPicks, layoutFamily, bcp47, override }) → { chosen: LdmlBaseLayout | null; defaultChoice: { id, label, source, available }; options }` (FR-027; research R26);
  - the default is the primary `windows-layout` pick (`getPickedWindowsLayouts(…)[0]`, `ST/lib/layoutFamily.ts:104`). When that layout has no reference data (`WindowsLayout.host` unset), the default is `available: false`, and `chosen` is `null` unless `override` is set; never substitute silently;
  - without a primary pick, the first entry of `resolveLikelyBases` (`ST/components/rules/baseLayouts.ts:387`) with the picks removed, then `us`;
  - `options` are the five reference hosts with character data; an `override` selects one of them;
  - map ids into the `referenceBaseLayouts` vocabulary (`intl` → `us-intl`);
  - copy the four layers from `REFERENCE_BASES`;
  - set `isoFamily` from the presence of a `K_OE2` cell, and `family` from the host id (research R26);
  - set `source` to `author`, `primary-pick`, `likely-base` or `en-US`.

  Test it in `ST/lib/ldmlBaseLayout.test.ts`: one case per `source`, plus an unavailable primary pick with and without an override.
- [ ] T043 [P] [US1] In `ST/lib/services.ts`, add the accessors `getBuildLdmlExport()`, `getClassifyForLdml()`, `getListLdmlProfiles()`, `getParseKmn()`, `getParseTouchLayout()` and `getParseKvks()`, following the existing cached `importEngine()` pattern. They throw when `!USE_REAL`, like `getBuildKmp`.
- [ ] T044 [US1] Add `ldmlProfile: LdmlProfileId | null` with `setLdmlProfile`, and `ldmlBaseLayout: BaseLayoutId | null` with `setLdmlBaseLayout` (FR-027), to `ST/stores/workingCopyStore.ts`, at the same reset points as `chartPreference`. Then:
  - snapshot and apply it in `ST/lib/persistWorkingCopy.ts` (beside `chartPreference`, around lines 406 and 580);
  - register it as EDITOR-AUTHORED in `ST/decisions/derivedSurfaceRegistry.ts`;
  - add `"ldmlProfile": null` and `"ldmlBaseLayout": null` to the draft fixtures in `ST/lib/__fixtures__/*.json`;
  - add a save → reload round-trip test beside the existing `chartPreference` persistence test.

  There is no `DRAFT_VERSION` bump (research R27).
- [ ] T045 [US1] In `ST/lib/buildOutputBundle.ts`, add `buildLdmlExportForDownload(profileId): Promise<DownloadResult>`:
  - `projectWorkingCopyForOutput()`;
  - parse `source/<id>.kmn` with `getParseKmn()` (no try/catch around it, Art II), and the `.keyman-touch-layout` and `.kvks` when present;
  - `resolveLdmlBaseLayout` from the current survey answers and `ldmlBaseLayout`; when `chosen` is `null` (unavailable default, no override), throw `OutputBundleError` with the FR-027 reason;
  - metadata (minimal here; full in T063);
  - `buildLdmlExport`.

  An `ok: false` result throws an `OutputBundleError` carrying the ANSI-only reason. Add to `ST/lib/buildOutputBundle.test.ts`:
  - the projected VFS is unchanged afterwards (FR-007);
  - `buildKmpForDownload` and `buildSourceZipForDownload` outputs never contain a `.xml` keyboard file or `LDML-EXPORT-REPORT.md` (Art VII);
  - the LDML path calls no validator (FR-006);
  - the pull-request projection (the managed-PR path's file list) never contains an LDML file (FR-002, Art VII);
  - `buildLdmlExportForDownload` returns byte-identical zips with the Lingui locale activated as `en` and then as `fr` (FR-030, SC-009).
- [ ] T046 [US1] In `ST/hooks/usePreviewArtifact.ts`, add `handleDownloadLdml()`, `downloadingLdml` and `ldmlError`. It uses the same `canDownload` and `emissionBlockReason` gates as `handleDownload`, calls `buildLdmlExportForDownload(ldmlProfile ?? default)`, then `triggerDownload(bytes, filename, "application/zip")`. Include `downloadingLdml` in the busy state that disables the `.kmp` and `.zip` buttons, and disable the LDML button while those run (FR-002).
- [ ] T047 [US1] Create `ST/components/output/LdmlDownloadPanel.tsx`:
  - a native `<select>` with a visible `<label>`. Each option's text is the profile's LDML version plus "Keyman compiles it" or "TR35-only (awaiting Keyman)". `46` is preselected when `ldmlProfile` is `null`. A change calls `setLdmlProfile`;
  - the "Download LDML" button, with `data-testid="emit-download-ldml"`, an `aria-label` built from `resolveOutputKeyboardId` (the blocker's `downloadAria` when gated), and the disabled-with-reason states for the shared gate and for ANSI-only;
  - a second native `<select>` with a visible `<label>` for the base keyboard (FR-027): the options from `resolveLdmlBaseLayout`, the default marked with its source. A change calls `setLdmlBaseLayout`. An unavailable default shows its reason and disables the download until another is picked;
  - help text and the error alert.

  Mount it in `ST/components/OutputScreen.tsx` beside the `.zip` button under the shared `outputGate`. It is not shown on the `.kmp`/PR paths.
- [ ] T048 [US1] Add `output.download.ldml.*` messages (button, downloading, aria ready, profile label/option/compilable/tr35Only, base-keyboard label/option/default/unavailable, help, error) to `ST/locales/en/messages.json` and `ST/locales/fr/messages.json`, with French translations, then run the Lingui extract and compile. `pnpm lint`'s i18n tiers must pass (FR-019).
- [ ] T049 [US1] Write `ST/components/OutputScreen.ldml.test.tsx`:
  - Story 1 scenario 0: the picker shows 46 preselected and labelled compilable, and 49 labelled "TR35-only (awaiting Keyman)";
  - scenario 4: a coverage blocker disables the LDML button with the shared aria reason;
  - the ANSI-only disabled state;
  - FR-027: the base picker defaults to the primary `windows-layout` pick with its source shown; an unavailable primary pick disables the download with its reason, and picking another enables it;
  - SC-012: switching profile and downloading takes two interactions and passes the new profile id;
  - the aria-label id equals the filename id for `.zip`, `.kmp` and LDML. This is the first such assertion, per [contracts/findings-routing.md](contracts/findings-routing.md).
- [ ] T050 [US1] Write the Playwright journey `packages/studio/e2e/ldml-export.spec.ts`: open a fixture keyboard and reach the Output page, choose profile 46, download the LDML zip, and assert the zip's entry list and that the report names the profile.

**Checkpoint**: Story 1 works on its own. The H1–H3, H5, H9 and H10 corpus suites are green for
the hardware form. Commit `spec 108 T020-T050, T090`.

---

## Phase 4: User Story 2 — See LDML incompatibilities while authoring (Priority: P2)

**Goal**: LDML A/N warnings and hints appear on the owning steps within the normal validation
cycle, grouped by code, and never gate other outputs.

**Independent Test**: import a keyboard with `if()`/`set()` options and `begin PostKeystroke`.
Without visiting the Output page, the `rules` and `touch` steps show grouped `KM_LINT_LDML_*`
findings with source lines, and the `.kmp` and `.zip` downloads stay enabled.

### Tests for User Story 2

- [ ] T051 [P] [US2] Write `ST/lint/ldmlFindings.test.ts`:
  - severity follows FR-010;
  - `location` is set exactly when `line` is non-null;
  - message ids follow the `lint.ldml.<codeSlug>.*` pattern;
  - no finding is ever `error`;
  - M items without a code produce nothing; an M item with a hint (row 3.16) produces a hint.
- [ ] T052 [P] [US2] Write `ST/lint/lintToQuestion.ldml.test.ts`:
  - every code routes per the table in [contracts/findings-routing.md](contracts/findings-routing.md);
  - a code whose step is not in the route falls back to unmapped (Output);
  - `buildStepWarningCounts` counts distinct LDML codes per step, hints included, while other codes are still counted per finding (a step with 300 `OPTION_STATE` and 2 `CALL` badges 2).
- [ ] T053 [P] [US2] Write `ST/test/ldmlParity/ldmlParity.corpus.test.ts` (H6, SC-005). For each corpus working copy, built with the spec 106 replay helpers in `ST/test/`, build both projections headlessly, with no React hook mounted. The **preview** projection calls `projectWorkingCopyVfs` (`ST/lib/projectWorkingCopyVfs.ts:432`) with the same input `ST/hooks/useWorkingCopyTransform.ts:501` passes (display-name identity only), then parses its `.kmn`, touch layout and `.kvks`. The **download** projection uses `projectWorkingCopyForOutput`. Both paths use the same `resolveLdmlBaseLayout` result; a working copy whose FR-027 default is unavailable gets the override `us`, never a skip. Assert that the coded-item `siteKey` set (A, N, K, and M with a hint) from the preview projection equals that from `projectWorkingCopyForOutput`, and that the studio findings' site keys equal the report's coded-item rows, excluding the row-5.15 delivery note (FR-012, SC-005).

### Implementation for User Story 2

- [ ] T054 [US2] Publish the preview projection from `ST/hooks/useKeyboardArtifact.ts` into `ST/stores/workingCopyStore.ts`:
  - In `ST/hooks/useKeyboardArtifact.ts`, when a run reaches `ready` with a successful parse, call `setPreviewProjection({ ir: parsedIr, touchLayoutText, kvksText, keyboardId })`. Read the touch-layout and `.kvks` text from the VFS that run compiled. A superseded run (runId check) never writes, and a failed parse leaves the previous value.
  - Add `previewProjection` and its setter to `ST/stores/workingCopyStore.ts`, cleared on a base change.
  - Register it as EPHEMERAL in `ST/decisions/derivedSurfaceRegistry.ts`.
  - Add a hook test.
- [ ] T055 [US2] Implement `ST/lint/ldmlFindings.ts`: `buildLdmlFindings(classification, i18n) → LintFinding[]` per [contracts/findings-routing.md](contracts/findings-routing.md) (layer `"C"`, `msg({ id: "lint.ldml.<codeSlug>.message", values: item.params })`). Make T051 pass.
- [ ] T056 [US2] Implement `ST/hooks/useLdmlFindings.ts`: a `useMemo` over `previewProjection`, `ldmlProfile`, `ldmlBaseLayout`, the base-layout inputs and `i18n`. When `chosen` is `null` (unavailable default, no override), it returns `[]`: the LDML panel (T047) already shows the unavailable state, and FR-011 admits no finding without a contract code. Inside it, run `parseTouchLayoutOrNull` and `parseKvks`, then `resolveLdmlBaseLayout`, then `classifyForLdml(input, resolveLdmlProfile(ldmlProfile ?? default))`, then `buildLdmlFindings`. Do not add a timer or an effect that schedules work (Art IV, FR-014). Test that it recomputes only when an input changes.
- [ ] T057 [US2] In `ST/StudioShell.tsx`, merge `useLdmlFindings()` into the `findings` memo beside `documentationFindings` and `oe2Findings`, so it publishes through the existing `setValidatorFindings`.
- [ ] T058 [US2] In `ST/lint/lintToQuestion.ts`:
  - add the LDML question routes;
  - add `LINT_CODE_TO_STEP_IDS` (the `rules` step codes);
  - add route-aware fallback, so that a step absent from the current route makes the finding unmapped;
  - add distinct-code counting for `KM_LINT_LDML_*` in `buildStepWarningCounts`.

  Make T052 pass. Do not cite issue numbers in comments (Art VIII).
- [ ] T059 [P] [US2] In `ST/lint/LintSummary.tsx`, add `groupByCode?: boolean`: one row per code with its translated title, count and severity, expanding to the individual `LintChip`s, each with its line (FR-018). Write `ST/lint/LintSummary.groupByCode.test.tsx`.
- [ ] T060 [US2] In `ST/survey/rules/RulesStep.tsx`, render the step-owned findings (`LINT_CODE_TO_STEP_IDS` → `rules`) as a grouped `LintSummary`. Check that the touch-layout and physical-layout question surfaces render their LDML chips through the existing `findingsByQuestionId` path, and add the chip there if a surface does not render one (findings-routing table).
- [ ] T061 [US2] In `ST/components/OutputScreen.tsx`, exclude `KM_LINT_LDML_*` from the "Other findings" list, and have `LdmlDownloadPanel` list every LDML finding with `groupByCode` (FR-015).
- [ ] T062 [US2] Add `lint.ldml.<codeSlug>.{title,message,hint}` for all 34 codes to `ST/locales/en/messages.json` and `ST/locales/fr/messages.json`, with French translations and the interpolated `params` names matching what `classify.ts` emits.
- [ ] T063 [US2] Write `ST/lint/ldmlNoGating.test.ts` (FR-016):
  - with only LDML findings present, `outputBlockers` is not blocked;
  - the criteria resolution (`ST/criteria/resolveCriteria.ts`) ignores `KM_LINT_LDML_*`;
  - the `.kmp` and `.zip` handlers stay actionable.
- [ ] T064 [US2] Write `ST/hooks/useLdmlFindings.scenarios.test.tsx`:
  - Story 2 scenario 1: a warning with a line for an option rule;
  - scenario 2 / SC-008: removing the rule removes the warning on the next published findings array, with no extra tick;
  - scenario 4: 300 option-guarded rules present as one group with count 300, each locatable;
  - SC-012: changing `ldmlProfile` changes the findings, for example the profile 46 `KEYMAN_GAP` hint disappears under 49.

**Checkpoint**: Story 2 is green. H6 parity holds over the corpus. Commit `spec 108 T051-T064`.

---

## Phase 5: User Story 3 — Documentation and metadata travel with the export (Priority: P2)

**Goal**: the `.xml` carries the LDML metadata and the documentation comment, and the package is a
complete Keyman LDML project that builds.

**Independent Test**: export a keyboard with a description, licence, readme and welcome. The `info`,
`version` and locales match, and building the extracted project produces a `.kmx`, a `.kvk` and a
`.kmp` with matching package info.

- [ ] T065 [P] [US3] Implement `ST/lib/ldmlExportMetadata.ts`: `buildLdmlExportMetadata(state) → LdmlExportMetadata` and `collectLdmlPackageFiles(projectedVfs, keyboardId) → LdmlPackageFiles`. Take every field from the same sources the KMN `.kps` writer reads (the [data-model.md](data-model.md) table: identity, `attribution`, `effectiveHolder`, `helpDocs`, `resolvePublishVersion`, `resolveInheritedHolders`). Take the files from the projected VFS: readme, welcome, LICENSE, README, HISTORY, and the icon and fonts the KMN `.kps` lists. Wire both into `buildLdmlExportForDownload` (T045). Test it in `ST/lib/ldmlExportMetadata.test.ts`.
- [ ] T066 [US3] In `LX/lower/document.ts`, fill `<info author layout indicator>`:
  - `layout` = `baseLayout.family`;
  - `attribution` only when the profile's `writeAttribution` is set (row 4.10; FR-041);
  - `<locales>` holds the remaining language tags, all minimal.
- [ ] T067 [US3] In `LX/xml/writeKeyboard3.ts` (via the document `comment`), complete the FR-042 header documentation comment that T034 started, exactly as in [contracts/export-package.md](contracts/export-package.md): name, id, original version, description, copyright, licence, author, attribution, home page, studio version, profile and TR35 revision, the base keyboard resolved against, and the report pointer. There is no timestamp.
- [ ] T068 [US3] Complete `LX/project/kps.ts` (`<Info>`: name, copyright, author, description, website; `<Keyboards>` with languages; `<Files>`: build outputs, readme, welcome, icon, fonts). Implement `LX/project/docs.ts`, which places `source/readme.htm`, `source/welcome.htm`, `LICENSE.md`, `README.md`, `HISTORY.md`, the icon and the fonts at the paths in [contracts/export-package.md](contracts/export-package.md) (FR-040).
- [ ] T069 [US3] Write `LX/metadata.test.ts`:
  - Story 3 scenario 1: name, author, version `1.2` → `1.2.0`, `locale="ibn"`, `<locales>` holding `en`;
  - scenario 2: the header comment and the package files carry the description, copyright and licence;
  - under profile 49, `info/@attribution` is present.
- [ ] T070 [US3] Write `LX/project.corpus.test.ts` (Story 3 scenario 3): for each corpus export, compile `source/<kmnid>_ldml.xml` with `keymanCompile(xml, { build: true })` (`.kmx` + `.kvk` produced), then package `source/<kmnid>_ldml.kps` with the engine's existing `KmpCompiler` load path (`packages/engine/src/output/kmp.ts`). Expect zero errors, and package info equal to the metadata.

**Checkpoint**: Story 3 is green. Commit `spec 108 T065-T070`.

---

## Phase 6: User Story 4 — Touch layout carries over, spec-perfect (Priority: P2)

**Goal**: phone and tablet layouts become TR35-conformant touch forms. Their key outputs come
from the same rules as hardware, and automatic layer behaviour carries over where it depends only
on the key pressed.

**Independent Test**: export a keyboard with phone and tablet layouts, long-press, and a layer
switch. Two touch forms (`minDeviceWidth` 1 and 150) pass H3 and H4, and each touch key's output
equals the KMN rule output for that key.

- [ ] T071 [US4] Implement `LX/classify/layerRules.ts` (FR-026; rows 1.4a/1.4b). For every (touch layer, output key) pair, evaluate the `PostKeystroke`/`NewContext` groups statically. They consist of typed `if(&layer = …)` rules, `raw` `layer('x')` outputs, `set(&layer='x')` fragments read through `rawText.ts`, `any(store)` over the key's own output, and `nomatch`.
  - A result that depends only on the current layer and the key's output becomes a `layerId` decision (M).
  - A rule that depends on earlier text (sentence punctuation plus space, start of field, backspace re-evaluation) gives **one** N `KM_LINT_LDML_NO_KEY_TRIGGER` item per behaviour (`nodeKey` `behaviour:<name>`), with a touch-specific consequence such as "start-of-sentence auto-shift".
  - Never emulate it with transforms.

  This replaces the single-item treatment of these groups from T024. Test it in `LX/classify/layerRules.test.ts` with the casing-template rules quoted in research R15.
- [ ] T072 [P] [US4] Implement `LX/classify/touch.ts` (rows 5.1–5.15):
  - 5.3 desktop platform → hint;
  - 5.8 gestures on a gesture target → hint;
  - 5.11 `font`, `fontsize`, `hint`, `defaultHint`, `displayUnderlying`, `dk` → hints;
  - 5.13 `K_BKSP`/`K_ENTER`/`K_TAB` special keys → A hint;
  - 5.15 → one K item stated once (not per key);
  - every touch key gets an item with `nodeKey` `touch:<platform>/<layer>/<key>`.

  Wire it into `classifyForLdml`. Test it in `LX/classify/touch.test.ts`.
- [ ] T073 [US4] Implement `LX/lower/touchForms.ts`:
  - the phone form gets `minDeviceWidth="1"` and the tablet form `"150"`, from the exported constants `PHONE_MIN_DEVICE_WIDTH` and `TABLET_MIN_DEVICE_WIDTH`;
  - the `default` layer becomes `base`, and touch layers get an `id` and no `modifiers`;
  - rows are joined by single spaces;
  - `width` ÷ 100, and `pad` → a `gap` key of that width;
  - the touch key's output comes from the **same** key resolution as hardware (`triggers.ts`, rules matched by key id and the layer's modifiers), never from its label (section 5 preamble), and `U_xxxx` maps to the code point;
  - `sk` → `longPressKeyIds`/`longPressDefaultKeyId`, `flick` → `<flicks>`/`<flick>`/`<flickSegment>`, and `multitap` → `multiTapKeyIds`;
  - `nextlayer` and the T071 decisions → `layerId`;
  - special keys → same-width gap keys `bksp`/`enter`/`tab`, with no output, `layerId`, gestures or display;
  - labels that differ from the output → `<display keyId>`.
- [ ] T074 [P] [US4] Write `<displays>` for hardware keys from `KvksIR` labels that differ from their output (row 4.8), in `LX/lower/document.ts`. Gap keys are never referenced by a display (TR35). A label that is a bare nonspacing mark gets U+25CC prepended, and a display never equals its key's `output` (rows 4.8, 5.10).
- [ ] T075 [US4] In `LX/report.ts`, fill the touch section, plus the single 5.15 delivery statement, when `touchPresent` (Story 4 scenario 3; FR-031).
- [ ] T076 [US4] In `ST/lib/buildOutputBundle.ts` (T045), pass the projected `.keyman-touch-layout` into the export input whenever `&TARGETS` includes mobile or web (row 4.6). Add a test that a desktop-only target exports no touch form.
- [ ] T077 [US4] Write `LX/touch.test.ts`, covering Story 4:
  - scenario 1: two touch forms with distinct widths;
  - scenario 2: a label that differs from the output becomes a display, and the key types the rule output;
  - scenario 3: the report states the Keyman touch-pipeline note once;
  - scenario 4: a TR35-valid construct Keyman ignores is still written, and the K item is a hint;
  - the 1.4a cases (one-shot shift, caps stays caps, numeric stays numeric) produce `layerId`.
- [ ] T078 [US4] Write `LX/touch.corpus.test.ts` (H3 + H4 + H1, SC-010). For every touch-bearing corpus keyboard under both profiles:
  - CLDR XSD valid;
  - `tr35Conformance` returns `[]`;
  - under 46, the Keyman compile with the touch forms included returns exactly the K-row codes.

  Also run the H5 touch pass ([contracts/test-harnesses.md](contracts/test-harnesses.md)): for every touch key, NFC(KMN via `TouchTapSession`) === LDML via `ldmlInterpreter.tapTouch`. A mismatch is allowed only on a key with an A/N item (Story 4 Independent Test).

  The Keyman compile is the FR-070 premise, checked in CI first. If it fails, record the failing codes in [research.md](research.md) R31 and stop before Phase 7.

**Checkpoint**: Story 4 is green, and SC-010 holds. Commit `spec 108 T071-T078`.

---

## Phase 7: User Story 5 trial — FR-070 in-browser compile (Priority: P3, gate)

**Goal**: decide whether Story 5 proceeds. Pass and fail criteria: [research.md](research.md) R31.

**Independent Test**: a production Vite build compiles a complete profile-46 export, touch
included, in the browser, with the same messages as CI.

- [ ] T079 [US5] Implement `LX/compile/loadLdmlCompiler.ts`, outside `__testing__`, following the lazy pattern of `packages/engine/src/output/kmp.ts:104-162` (`_modulePromise`, sticky `_down`, `ensureBufferGlobal`). It runs `await import("@keymanapp/kmc-ldml")` and serves the four `import/46/*.xml` files as bundled assets through `loadFile`. Move `@keymanapp/kmc-ldml` from devDependencies to dependencies only in this task. Barrel exports are async-only, so the chunk stays lazy.
- [ ] T080 [US5] Adjust `packages/studio/vite.config.ts` only as needed: exclude kmc-ldml from pre-bundling (the kmc-kmn precedent) and handle the XML assets. Run a production build, and record the gzip size the lazy chunk adds, and that no second kmcmplib `.wasm` appears in `dist/`, in [research.md](research.md) R31.
- [ ] T081 [US5] Write the Playwright trial `packages/studio/e2e/ldml-compile-trial.spec.ts` against the production build. It exports a touch-bearing profile-46 corpus keyboard, compiles it in the browser through `loadLdmlCompiler`, and asserts that the message set equals the H1 result for the same keyboard (SC-013 premise).
- [ ] T082 [US5] Record the trial verdict in [research.md](research.md) R31, against all six pass criteria.
  - **Pass**: mark Phase 8 ready, and run `/speckit-plan` to plan FR-071–FR-076 as an amendment to [plan.md](plan.md), then `/speckit-tasks` to replace the Phase 8 placeholder.
  - **Fail**: edit [spec.md](spec.md) to withdraw Story 5 (FR-070), revert T079–T080, and strike Phase 8 below with the reason (Art XI).

**Checkpoint**: the trial verdict is recorded. Commit `spec 108 T079-T082`.

---

## Phase 8: User Story 5 — Compile and package the LDML export (Priority: P3, conditional)

**Not planned** until T082 records a pass (spec FR-070). Owner: engine team. Trigger: T082.
Expiry: the spec 108 retirement pass.

- [ ] T083 [US5] In `specs/108-ldml-export/tasks.md`, replace this phase with the FR-071–FR-076 tasks produced by the T082 `/speckit-plan` → `/speckit-tasks` amendment, or strike it with the reason recorded in T082.

---

## Phase 9: Polish & cross-cutting

- [ ] T084 [P] Document the LDML export in `docs/tooling.md`: how to run the H1–H10 suites, the vendored schemas and their regeneration, and the pinned Keyman packages. Update `docs/packages.md` (engine `ldml-export` module) and `docs/architecture.md` (output paths: the LDML export is a secondary download, never on the `.kmp`/PR paths).
- [ ] T085 [P] Record the R20 follow-up (opt-in `normalization="disabled"`), with its owner, trigger and expiry, as a GitHub issue titled `feat(output): opt-in normalization="disabled" for LDML export`, and link it from [research.md](research.md) R20. Do not cite the issue number in code (Art VIII).
- [ ] T086 In `.github/workflows/ci.yml`, confirm the engine corpus step runs `LX/*.corpus.test.ts` and the studio corpus step runs `ST/test/ldmlParity/`. Measure the time added. If the existing job exceeds its budget, split the LDML corpus suites into a parallel job and record the decision in [plan.md](plan.md) Complexity Tracking.
- [ ] T087 Run [quickstart.md](quickstart.md) end to end (sections 1–4). Record SC-001–SC-012 evidence in the phase commit message, and check off this file's tasks only for verified work.
- [ ] T088 Run `pnpm typecheck`, `pnpm -r test`, `pnpm lint`, both corpus configs, and `pnpm --filter @keyboard-studio/studio exec playwright test ldml-export`. All must be green before the PR.

---

## Dependencies & execution order

| Phase | Depends on | Notes |
|---|---|---|
| 1 Setup | — | |
| 2 Foundational | 1 | blocks every story |
| 3 US1 (P1, MVP) | 2; spec 109's FR-040 enumerator (T031 builds it if spec 109 has not landed) | the classifier (T023–T028) is the seam the later stories build on |
| 4 US2 (P2) | T028 (classifier), T042–T044 | can start once the classifier merges; it does not need the US1 lowering |
| 5 US3 (P2) | T037, T045 | |
| 6 US4 (P2) | T028, T032–T034 (key resolution and the document) | |
| 7 US5 trial (P3) | 6 (needs a touch-bearing export) | gate |
| 8 US5 (P3) | T082 pass | conditional |
| 9 Polish | all chosen stories | |

**Within a story**: tests are written first and fail, then the classifier, then the lowering,
then the serializer and package, then the studio wiring.

## Parallel opportunities

- **Phase 1**: T002, T003, T005 and T006 run beside T004.
- **Phase 2**: T010–T018 touch different files. The harnesses (T015–T018) run in parallel with the profiles (T007–T010) and the writer (T011–T014).
- **US1**:
  - tests T020–T022 in parallel;
  - T025 and T027 beside T023/T024;
  - T029 and T030 in parallel;
  - corpus suites T038–T041 in parallel;
  - studio T042 and T043 in parallel with the engine work.
- **After T028**: US2 (studio findings) and US4 (touch) proceed in parallel, and US3 (metadata) once T037 lands.

### Parallel example: US1 kickoff

```text
T020 fixtures | T021 classify tests | T022 package tests
T025 rawText.ts | T027 header.ts      (while T023/T024 proceed)
T042 ldmlBaseLayout.ts | T043 services accessors
```

## Implementation strategy

1. **MVP = Phases 1–3**. A hardware-form LDML download with the report, under both profiles,
   proven by H1–H3, H5, H9 and H10. This alone meets Story 1.
2. **Incremental**:
   - US2 makes the same classification visible while authoring;
   - US3 completes the Keyman project;
   - US4 adds spec-perfect touch.

   Each is merged and verified independently.
3. **Story 5** stays behind the FR-070 trial. Nothing in Phases 1–6 depends on it.
4. **Contract changes**: if implementation finds a construct the mapping contract does not list,
   or a row that cannot be honoured, amend the contract, the profile table and the H7 parity test
   in one commit. Never let the code and the contract drift (FR-008, SC-011).
