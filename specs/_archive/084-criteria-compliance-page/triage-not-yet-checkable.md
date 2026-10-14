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
**Settled 2026-10-14 by Matthew's ruling:** the constant is 2.0;
criterion 1.10 was re-pinned to the `<Options><Version>2.0</Version>`
element form and the pair landed (see the accounting table below).
Corpus verification behind the ruling: all 12 `.kpj` files in the
local keyboards checkout — 11 carry `<Version>2.0</Version>`; the
twelfth (pid_piaroa) predates the element entirely; none carries
any other value, and the studio never authors the value (it inherits
the base keyboard's `.kpj` verbatim).

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
| 1.10b kpj-format-outdated | CHECK-NOW — LANDED (KPJ pair) | `.kpj` `<Options><Version>` at VFS root; reader precedent `parseKpjFlags`. Was blocked on the 1.10 constant defect above; unblocked by the 2026-10-14 ruling (constant = 2.0) | S |
| 1.13 stray-scratch-files | **PRECERTIFY** | Closed generated manifest (serializeWorkingCopy member set + stubs + docs regen; nothing enters the output except by generator write or as a manifest-enumerated base-carried file). Foreign can CHECK-NOW via scratch-pattern scan | S |
| 2.1 version-not-bumped | WIRING | Diff package files `startVfs` ↔ output VFS (existing store slices) + adapt bump invariant; N/A on new-from-base | M |
| 2.2 spurious-version-bump | WIRING | Same diff as 2.1; on adapt output the changed set is never non-package-only (vacuous Met); N/A new-from-base | M (~S incremental) |
| 2.3 version-format | CHECK-NOW | IR `header.version`; one shared validator for 2.3–2.5 | S |
| 2.4 leading-zero | CHECK-NOW | Same validator | S |
| 2.5 v-prefix/labels | CHECK-NOW | Same validator | S |
| 2.6 version-not-incremented | WIRING | Previous = `startIr.header.version` (adapt only); output > previous by numeric dot-compare; the wiring mostly *proves* the generator invariant. N/A new-from-base | M |
| 2.7 kpj-version-bumped | CHECK-NOW — LANDED (KPJ pair) | Same `.kpj` field as 1.10b from the opposite direction — the pair pins equality (one reader, one constant, two findings). Same ruling as 1.10b | S |

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
   silent fix.** — **RULED 2026-10-13 and sharpened past this
   proposal:** Matthew deleted the mechanism rather than relaxing
   it (the `"scaffolded"` value and the guard are gone; the fragment
   condition is the only skip). Verification behind the ruling:
   nothing in production ever stamped an IR `"scaffolded"`, so the
   guard's precondition was unsatisfiable outside its own tests.
   Full record: `decision-18-6-origin-streamline.md`; landed in
   Batch 4 (below).

## Batch 1 landed (2026-10-13, PR #2048)

Batch 1 (the plumb + scan batch below) is implemented on this branch:
commits `e99bf745` (IR/VFS lint checks), `b9dc15e1` (doc + kps checks),
`41b3d0e4` (precertify), `ade0ecd6` (compile-result mapping),
`62414744` (eslint fix). **IMPLEMENTED_LINT_CODES: 19 → 41** — 39
producer-scanned lint/doc checks plus the 2 assembly-synthesized
compile mappings (`ASSEMBLY_SYNTHESIZED_CODES`, pinned exactly by the
catalog drift guard). 1.1 is precertified (authored only), not a lint
code; 1.13 is both precertified (authored) and scanned (foreign).

All 23 listed rows landed (the batch text says 22; the row list
enumerates 23 — counted and verified individually): PRECERTIFY 1.1,
1.13 · compile mapping 7.6, 7.21 · version validator 2.3, 2.4, 2.5 ·
1.6, 7.7a · scans 7.2, 7.3, 7.5, 7.9, 7.10, 7.16, 7.20, 8.12, 9.6,
11.2, 12.4, 13.1, 13.4, 15.3.

Fixture verification (the real `sil_cameroon_qwerty` corpus folder —
the Ewondo walk's base — judged in authored mode through the real
assembly + resolver, with a clean compile result): every Batch 1 row
resolves — 22 Met, 15.3 Not applicable (not deprecated) — and Not yet
checkable falls **44 → 22** (22 rows resolved; the remaining 22 are
Batches 2–5, the KPJ-blocked pair, and the EXTERNAL rows). No Batch 1
check false-fires on this real, merged keyboard.

Placement notes: 11.2 is a doc check in `runDocChecks`; 15.3 reads the
judged keyboard's own `.kps` text via `CriteriaLintInput`; the
.kvks/.kps parsers stay engine-side and their facts cross into
keyboard-lint as a contracts shape (keyboard-lint imports contracts
only). One interaction pinned in `compareCriteriaVerification.test.ts`:
7.9 reads `&BITMAP`, and the Compare preview strip removes that store
when its `.ico` is dangling, so 7.9 is the single named
pristine-vs-mutated divergence (Not met → Met) — both verdicts honest
about the VFS judged.

## Batch 4 landed (2026-10-13, PR #2048)

Batch 4 (§18.6, 1 row) is implemented on this branch: the production
inventory builder + authored wiring (Part A) and the origin
streamline (Part B). §18.6 was already counted implemented
(`IMPLEMENTED_LINT_CODES` unchanged at 41) but could never fire; it
now produces real verdicts in authored mode.

- **Builder** (`studio/src/criteria/buildCriteriaInventory.ts`):
  confirmed decisions ∪ per-target CLDR/SLDR exemplar baseline, per
  Matthew's construction ruling; skips only when a target has no
  CLDR/SLDR entry, surfacing Not yet checkable with the tag named.
  Foreign mode builds no inventory (§18.6 stays Not yet checkable
  there, pinned).
- **Streamline:** `"scaffolded"` deleted from `IROrigin` + zod;
  check-18-6's origin guard deleted. Run condition: inventory
  supplied AND no raw fragments; a fragment-bearing keyboard shows
  Not yet checkable with the raw-fragment reason. Every fixture/test
  literal migrated; persisted legacy draft fixtures deliberately
  left (inert — see the decision note).
- **Ewondo verification** (real `sil_cameroon_qwerty`, authored,
  target `ewo`): re-parsed IR has **0 raw fragments**; the build
  produced an 85-character inventory; **§18.6 = Not met** with 22
  uncovered characters — 19 precomposed tone stacks the keyboard
  produces as base + combining-mark sequences (the check's
  documented strict-precomposed limit; its marks ARE credited) and
  3 exemplar characters it does not emit (U+2010, U+2011, U+2030).
  §18.6 therefore leaves Not yet checkable for Ewondo-class
  keyboards: the Batch 1 count of 22 falls to **21**, the verdict now
  an honest Not met rather than a resolution.

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
- **Batch 4 — §18.6 (1 row): LANDED 2026-10-13** (above): inventory
  builder + the origin streamline Matthew ruled in place of the
  guard-relaxation proposed here.
- **Batch 5 — confirm conversions (2 rows):** 9.1, 9.2 become
  per-font attestations (they leave Not yet checkable for
  Needs human, where they honestly belong).
- **Constant fix (unblocks 2 rows): LANDED 2026-10-14** — Matthew
  ruled the `.kpj` current format constant is 2.0 (1.10's `10.0` was
  the defect); criterion 1.10 was re-pinned and 1.10b + 2.7 landed
  as one reader, two findings (check-kpj in keyboard-lint, facts
  assembled from the judged VFS's root `.kpj`; an absent `.kpj`
  leaves both rows Not yet checkable with the file named).
- **Stays Not yet checkable (5 rows):** 9.4, 15.2, 15.4, 15.5, 16.2
  — repo-tree state outside the bundle; in the common authored
  case all but 9.4 already resolve Not applicable.

Effect on an Ewondo-class keyboard: Not yet checkable falls from
44 to **1** (9.4) once Batches 1–5 and the constant fix land, with
9.1/9.2 moving to Needs human rather than resolving silently.

## Batches 2, 3, 5 + the 10.6 catch-up landed (2026-10-14, PR #2048)

Four commits on `km/084-criteria-page`, one per batch plus one for
the catch-up row that fell between the Batch 1/2 enumerations:

- **Batch 2 — cross-file reconciliation (7 rows):** checks in
  `packages/keyboard-lint/src/checks/criteria/`, gated on
  `CriteriaLintInput` as Batch 1 established (11.8 is a `runDocChecks`
  doc check). 1.9's definition is pinned in the check: same basename
  at 2+ VFS paths with byte-identical content. 7.4's deliverable
  includes the vocabulary-normalization map (KMN tokens / KVKS
  compact codes / touch layer-id words → family + side; NCAPS is a
  negation and deliberately unmapped). 8.13 compares only a
  *declared* `.kps` `<Targets>` list — `parseKps` defaults an absent
  element to `["windows"]`, so the assembly passes targets only when
  the element is present and names the input context-missing
  otherwise. `IMPLEMENTED_LINT_CODES` 41 → 48.
- **Catch-up — 10.6:** `KM_LINT_KPS_NUMERIC_REGION_TAG` had only a
  `lintToQuestion` mapping and no producing check despite its
  CHECK-NOW class; it now sits beside 12.4 in `check-bcp47.ts`
  (shared `regionSubtagOf`). Codes 48 → 49.
- **Batch 3 — wiring (8 rows):** 1.5 and 2.1/2.2/2.6 are **assembly
  verdicts** (`criteria/assemblyVerdicts.ts`), a named synthesis
  beside the compile mapping — no lint producer exists for
  instantiation state. 1.5 compares the output ID against the
  start-keyboard catalog (both builders — the vite plugin and the
  index script — now enumerate `release/`, `experimental/`, and
  `legacy/`), self-excluding the base keyboard's own ID; the verdict
  is withheld while the catalog has not loaded. Version semantics
  per the triage: previous = `startIr.header.version`, output = the
  generator's own bump derivation (`bumpKeyboardVersion`, the same
  one HISTORY rendering uses); 2.1 proves the bump, 2.2 is vacuous
  on adapt, 2.6 is a strict numeric dot-compare. New-from-base
  resolves all three Not applicable via `facts.instantiationMode`;
  foreign receives no verdicts and stays Not yet checkable with the
  reason named. 8.7 extracts TTF/OTF family names (name IDs 16 else
  1) with a small self-contained reader in the studio assembly — no
  new dependency. 12.2's ISO 639-5 list (114 codes, Library of
  Congress Registration Authority list) and 18.7's CLDR currency
  table (CLDR 48, 255 territories) are contracts check data with
  provenance headers. 12.3 consumes one new attestation
  (`criteriaRecordStore.contrastiveAttestation`) with an in-page
  control on the §12.3 row. 18.7 degrades to Not yet checkable
  naming the region when CLDR has no entry for it. Codes 49 → 57
  (4 checks + 4 synthesized verdicts; the synthesized set is pinned
  exactly in `criteriaCatalog.test.ts`).
