# Spec 092 — follow-ups and design corrections

## DESIGN CORRECTION (2026-10-08, owner ruling) — the live pass never seeds the language code

Owner's summary of the ruling, verbatim:

> "The user selects a target language, and then when they choose a base, it accidentally overrides that language value instead of becoming useful metadata for available keys."

The ruled design, in the owner's three points:

1. The alphabet seeds from the author's selected TARGET language
   (identity questions 1–3). The target-language choice is the ONLY
   source of the language code for identity composition (bcp47),
   exemplar seeding, and the carve needed-set.
2. Base keyboards are just a starting point: the base contributes the
   PRODUCED letter set, and therefore the surplus candidates.
3. The base's letters may or may not be kept — retention is the
   author's decision, asked by the convenience step. Nothing may
   pre-answer it.

**What was wrong.** The live extraction pass seeded the `language-code`
decision from the base's catalog entry (`extractLanguageCode`,
`ctx.catalog.languages[0]`) at the setup commit whenever the author had
left the code unanswered. Choosing a base thereby wrote the identity's
language value: identity recomposed bcp47 from the base's language,
Phase B auto-seeded that language's full exemplar alphabet, and
`useCarveNeededSet` unioned its CLDR slice into the needed set — needed
covered produced, the convenience gate evaluated not-applicable, and
the keep/discard question never rendered (copy-edit.spec.ts:744, spec
034 T028; reproduced headlessly by
`packages/studio/src/t028GateHarness.test.tsx`). An unanswered slot is
honest state; the base's code in it is a wrong fact about the author's
language, consumed downstream as author-declared.

**The fix** (branch `km/fix-t028-gate`). `il_language_code` declares
`seedWhen: () => false` — the pass's own disposition contract (the
`il_copyright_holder` precedent), read only by the live pass — so the
pass skips the module entirely: no seed, no `offered`. Nothing else
changed: the gate, Phase B, and `useCarveNeededSet` correctly consume
an author-declared code; the defect was the code's provenance.

- The code's live source is unchanged and sufficient: IdentityLite
  evaluates the module's `lookupDefault` from the author's own Q1
  resolution during the identity step (T033) and records it as a
  visible, overridable `default` — on every track, since identity
  precedes base choice in the walk. The Continue model ("base settings
  as defaults, overridable") does not depend on the removed seed: no
  track's target-language default ever legitimately arrived through
  the setup pass, which fired after identity completed and filled the
  omitted slot invisibly.
- `extractLanguageCode` stays as the module's `extract` for the
  decision-flow probe (`runDecisionFlow` / DecisionsDemo), which has
  no prior target-language selection to override; SC-001's pre-fill
  measurement is unaffected (`seedWhen` is a live-pass-only contract).
- Contract pinned in `liveExtraction.stepHost.test.ts` (7)/(7b)/(8):
  no record on either track though the base catalog carries a code;
  an author-answered code kept byte-unchanged with no `offered`.

**Residue (recorded, not fixed here).** A draft saved BEFORE this fix
can carry an extracted `language-code` record; spec 093's recalculation
re-runs `extract` for records with extracted provenance (e.g. on a base
switch), which would refresh such a record from the new base instead
of retiring it. No live path creates such a record any more; retiring
legacy ones is a draft-migration question for the lead, not part of
this correction.
