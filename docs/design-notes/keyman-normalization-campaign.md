# Decision brief: should we campaign for normalization support in the Keyman Engine?

**Status:** decision aid, not a decision. Written to be read once and argued
with.

**Question on the table.** Keyman keyboards match rule context byte-exactly, so a
keyboard breaks when the host application normalizes the buffer differently from
the keyboard's output form. We can fix the keyboards *we* produce at source level
— that work is specified in
[specs/062-canonical-context-tolerance/](../../specs/062-canonical-context-tolerance/spec.md).
The remaining question is whether to spend political capital pushing Keyman to
fix it centrally, which would fix every keyboard, including the thousands that
will never pass through this studio.

The technical evidence is in
[specs/062-canonical-context-tolerance/research.md](../../specs/062-canonical-context-tolerance/research.md).
This document is the argument built on it.

---

## 1. The ask, stated precisely

Not "support Unicode normalization" — that is too vague to act on and invites a
five-year design discussion. The ask is two concrete, separable changes.

### Phase 1 — compiler-side context expansion. No engine change at all.

The `.kmn` compiler expands each rule's context into its canonical equivalence
class at compile time and bakes the variants into the compiled keyboard, driven
by a new header store the author opts into.

- No change to Keyman Core, KeymanWeb, or the mobile engines.
- No binary format change that the *engine* must understand — the output is
  ordinary rules.
- Runs on every Keyman version already installed, worldwide, today.
- Testable against the existing baseline keyboard corpus.
- Fully backward compatible: a keyboard without the store compiles exactly as it
  does now.

This is the entire user-visible benefit for the great majority of real cases, at
a fraction of the risk.

### Phase 2 — declared normalization in the engine.

Add a `TSS_NORMALIZE` system store (next free slot, 45; the enumeration currently
ends at `TSS_DISPLAYMAP 44`) with a format-version bump, and change
`kmx_processor::supports_normalization()` — `core/src/kmx/kmx_processor.hpp:84-86`
— to return the author's declared value instead of the hardcoded `false`.

The payoff for this small diff is disproportionate, because **the machinery
behind that gate is already built, shipped and marker-safe.** `normalize_nfd()`
on the input path, `actions_normalize()` on the output path, marker-safe
segmentation — all of it exists and runs in production for LDML keyboards. Phase
2 is largely a matter of letting KMX keyboards through a door that is already
built.

Values mirror the LDML settings shape, plus a `preserve` option that echoes the
form found rather than rewriting the host's text. **Absent means today's exact
behaviour**, so no existing keyboard changes.

---

## 2. The case for campaigning

**The gap is upstream's own finding, not ours.** Keyman's documentation states it
plainly: *"Keyman does not do any normalisation… This can lead to rules
unexpectedly failing to match. One appropriate solution is to include both normal
Unicode normalisation forms (NFC and NFD) in the context of rules."* The
documented remedy is manual labour proportional to the size of the keyboard.

**The issue is already open, and its body is our exact scenario.** `#3306`
(2020) is a FieldWorks bug report: Galaxie Greek Mnemonic emits precomposed
U+1F01, FLEx decomposes it, rules stop matching. `#5809` (2021) states the
requirement and concedes that handling partially-normalized context with manual
rules is *"somewhat impractical."* We would not be opening a front. We would be
adding weight, a design, and a user constituency to an issue that has been
sitting at milestone *Future* for six years.

**The direction is already endorsed by Keyman's own lead.** From `#3306`:
*"Keyman would always emit a consistent normalisation form, but would
transparently handle either form in the context for keyboard rules. The keyboard
compiler would be updated to ensure that keyboards are internally consistent with
NFC or NFD (probably configurable on the part of the keyboard author, for a
number of legacy reasons)."* That is Phase 1 and Phase 2, described by the person
whose agreement the campaign needs. We are not proposing a new design; we are
proposing to implement one already sketched.

**Keyman has already shipped this behaviour — just not for `.kmn`.** LDML
keyboards get NFD-for-matching and NFC-on-output because TR35 mandates it, with
`<settings normalization="disabled"/>` as the author's opt-out and a compiler
hint when they take it. The capability exists, the author-facing opt-out shape
exists, and disabling it is already treated as noteworthy. The `.kmn` gap is a
coverage gap, not a capability gap — a much easier thing to argue.