- **Batch 5 — confirm conversions (2 rows):** 9.1/9.2 resolve
  through per-font license attestations in `criteriaRecordStore`
  (font file name → asserted license + open confirmation), with a
  per-font editor in the §9 rows' expanded evidence. Fonts bundled
  + all attested ⇒ Met; fonts + any unattested ⇒ **Needs human**
  (authored and foreign alike — not Not yet checkable); no fonts ⇒
  Not applicable (the existing §9 predicate). A LICENSE.md scan for
  OFL/GPL/CC mentions is shown on 9.2 as supporting evidence only
  and never decides the row. Their codes join **neither**
  `IMPLEMENTED_LINT_CODES` **nor** `ASSEMBLY_SYNTHESIZED_CODES` —
  no check and no synthesis emits them; the exclusion and its
  reason are documented in `implementedChecks.ts`.

## Full 49-row accounting (after Batches 1–5 + catch-up)

| Row | Criterion (short) | Disposition |
|---|---|---|
| 1.1 | No files outside the keyboard folder | LANDED — Batch 1 (precertify) |
| 1.5 | Keyboard ID not already used | LANDED — Batch 3 (assembly verdict) |
| 1.6 | ID does not contain "keyboard" | LANDED — Batch 1 |
| 1.9 | No duplicate source files | LANDED — Batch 2 |
| 1.10b | .kpj format when adapted from a base | LANDED — KPJ pair (constant ruled 2.0, 2026-10-14; 1.10 re-pinned) |
| 1.13 | No stray/scratch files | LANDED — Batch 1 (precertify + foreign scan) |
| 2.1 | Version bumped if package changed | LANDED — Batch 3 (assembly verdict) |
| 2.2 | No bump for non-package-only changes | LANDED — Batch 3 (assembly verdict) |
| 2.3 | Version numeric dot-separated | LANDED — Batch 1 |
| 2.4 | No leading zero in version | LANDED — Batch 1 |
| 2.5 | No v-prefix or labels | LANDED — Batch 1 |
| 2.6 | New version strictly greater | LANDED — Batch 3 (assembly verdict) |
| 2.7 | .kpj version not bumped | LANDED — KPJ pair (same ruling) |
| 7.2 | &TARGETS any not alone | LANDED — Batch 1 |
| 7.3 | No unsupported mobile targets | LANDED — Batch 1 |
| 7.4 | Modifier names consistent | LANDED — Batch 2 |
| 7.5 | RALT → usealtgr | LANDED — Batch 1 |
| 7.6 | Compiles, no errors/warnings | LANDED — Batch 1 (compile mapping) |
| 7.7a | Display name, no underscores (lint arm) | LANDED — Batch 1 |
| 7.9 | &BITMAP not template placeholder | LANDED — Batch 1 |
| 7.10 | KMN stores balanced syntax | LANDED — Batch 1 |
| 7.12 | PUA keyboard in experimental/ | LANDED — Batch 2 |
| 7.14 | PUA font has display map | LANDED — Batch 2 |
| 7.16 | .kvks not blank | LANDED — Batch 1 |
| 7.19 | Identical phone/tablet layouts deduplicated | LANDED — Batch 2 |
| 7.20 | Same font/size phone & tablet | LANDED — Batch 1 |
| 7.21 | Compiles with no errors | LANDED — Batch 1 (compile mapping) |
| 8.7 | .kps includes required fonts | LANDED — Batch 3 |
| 8.12 | No industry fonts | LANDED — Batch 1 |
| 8.13 | .kps targets match compiled files | LANDED — Batch 2 |
| 10.6 | .kps numeric region tags flagged | LANDED — catch-up commit |
| 9.1 | Font license specified (non-empty) | LANDED — Batch 5 (attestation path; no lint code registered) |
| 9.2 | Font license is open | LANDED — Batch 5 (attestation path; no lint code registered) |
| 9.4 | Shared font is in the shared folder | **REMAINS Not yet checkable — EXTERNAL** (repo-tree state) |
| 9.6 | No WOFF fonts in package | LANDED — Batch 1 |
| 11.2 | Help OSK shows all layers | LANDED — Batch 1 (doc check) |
| 11.8 | OSK images width-constrained | LANDED — Batch 2 (doc check) |
| 12.2 | No ISO 639-5 collective codes | LANDED — Batch 3 |
| 12.3 | Numeric region only if contrastive | LANDED — Batch 3 (check + attestation) |
| 12.4 | No region 001 | LANDED — Batch 1 |
| 13.1 | PUA keyboard in experimental/ | LANDED — Batch 1 |
| 13.4 | No math Latin look-alikes | LANDED — Batch 1 |
| 15.2 | Deprecated keyboard's copy handled in release/ | **REMAINS Not yet checkable — EXTERNAL** (common authored case: Not applicable — not deprecated) |
| 15.3 | Legacy listed as deprecated in .kps | LANDED — Batch 1 |
| 15.4 | deprecated.md created | **REMAINS Not yet checkable — EXTERNAL** (common case: Not applicable) |
| 15.5 | Help title includes "(deprecated)" | **REMAINS Not yet checkable — EXTERNAL** (common case: Not applicable) |
| 16.2 | Partner keyboards.csv updated | **REMAINS Not yet checkable — EXTERNAL** (common case: Not applicable — not a partner package) |
| 18.6 | Inventory fully covered | LANDED — Batch 4 (inventory builder) |
| 18.7 | Mandated currency characters present | LANDED — Batch 3 |

