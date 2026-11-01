# Contract: LDML test harnesses

**Spec**: FR-050–FR-053, FR-065, SC-001–SC-006, SC-009–SC-011, SC-013 · **Research**: R18,
R21–R25, R30

The harnesses live in `packages/engine/src/ldml-export/__testing__/`, are excluded from the barrel,
and depend only on devDependencies. The exception is H6, which needs studio code
(`projectWorkingCopyForOutput`, the preview projection). H6 lives in
`packages/studio/src/test/ldmlParity/` beside the spec 106/107 replay helpers, and runs under the
studio corpus config. Suites that need `../keyboards` run under
`packages/engine/vitest.corpus.config.ts`. The rest run in the default engine config.

## Corpus

| Keyboard | Why | Profiles |
|---|---|---|
| the engine's and studio's existing scaffold and starting-point fixtures (`basic_kbdus`, `basic_kbdfr`, `sil_cameroon_qwerty`, `sil_cameroon_azerty`, …) | broad positional coverage, AZERTY host | 46, 49 |
| `ibono_chwerty` | SC-006: compare with the hand-written `source/extras/ibono_chwerty.xml` | 46 |
| `khmer_angkor` vs `khmer_ldml` | variables, sets, reorder-free transforms, backspace transforms | 46, 49 |
| one mnemonic keyboard (chosen at task time from [docs/keyboard-index.md](../../../docs/keyboard-index.md); its row added if missing) | row 2.7 | 46 |
| one keyboard with `begin PostKeystroke` and a touch layout | FR-026, Story 4 | 46, 49 |
| one keyboard with option stores (`if()`/`set()`) | Story 1 scenario 2, Story 2 | 46 |

Every keyboard named here must have a phonebook row (CLAUDE.md "Keyboard phonebook").

## H1 — Keyman compile (FR-050, SC-001), profile 46 only

- `keymanCompile(xml) → { messages: {code, severity, line?}[], kmx?, kvk? }` (research R21).
- Assertion: `errorCodes(messages)` deep-equals `expectedKeymanCodes(classification)`. The
  expected set is the union of the codes the export's K items name. A hardware-only export with no
  K items must compile with **zero** errors. Warnings and hints are reported, and they fail the
  test only when they are `WARN_StringDenorm` (the exporter must write NFD).
- Story 3: `run()` on the full project produces a `.kmx` and a `.kvk`.

## H2 — Schema (FR-050), profile 46

`LDMLKeyboardXMLSourceFileReader.load` then `validate` (common-types `SchemaValidators.ldmlKeyboard3`)
returns no errors.

## H3 — CLDR schema (FR-005, FR-050 profile 49, FR-052), both profiles

- `xmllint-wasm` (`validateXML({ xml, schema })`, XSD only) validates against the vendored CLDR
  XSD for the profile's `conformsTo`: `__testing__/cldr/46/ldmlKeyboard3.xsd` and
  `__testing__/cldr/49/ldmlKeyboard3.xsd`.
  - The files are copied from CLDR `release-46` and `release-49`, with their provenance in a
    `PROVENANCE.md`. The 46 copy matches `keyman/resources/standards-data/ldml-keyboards/46/dtd/`.
  - CLDR generates the XSD from the DTD. The matching `ldmlKeyboard3.dtd` is vendored beside it
    for reference.
  - The XSD has no `targetNamespace`, so the harness validates the document with its `xmlns`
    removed.
- The DTD's `@VALUE`/`@MATCH` annotations (for example `minDeviceWidth` 1~999, `width`
  0.01~100) are not enforceable by XSD. H4 checks them.
- Pass means zero validity errors.

## H4 — TR35 conformance (FR-052, SC-010), every touch form, both profiles

`tr35Conformance(xml) → Violation[]`. It must return `[]`. The rules are listed in research R23,
including the gap-key ban. Each rule has a negative unit test built from a minimal hand-written
document.

## H5 — Keystroke equivalence (FR-051, SC-002, SC-003)

- **KMN side**: the engine simulator on a test copy compiled with `&TARGETS any` (research R24).
- **LDML side**: `ldmlInterpreter(xml)`.
- **Sequences**: each key × layer once, each context rule's path, and 200 seeded random walks of
  length 1–6 per keyboard.
- **Comparison**: NFC(KMN text) === LDML text.
- **Pass**:
  - a keyboard with no A/N items has zero mismatches (SC-002);
  - every mismatch on other keyboards is explained: some KMN rule fired on that sequence maps to
    an A/N item (SC-003).

  The report prints each unexplained mismatch as `[FAIL] <keyboard> <keys> kmn=<…> ldml=<…>`.

- **Touch pass** (Story 4): for each touch form and each touch key, compare:
  - the KMN side: a tap through the engine simulator's `TouchTapSession`
    (`packages/engine/src/simulator/tapSimulation.ts`);
  - the LDML side: `ldmlInterpreter.tapTouch(formWidth, layerId, keyId, context?)`, which
    applies the key's output, then the transforms.

  The outputs must satisfy NFC(KMN) === LDML. A mismatch is allowed only on a key with an A/N
  item.

## H6 — Two-path parity (FR-012, SC-005)

For each corpus working copy, the harness:

1. scaffolds the working copy through the studio test helpers (spec 106 replay);
2. builds the preview-path classification from the preview projection;
3. builds the download-path classification from `projectWorkingCopyForOutput`.

Both paths use the same base keyboard. A corpus working copy whose FR-027 default is unavailable
is given an explicit override (`us`), never skipped. It asserts that the site-key sets for coded
items (A, N, K, and M with a hint) are equal (research R25). It also asserts
that the studio findings built from (2) have exactly the coded-item site keys of the report built from
(3), excluding the row-5.15 delivery note (FR-012, SC-005).

## H7 — Profiles (FR-061, FR-065, SC-011)

- **Contract parity**: every row id and code in `ldml-mapping.md` and `ldml-mapping-49.md`
  appears in `profile46.ts`/`profile49.ts`, and the reverse. The test parses the contract
  tables' first and code columns.
- **FR-065, both ways**: for each profile, `keymanSchemaAccepts(conformsTo)` must equal
  `profile.keymanCompilable`. This reads the pinned common-types schema's `conformsTo` enum.
- **Default rule**: the default profile is the newest one with `keymanCompilable: true`.

## H8 — Determinism (FR-030, SC-009)

As [export-package.md](export-package.md#determinism-fr-030-sc-009).

## H9 — Reference comparison (SC-006)

For `ibono_chwerty`, compare per hardware position and layer that both files define: the export's
`output` must equal the hand-written file's, after resolving its CLDR import ids. Key ids are not
compared.

## H10 — Timing (SC-007)

`buildLdmlExport` on the largest corpus keyboard of ≤ 2 000 rules completes in < 2 s, as the
median of 5 runs on CI. The authoring-time `classifyForLdml` target is ≤ 50 ms (plan). A miss
there is reported, not failed, until it is measured.