**The affected users are the ones both products exist to serve.** FLEx decomposes
on entry. Every SIL language worker typing into FieldWorks with a composed
keyboard is exposed, and the failure is silent: a fallback rule usually emits a
plausible-looking spacing accent rather than nothing, so the data is quietly
wrong rather than obviously broken. That is a data-integrity argument, not an
ergonomics one, and it is the strongest card in the hand.

**We can hand over the hard part.** We are building the context-expansion
transform for the studio regardless. That converts the ask from *"please build
this"* into *"we have built and tested the algorithm; here is a plan for moving
it into the compiler."* Campaigns that arrive with working code and a corpus of
test vectors are answered differently from campaigns that arrive with a
complaint.

**The scope is bounded and honestly stated.** We can name the blockers ourselves
before anyone else raises them (see §3), which is worth more than being talked
out of them later.

---

## 3. The case against — and the honest blockers

**The offset hazard is real and is probably the reason this has never shipped.**
`context(N)` and `index(store,N)` are defined over the context buffer. A
decomposed character occupies two positions where a composed one occupied one, so
renormalizing the buffer silently changes what offset `N` denotes. Across the
installed base of keyboards, that is a correctness hazard with no cheap test. It
is answerable — the feature must be opt-in and default off — but "opt-in" means
the benefit only reaches keyboards someone deliberately updates, which weakens
the "fixes everything centrally" argument considerably. **Be honest that Phase 2
does not retroactively fix the corpus; it only makes the fix expressible.**

**Phase 2 needs a binary format bump.** New `TSS_` constant, version gate,
compiler and engine both aware of it, every platform's engine updated. That is a
release-cycle-scale change, not a patch, and it lands in a queue with everything
else.

**Some hosts cannot be fixed at all.** Where Keyman cannot read the application's
text store — the Linux case described in `#3306` — no amount of engine
normalization helps, because the engine cannot see what it is matching against.
Any campaign that omits this will lose credibility the moment someone raises it.

**We do not need it.** The source-level fix works on every installed Keyman
version, with no gate and nothing for a user to update. Campaigning is therefore
optional in a way that most feature requests are not — which cuts both ways: it
is a weaker "we are blocked" argument, and a stronger "we are not asking you to
unblock us, we are offering to generalise a fix" argument.

**Opportunity cost.** Attention spent on an upstream campaign is attention not
spent on the studio. A six-year-old *Future*-milestone issue does not move
because someone comments on it; it moves because someone commits to the work or
funds it. Be clear-eyed about which of those we are offering.

**Risk of a worse outcome.** If the campaign succeeds partially — a design
discussion opens, a different shape is chosen, our transform no longer matches —
we may end up maintaining a divergent implementation. Low probability, non-zero
cost.

---

## 4. What we lose by not campaigning

Nothing immediately. But the boundary of the source-level fix is worth stating:

- It fixes keyboards produced or adapted through this studio. It does not fix
  the existing corpus.
- Every keyboard author outside this studio keeps hand-writing the tables. The
  236-entry hand-aligned pair table in `sil_cameroon_qwerty` stays the state of
  the art for anyone not using our tooling.
- The advice in Keyman's documentation stays as it is: correct, and impractical
  to follow by hand.
- A keyboard that later drifts out of tolerance has nothing central catching it.

Whether that matters depends on how much of the world's Keyman keyboard authoring
we expect to pass through this studio. If the honest answer is "a small
fraction", the central fix is worth real effort. If it is "most of the keyboards
we care about", campaigning is a nice-to-have.

**This is the actual crux of the decision** and it is not a technical question.

---

## 5. How a campaign would run

Cheapest credible version, in order:

1. **Comment on `#3306`** with the two-phase proposal, explicitly framed as
   implementing the direction already recorded on that issue rather than
   proposing a new one. Cross-reference `#5809`. Include: the FLEx-decomposes-on-
   entry change (the reason the problem got worse, and news to anyone who last
   looked in 2020), the silent-spacing-accent failure mode, and the offset hazard
   named up front with opt-in as the answer.
2. **Offer Phase 1 as the whole first ask.** Keep Phase 2 visible as the
   direction but do not make the conversation about a format bump. A compiler
   change that runs on every installed engine is a far easier "yes".
3. **Bring evidence, not assertion.** The differential-simulation sweep from
   spec 062 produces exactly the artifact this needs: a list of real keyboards in
   the corpus with concrete failing keystroke sequences. "Here are N release
   keyboards that mis-handle decomposed input, with repro steps" is a different
   conversation from "keyboards can break."
