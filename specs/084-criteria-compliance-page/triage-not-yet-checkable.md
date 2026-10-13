# Triage: the Not-yet-checkable criteria (spec 084 follow-up)

**Date**: 2026-10-13. **Scope**: the 48 layer-c criteria with no
implemented check, plus §18.6 (`KM_LINT_INVENTORY_UNCOVERED`,
implemented but never firing in the criteria assembly) = **49 rows**.
Every classification below was verified against the code on
`km/084-criteria-page` and, where noted, the real keyboards corpus.

## Classes

- **PRECERTIFY** — Matthew's term (2026-10-13): decided at generation
  time from the generator's closed manifest/invariants, before and
  independently of any post-hoc lint pass. **Authored mode only**;
  a foreign (Compare) keyboard can never claim it.
- **CHECK-NOW** — a deterministic check is implementable today from
  inputs the criteria assembly already has (output VFS, parseKmn IR,
  parseKvks / parseTouchLayout / parseKps*, buildProducedSet,
  DocLintInput). Facts read back from files are CHECK-NOW, *not*
  precertification, unless the generator invariant itself guarantees
  them.
- **WIRING** — checkable once one small named input that already
  exists elsewhere in the app (or as a small static dataset) is fed
  to the assembly.
- **CONFIRM** — the mechanical premise is false or judgement-based;
  the honest resolution is author attestation / human confirmation.
- **EXTERNAL** — the deciding state lives outside the single
  keyboard bundle (repo tree, git history, another folder). Stays
  Not yet checkable in-app; several already resolve Not applicable
  in the common authored case via the existing applicability rules.

## Totals (49 rows)

| Class | Count | Rows |
|---|---|---|
| PRECERTIFY | 2 | 1.1, 1.13 |
| CHECK-NOW | 29 | see tables |
| WIRING | 11 | 1.5, 2.1, 2.2, 2.6, 7.6, 7.21, 8.7, 12.2, 12.3, 18.6, 18.7 |
| CONFIRM | 2 | 9.1, 9.2 |
| EXTERNAL | 5 | 9.4, 15.2, 15.4, 15.5, 16.2 |

Plus one blocked pair inside CHECK-NOW: 1.10b + 2.7 are mechanical
(S) but share a **data defect** — criterion 1.10 pins the current
`.kpj` format as `version="10.0"`, while real keyboards-repo `.kpj`
files carry `<Options><Version>2.0</Version>`. The pinned constant
must be settled/corrected before either check can fire honestly.

## Reconciliation with the Ewondo page (44 Not yet checkable)

48 unimplemented − 5 resolved Not applicable for Ewondo (§15 ×4 +
§16 ×1; not deprecated, not a partner package) + 1 (§18.6, implemented
but its context never assembled) = **44**. Those 44 decompose
exactly: PRECERTIFY 2 · CHECK-NOW 28 (29 minus 15.3, which was
Not applicable for Ewondo) · WIRING 11 · CONFIRM 2 · EXTERNAL 1
(9.4 — Ewondo bundles fonts, so it was live, not Not applicable).
So for a keyboard like Ewondo, **43 of the 44 can leave
Not yet checkable**; only 9.4 is irreducibly repo-state.

## §1–§2 — Repository hygiene & version bumping (13)

Version semantics (verified): "previous version" exists only in
authored **adapt-existing** mode = base's `&KEYBOARDVERSION`
(`workingCopyStore.startIr.header.version`), and the output bump is
a generator invariant (`bumpKeyboardVersion` in serializeWorkingCopy
step 4a). On **new-from-base** there is no previously deployed
version: §§2.1/2.2/2.6 resolve **Not applicable**. Foreign mode has
only the current snapshot — §§1.1/2.1/2.2/2.6 are git-history
questions there (EXTERNAL in foreign mode).