**Remainder: 5 of 49** — the five EXTERNAL rows (9.4, 15.2, 15.4,
15.5, 16.2), which judge repository-tree state outside the judged
bundle; of those, only 9.4 is live in the common authored case, the
other four already resolving Not applicable. With the KPJ pair
landed under the 2026-10-14 ruling, the final accounting is
**44 of 49 landed; only the 5 EXTERNAL rows remain**.

## Ewondo reconciliation (2026-10-14, real sil_cameroon_qwerty folder, authored mode)

Full authored resolution over the corpus folder (the Batch 4
harness shape: real assembly + inventory build + engine + doc
checks + resolver). Counts: **Met 83 · Not met 6 · Not applicable
14 · Needs author 29 · Needs human 8 · Not yet checkable 9**
(Batch 4 state: Not yet checkable 21).

Rows that moved out of Not yet checkable in this run:

- **1.9 → Not met** — 11 byte-identical duplicate groups
  (`Cameroon.ico` in three places, `kb.css` and 9 images in both
  `source/help/` and `source/welcome/`).
- **7.4 → Not met** — Ctrl naming: the .kmn uses `LCTRL`/`RCTRL`,
  the .kvks encodes only `LC`.
- **7.12 → Met**, **7.14 → Met** — no PUA in the produced set.
- **7.19 → Met** — tablet-only touch layout; nothing to dedupe.
- **11.8 → Not met** — 12 custom-image instances with no width
  constraint (height-only and bare images; the `class="full"` image
  is constrained by its CSS rule and passes).