4. **Use the internal relationship.** Keyman and FieldWorks are both SIL
   products, and the reported defect is one SIL product's normalization behaviour
   breaking another SIL product's output. That framing routes this as an internal
   integration issue rather than an external feature request, which is a
   materially different queue. Confirm the current ownership and the right forum
   before leaning on this — it is the highest-leverage argument available and the
   easiest to get wrong by assuming.
5. **Only then discuss Phase 2**, once Phase 1 has established that the algorithm
   works and the test vectors exist.

**Do not** open a new issue. **Do not** send a patch to the `keyman` repository
unsolicited. **Do not** frame this as blocking the studio, because it is not, and
saying so would be false.

---

## 6. The decision

| Option | Cost | What it gets |
|---|---|---|
| **A. Don't campaign.** Ship spec 062, keep the analysis on file. | Zero. | Our keyboards are fixed. The corpus is not. |
| **B. Comment and observe.** Post the Phase 1 proposal on `#3306`, respond if there is interest, do not push. | A few hours, once. | Puts a concrete, endorsed-direction design on a six-year-old issue with fresh evidence. Costs almost nothing if ignored. |
| **C. Campaign properly.** B, plus the corpus evidence sweep, plus pursuing the internal SIL routing, plus offering to do the compiler work. | Real, ongoing, and partly not ours to control. | Plausible path to a central fix. Also the only option that fixes keyboards outside this studio. |
| **D. Campaign for Phase 2 directly.** | Highest. | Most likely to stall on the format bump and the offset hazard. |

**Recommendation: B now, and let the spec-062 evidence decide between B and C.**

Option B is close to free and materially improves the state of `#3306` — it adds
a concrete design, a fresh cause (FLEx's change from lazy to immediate
decomposition), and a named failure mode. Escalating to C should be contingent on
something we do not have yet: the corpus sweep from spec 062, which will tell us
how many *release* keyboards are actually affected. If that number is small, the
central fix is not worth a campaign. If it is large, the number itself is the
campaign, and it will be far more persuasive than anything in this document.

Do not choose D. Leading with a binary format change puts the hardest part of the
proposal in front of the easiest, and the easiest part is the one that delivers
almost all the value.

---

## Appendix: the evidence, in one place

| Claim | Source |
|---|---|
| Keyman does no normalization; documented remedy is manual dual-form rules | `help.keyman.com` `developer/language/guide/unicode.md` §Normalisation |
| KMX cached context is the app's text verbatim, "NFU — normalization form unknown, and may be mixed" | `developer/core/19.0/keyboards.md`; `core/src/km_core_state_context_set_if_needed.cpp` |
| The gate | `core/src/processor.hpp:126`; `core/src/kmx/kmx_processor.hpp:84-86` (`false`) |
| The machinery already exists | `core/src/state.cpp:122-126`; `core/src/actions_normalize.cpp` |
| LDML gets it, mandated by TR35, with a single opt-out | `resources/standards-data/ldml-keyboards/46/ldml-keyboard3.schema.json:437-441`; `developer/src/kmc-ldml/src/compiler/ldml-compiler-messages.ts:16` |
| No free system-store slot below 45 | `common/include/kmx_file.h` (`TSS__MAX 44`) |
| The request, with the FLEx scenario and the endorsed direction | `keymanapp/keyman#3306` (2020, milestone *Future*) |
| The requirement, and that manual rules are impractical | `keymanapp/keyman#5809` (2021) |
| Implementation precedent | `keymanapp/keyman#9999` epic, plus #9468, #10468, #10421, #10516 |
| A real keyboard doing this by hand, 236 aligned characters | [`../keyboards/release/sil/sil_cameroon_qwerty`](../keyboard-index.md) |
| A real keyboard with the defect | [`../keyboards/release/sil/sil_yoruba8`](../keyboard-index.md) |
| The keyboard named in the upstream report | [`../keyboards/release/g/galaxie_greek_mnemonic`](../keyboard-index.md) |

Verification caveat carried from
[research.md](../../specs/062-canonical-context-tolerance/research.md): the TR35
wording was gathered through a summarizing fetch and corroborated against the
vendored CLDR 46 schema, but the section number was never pinned. **Re-read TR35
§keyboards first-hand before quoting it in any public comment.**
