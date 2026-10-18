# Research: the evidence base for spec 104

This spec was not designed from first principles. It carries an adopted
proposal (Matthew, 2026-10-17) produced by a two-cycle km-lead run:
cycle 1 gathered three independent evidence streams; cycle 2 adjudicated
the drafted criteria (km-keyman and km-domain seats) and settled the one
empirical conflict by experiment (km-verification seat). Full working
papers are in the lead's notes archive (`touch-id-research/`, 2026-10-17);
this file is the durable summary the implementers need.

## 1. Upstream semantics (docs + engine source + experiment)

- **U_ is a fallback, not a shortcut.** KeymanWeb runs the compiled
  keyboard's rules first; only when no rule matches does
  `DefaultOutputRules.forAny` run, whose chain is: special emulation →
  numpad → `forUnicodeKeynames` (U_ decode) → `forBaseKeys` (K_ US base
  table). A rule may name `[U_...]` and then governs the keystrokes it
  matches (docs, virtual-keys guide: "It is still valid to have a rule
  such as `+ [U_0259] > ...`"). The fallback itself does no guard,
  context, or deadkey work: a pending deadkey is neither composed nor
  consumed by a U_ tap that matches no rule.
- **K_ default output is state-limited.** `forBaseKeys` produces the US
  base character only at modifier state 0 or SHIFT; other modifier states
  produce nothing. CAPITAL is an Lstate, not an Lmodifier — caps-state
  fallback is unsettled (spec edge case; probe task in tasks.md).
- **T_ has no fallback at all.** Verified empirically, not just from
  source: fixtures compiled with the studio's toolchain (kmc-kmn
  19.0.240-alpha, kmcmplib WASM) and tapped through the vendored
  KeymanWeb — rule-free `T_0031`, `T_0021`, `T_FCFA` output nothing;
  only ruled keys receive KVKD entries; the compiler generates NO
  layout-derived rules; and the current kmc does not emit the documented
  warning 2092 for a rule-free custom key, so studio's TOUCH_KEY_NO_RULE
  diagnostic is the only guard in the toolchain.
- **The layer name is the modifier state** (substring synthesis in
  `Codes.getStateFromLayer`): all criteria are per (key × layer-state).
- **Keyman Developer's own gestures encode the intent split**: a blank
  new key is minted `T_new_<n>`; a character dragged onto a key becomes
  `U_<hex>`.

## 2. Corpus census (962 layouts, keymanapp/keyboards, 0 parse failures)

- Main-key instances 233,172: K_ 69.9%, U_ 16.7%, T_ 13.2%. Subkeys
  (198,271): U_ 85.6%. Every layout uses K_; 84.1% use T_; 68.3% use U_.
- T_ concentrates where touch departs from the physical keyboard: symbol
  layers 30.1% T_; the gff_* Ethiopic and fv_* syllabic families
  (touch-first inventories). K_-only keyboards (akan, nias) show no
  departure.
- Distinct (keyboard, T_ id) pairs 11,933: ruled 35.9%, frame/nextlayer
  24.0%, spacer 30.8%, text-only 9.1%. Only 184/809 T_-using keyboards
  have even one ruled T_ id. `T_new_*` appears in 77.1% of keyboards.
- 2,115 rule-free T_<HEX> pairs (basic_* templates) — per §1's verdict
  these are dead keys in production; the census's initial "keycap-text
  default" reading traced to a superseded Keyman-9-era blog line and is
  retracted.
- Combining-mark (keyboard, char) pairs: K_ 3,497 (274 keyboards),
  U_ 1,420 (175), T_ 30 (3). Guarded T_ marks are the Cameroon design,
  not a corpus norm — hence FR-005(d): unguarded mark → U_.
- Ruled U_ exists and matters: 37/961 keyboards rule U_ ids (hindi_flick
  matra checking via `[U_0905]`, armenian_mnemonic option toggles) —
  hence FR-005(b) and FR-020's fail-open rule.
- 55.2% of K_ instances on symbol/numeric layers have no .kmn rule
  reference (fallback-riding / template inheritance) — hence FR-004.
- Same character under two prefixes in one keyboard: 405 keyboards,
  5,389 pairs — hence FR-001 (per occurrence, never per character).

## 3. Studio consumer audit (cycle 1, file:line in the working papers)

Handling splits by mechanism, not by package. Rule-join consumers are
correct for all three prefixes (rule-join, coverage with ruleIndex,
touchRuleSynthesis, the 063/065 proposer policy). The five gaps, ranked
by adapt-flow impact, are FR-003/FR-019…FR-023's work items:

1. Removal/enumeration blindness — `keyMatchesRemovalSet`
   (engine `touch-mechanism-shared.ts`) matches text/output/U_-decode
   only; a ruled T_ producer survives carve and is invisible to
   `enumerateTouchMethodsForChar` while the gallery credits its char.
2. Placement replay is exact-K_-id — `applyDesktopModifications{,ToRawJson}`
   misses a T_/U_ occupant at the intended slot and appends a new U_ key.
3. Combo propagation patches by vkey identity — cloned layers blank
   divergent T_/U_ slots; the bare combo is never requested.
4. Scaffolder discards producing-T_ identity — fresh layouts mint T_ only
   as inert `T_ks_*`; ruled-T_ characters spill to re-minted U_
   longpresses.
5. Inherit gate under-credits U_ — `proposeTouchKeyId`'s coverage test
   is rule-join-only, so an intrinsically producing U_ key is re-minted.

Studio editability itself is prefix-blind (no K_-only gating found);
diagnostics deliberately target T_ for dead keys and treat K_ rules as
never orphaned; keyboard-lint delegates classification to contracts.

## 4. Adjudication record (cycle 2)

- km-keyman: every criterion SOUND or SOUND WITH AMENDMENT. Amendments
  carried into the spec: fallback counts as behaviour only in
  state-0/SHIFT (FR-002); undecidable equality defaults to keep-K_
  (FR-002/FR-004); severance is a rule-level transplant with refusal,
  not output copying (FR-008); ruled U_ is fail-open (FR-020); the
  platform('touch') override alternative for partial redefinition is
  rejected on mechanics (no priority, no negation) — spec §5 source.
- km-domain: FITS / FITS WITH AMENDMENT throughout. Amendments carried:
  host-layout rider (FR-002 rider i — a K_ identity is a host position
  for mnemonic/AZERTY authors); the guard is asked once per keyboard in
  author language (FR-013, contracts §6); role-set classification
  (FR-006 — gff fidel bases are producer + switch + host at once);
  store/pattern transplant (FR-008 — fv fans live in stores); the
  severance copy line (contracts §6).
- km-verification: rule-free T_ is dead (§1) — the spec's P9/FR-009
  repair arm exists because of this verdict.