- **10.6 → Met**, **12.2 → Met**, **12.3 → Met** — none of the 278
  declared tags uses a numeric region or a collective code.
- **18.7 → Met** — CM → XAF "FCFA", all producible.
- **8.7 → Not met** — "Andika Afr" is required (touch font) but no
  bundled font family could be extracted in this environment: this
  VM's corpus checkout has no `release/shared/` tree, so the staged
  font binary never enters the VFS. On a complete corpus the same
  run reads the staged font's name table.
- **9.1/9.2 → Not applicable here** — the §9 predicate keys on
  font binaries in the judged VFS, and this folder (as loaded in
  this VM, shared tree absent) contains none. Where fonts are
  bundled (the app surface stages them), the rows present Needs
  human until the author attests each font's license.

Rows that remain Not yet checkable in this run, and why:

- **1.5, 2.1, 2.2, 2.6** — the corpus-folder fixture has no
  workingCopyStore instantiation context (no base/adaptation
  state), so no verdicts are assembled; they resolve in the app,
  where the working copy exists. Reported as they present, not
  forced.
- **8.13** — the package's `.kps` declares no `<Targets>` element;
  the missing input is named rather than defaulted.
- **7.6, 7.21** — no compile result exists in this harness (the
  app supplies the stage's compile result; Batch 1's fixture run
  showed both resolving against a real clean compile).
- **1.10b, 2.7** — the KPJ pair (blocked on the format constant
  at the time of this reconciliation; landed 2026-10-14 under
  Matthew's ruling — the corpus folder's `.kpj` carries 2.0, so
  both rows now resolve Met for this keyboard).

§18.6 is unchanged: **Not met — 22 uncovered characters** against
the Ewondo exemplar inventory, matching Batch 4's first verdict.