| ID | Class | Source / evidence | Effort |
|---|---|---|---|
| 1.1 files-outside-folder | **PRECERTIFY** | Closed generation manifest (`buildOutputBundle` ships only the projected VFS, keyboard-root-relative) + submission confinement (`isSafeTreePath`, `release/<letter>/<keyboardId>/` prefix assert in the managed-PR pipeline) | S |
| 1.5 duplicate-keyboard-id | WIRING | Start-keyboard catalog (`getStartBrowserService().listAll()`); caveats: catalog scans `release/` only (extending to `experimental/`+`legacy/` is part of the wiring) and the base's own ID must be self-excluded | M |
| 1.6 id-contains-"keyboard" | CHECK-NOW | `resolveOutputKeyboardId` + IR header display name; substring test | S |
| 1.9 duplicate-source-files | CHECK-NOW | VFS `list()`/`entries()`, group by basename + content hash. Not precertifiable: base-carried identical copies on the adapt track must actually be looked at | M |
| 1.10b kpj-format-outdated | CHECK-NOW (blocked) | `.kpj` `<Options><Version>` at VFS root; reader precedent `parseKpjFlags`. Blocked on the 1.10 constant defect above | S |
| 1.13 stray-scratch-files | **PRECERTIFY** | Closed generated manifest (serializeWorkingCopy member set + stubs + docs regen; nothing enters the output except by generator write or as a manifest-enumerated base-carried file). Foreign can CHECK-NOW via scratch-pattern scan | S |
| 2.1 version-not-bumped | WIRING | Diff package files `startVfs` ↔ output VFS (existing store slices) + adapt bump invariant; N/A on new-from-base | M |
| 2.2 spurious-version-bump | WIRING | Same diff as 2.1; on adapt output the changed set is never non-package-only (vacuous Met); N/A new-from-base | M (~S incremental) |
| 2.3 version-format | CHECK-NOW | IR `header.version`; one shared validator for 2.3–2.5 | S |
| 2.4 leading-zero | CHECK-NOW | Same validator | S |
| 2.5 v-prefix/labels | CHECK-NOW | Same validator | S |
| 2.6 version-not-incremented | WIRING | Previous = `startIr.header.version` (adapt only); output > previous by numeric dot-compare; the wiring mostly *proves* the generator invariant. N/A new-from-base | M |
| 2.7 kpj-version-bumped | CHECK-NOW (blocked) | Same `.kpj` field as 1.10b from the opposite direction — the pair pins equality (one reader, one constant, two findings). Same constant defect | S |

## §7/§8/§10 — KMN, KVKS, touch, package (18)

Parsers verified: `parseKvks` → `KvksIR{layers, usealtgr, fontFamily…}`;
`parseKps`/`parseKpsFiles`/`parseKpsFontRefs` (file paths only — no
font family names or license fields exist in the `.kps`);
`IRHeader{targets, bcp47, name, version, storeDirectives}` from the
parseKmn IR the assembly already builds; `buildProducedSet(ir)`
enumerates all outputs (PUA/lookalike scans). **PRECERTIFY: none in
this set** — these are content properties (targets, fonts, layouts
are author-influenced), not file-inventory properties.

