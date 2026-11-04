# Provenance of vendored CLDR / Keyman test data

Copy date: 2026-11-01. Rule: regenerate, never hand-edit. Re-copy from the sources below
when a pin moves; do not modify these files in place.

## cldr/46/ (ldmlKeyboard3.xsd, ldmlKeyboard3.dtd)

- Source: the Keyman repository, `resources/standards-data/ldml-keyboards/46/dtd/`
  (sibling checkout `../keyman`, branch `fix/windows/16462-osk-sticky-modifier`,
  HEAD `0db19a6eb7843bf99aed0473750dbfe47ed9da09`; last commit touching the 46
  directory `fc3abe6b6a3b3ac47573aaffd744a93505fd5feb`, 2025-01-30).
- Upstream pin recorded by Keyman in `46/cldr_info.json`: CLDR `release-46`, commit
  `e1d37acce5dae468c414172be53b666d58d45be8` (2025-01-30).

## cldr/49/ (ldmlKeyboard3.xsd, ldmlKeyboard3.dtd)

- Source: the CLDR repository (`unicode-org/cldr`), tag `release-49`
  (tag resolves to commit `96e54b273d2da4ec6fbad350ba19ff23fa24a588`), path
  `keyboards/dtd/`, fetched from
  `https://raw.githubusercontent.com/unicode-org/cldr/release-49/keyboards/dtd/`.

## fixtures/cldr-samples/ (harness self-tests)

- Source: the Keyman repository `resources/standards-data/ldml-keyboards/46/3.0/`, same
  checkout and HEAD as above (last commit touching these files
  `2c32fb7903cae2251ea0fb4b060e930bb00e0676`, 2025-01-30).
- `fr.xml`: hardware sample (iso layers only). It declares `conformsTo="45"`.
- `fr-t-k0-test.xml`: has a touch `<layers formId="touch">` form and the `enter` gap key.