| ID | Class | Source / evidence | Effort |
|---|---|---|---|
| 7.2 targets-any-alone | CHECK-NOW | `IRHeader.targets`: fail iff `any` present AND length > 1 | S |
| 7.3 mobile-without-touch | CHECK-NOW | `targets` contains `mobile` + touch-layout presence in VFS / `IR.touchLayout` | S |
| 7.4 modifier-names | CHECK-NOW | kmn chord `modifiers[]` vs `KvksIR.layers[].shift` vs touch layer ids, after a vocabulary-normalization map (encodings differ) | M |
| 7.5 ralt-usealtgr | CHECK-NOW | Any IR chord with RALT + `KvksIR.usealtgr` boolean | S |
| 7.6 compile-warnings | WIRING | Plumb `stage.compileResult` (already on the ready Stage the host holds; today never passed to the resolver); then severity mapping only | S |
| 7.7a display-name-underscore | CHECK-NOW | `IRHeader.name` / `parseKps().displayName`, literal `_` | S |
| 7.9 bitmap-placeholder | CHECK-NOW | `&BITMAP` store value via IR storeDirectives; placeholder basename (e.g. `qaa.ico`) or missing `.ico` in VFS | S |
| 7.10 store-syntax | CHECK-NOW | The assembly's own parseKmn failure is observable; full fidelity via compile diagnostics (same wiring as 7.21) | S |
| 7.12 pua-not-in-experimental | CHECK-NOW | Produced-set scan U+E000–F8FF + placement (authored: `release/` by generator invariant; foreign: catalog `StartKeyboard.path`) | M |
| 7.14 pua-font-displaymap | CHECK-NOW | `&DISPLAYMAP` store presence; trigger = PUA in produced set + bundled font (proxy — the strict "font is PUA-encoded" reading needs a font cmap parser that does not exist) | M |
| 7.16 kvks-blank | CHECK-NOW | `parseKvks`: zero layers or zero keys. File *absent* ≠ file *blank* — verdicts must state which | S |
| 7.19 redundant-touch-layouts | CHECK-NOW | parseTouchLayout phone vs tablet normalized deep-compare; identical ⇒ finding | M |
| 7.20 touch-font-mismatch | CHECK-NOW | `TouchLayoutIR.platforms[].font` phone vs tablet | S |
| 7.21 compile-errors | WIRING | Same input as 7.6: `compileResult.success === false` or any error/fatal diagnostic | S |
| 8.7 kps-font-missing | WIRING | Blocker: required fonts are referenced by *family name* (KvksIR.fontFamily, touch fonts) but the `.kps` lists only file paths. Named input: TTF/OTF name-table extraction from the font binaries already in the VFS | M |
| 8.12 industry-fonts | CHECK-NOW | Name matching: parseKpsFiles/FontRefs names + family strings vs the industry list | S |
| 8.13 kps-targets-match | CHECK-NOW | `IRHeader.targets` vs `parseKps().targets` vs compiled members in parseKpsFiles | M |
| 10.6 numeric-region-tag | CHECK-NOW | `parseKps().languages[]` / `IRHeader.bcp47[]`: 3-digit M.49 region subtag present ⇒ finding (the criterion *is* the flag) | S |

## §§9/11/12/13/15/16/18 (18 incl. §18.6)

| ID | Class | Source / evidence | Effort |
|---|---|---|---|
| 9.1 font-license-empty | CONFIRM | The premise is false in the corpus: `.kps` has **no per-font license field at all**. Honest form: per-font license attestation in criteriaRecordStore, prefilled from the mechanical bundled-font inventory (`parseKpsFontRefs`) | S |
| 9.2 font-license-open | CONFIRM | No structured license identifier exists in the bundle; the source review text is itself a judgement ("OFL best, GNU/CC/MIT okay"). Attestation; a LICENSE.md scan may be shown as evidence but cannot decide | S |
| 9.4 shared-font-location | EXTERNAL | "Used by more than one keyboard" is repo-wide state. (The location half is bundle-visible in font `<File>` paths) | M, out of page scope |
| 9.6 woff-in-package | CHECK-NOW | VFS + `.kps` file-name scan for `.woff`/`.woff2`. Not precertify: adapt tracks carry base files through | S |
| 11.2 php-osk-layers | CHECK-NOW | The exact complement of implemented 11.6: reuses `extractDataStatesLayers` + `DocLintInput.layerIds` (already populated by collectDocLintInput); one new doc check in `runDocChecks` | S |
| 11.8 php-osk-image | CHECK-NOW | help-php member text (already in DocLintInput): no custom `<img>` ⇒ Met; custom image needs a width constraint (also scan bundled welcome CSS for class-based constraints) | M |
| 12.2 iso-639-5 | WIRING | No collective-code dataset exists in the repo and the langtags index carries no scope marker. Needs one small static ISO 639-5 list as check data | S–M |
| 12.3 numeric-region-contrastive | WIRING | Detection is mechanical (3-digit region), but the "unless contrastive" exception has no representation anywhere in the app. Needs one contrastive-region attestation input in criteriaRecordStore | S |
| 12.4 region-001 | CHECK-NOW | Region subtag `001` in the BCP47 tags; no exception clause | S |
| 13.1 pua-placement | CHECK-NOW | Produced-set PUA scan + path prefix (authored invariant / foreign catalog path). Same condition as 7.12 from the encoding angle | S |
| 13.4 math-latin-lookalikes | CHECK-NOW | Produced-set scan U+1D400–U+1D7FF | S |
| 15.2 deprecated-release-copy | EXTERNAL | Needs a deprecation input the app does not model + the legacy folder's repo state. N/A today when not deprecated | M (a flow, not a check) |
| 15.3 deprecated-kps-linkage | CHECK-NOW | Decidable from this bundle when deprecated: `<RelatedPackage Relationship="deprecates"/>` inside its own `.kps` (verified in real corpus files). Proves *a* linkage exists, not that the ID is the right legacy keyboard | S |
| 15.4 deprecated-md | EXTERNAL | `DEPRECATED.md` lives in the *legacy* keyboard's folder — a different bundle | — |
| 15.5 deprecated-php-title | EXTERNAL | Same: the deprecated keyboard's help .php is the legacy bundle's file | — |
| 16.2 oem-csv | EXTERNAL | The partner `keyboards.csv` under `oem/` is outside the bundle. N/A when not a partner package | — |
| 18.7 mandated-char | WIRING | Reachability exists (produced set); the mandated-symbol data does not — no CLDR currency-per-territory dataset in the repo (the check is explicitly DEFERRED in lintEngine.ts). Needs CLDR supplemental currency data keyed by region | M |
| 18.6 inventory-uncovered | WIRING | See below | M + S |

### §18.6 unblock (two parts)

1. **A `LinguistInventory` builder (M).** `makeLinguistInventory`
   exists in contracts; the check consumes only
   `linguistInventoryChars(inventory)`. Sources: the author's
   confirmed alphabet/marks/punctuation decisions (authoritative —
   today kept only as a flat character list), with CLDR exemplars
   (`engine/src/character-discovery/cldr.ts`,
   `utilities/facet-index/data/cldr-exemplars.json`) as seed/fallback.
2. **The origin guard (S, but a decision).** `check-18-6` skips any
   IR whose `origin !== "scaffolded"`; the assembly re-parses the
   output `.kmn`, so its IR is always `"imported"`. Feeding the
   working IR instead does **not** fix copy/adapt projects (Ewondo
   included — their IR derives from an imported base). The route
   that covers adapt mode is relaxing the guard to skip only
   imported IRs that still carry raw fragments. The false-positive
   class is real but bounded (opaque store content can make
   reachable characters look uncovered; the check's own header and
   hint already document this). **This is Matthew's call, not a
   silent fix.**

## Recommended implementation batches

- **Batch 1 — plumb + scan (all S, inputs in hand; 22 rows):**
  PRECERTIFY 1.1, 1.13 · compile-result mapping 7.6, 7.21 ·
  version validator 2.3, 2.4, 2.5 · 1.6, 7.7a · IR/VFS scans 7.2,
  7.3, 7.5, 7.9, 7.10, 7.16, 7.20, 8.12, 9.6, 11.2, 12.4, 13.1,
  13.4, 15.3.
- **Batch 2 — cross-file reconciliation (M; 7 rows):** 1.9, 7.4,
  7.12, 7.14, 7.19, 8.13, 11.8.
- **Batch 3 — wiring (8 rows):** 1.5 (extend catalog scan to
  experimental/legacy), 2.1/2.2/2.6 (adapt-track version diff),
  8.7 (font name-table extraction), 12.2 (ISO 639-5 list),
  12.3 (contrastive attestation), 18.7 (CLDR currency data).
- **Batch 4 — §18.6 (1 row):** inventory builder + origin-guard
  decision (above).
- **Batch 5 — confirm conversions (2 rows):** 9.1, 9.2 become
  per-font attestations (they leave Not yet checkable for
  Needs human, where they honestly belong).
- **Constant fix (unblocks 2 rows):** settle the `.kpj` current
  format constant (1.10's `10.0` vs corpus `2.0`), then 1.10b + 2.7
  land as one reader, two findings.
- **Stays Not yet checkable (5 rows):** 9.4, 15.2, 15.4, 15.5, 16.2
  — repo-tree state outside the bundle; in the common authored
  case all but 9.4 already resolve Not applicable.

Effect on an Ewondo-class keyboard: Not yet checkable falls from
44 to **1** (9.4) once Batches 1–5 and the constant fix land, with
9.1/9.2 moving to Needs human rather than resolving silently.
