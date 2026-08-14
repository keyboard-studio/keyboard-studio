# Research: why context tolerance is solved at source level, not in the engine

Companion to [spec.md](spec.md). This document answers the second half of the
original question — *how would we fix this globally in the Keyman Engine without
upsetting the keyboard developer's preferred composition?* — and records why the
feature is nevertheless specified at source level.

The campaign-facing version of this material, written to be read by people
deciding whether to push for the engine change, is
[docs/design-notes/keyman-normalization-campaign.md](../../docs/design-notes/keyman-normalization-campaign.md).
This document is the evidence; that one is the argument.

**Evidence base.** Keyman `19.0.241` (commit `9cfb74eb`, 2026-06-02), the
`help.keyman.com` source checkout (June 2026), the CLDR 46 LDML keyboard schema
vendored in the Keyman tree, and the live `keymanapp/keyman` issue tracker.
Anything not verified first-hand is flagged at the end.

## 1. `.kmn` has no normalization directive, and the documented workaround is ours

Verified three independent ways.

**The documentation says so outright.** `developer/language/guide/unicode.md`,
published at <https://help.keyman.com/developer/language/guide/unicode>, section
"Normalisation":

> Keyman does not do any normalisation. The codes specified in a keyboard are the
> exact codes that are used. However, some applications internally normalise the
> text store as users type. This can lead to rules unexpectedly failing to match.
> One appropriate solution is to include both normal Unicode normalisation forms
> (NFC and NFD) in the context of rules. Make sure that your output always
> targets a single normalisation form.

That final sentence is the uniformity invariant, and the sentence before it is
context tolerance. Upstream's documented advice **is** the invariant split
[spec.md](spec.md) names — offered as manual labour. This feature automates the
advice Keyman already gives.

**No such store exists.** The reference index carries 50 statement and store
pages; there is no `normalize` page, and the header-store list runs from `&Name`
straight to `&OldCharPosMatching`.

**No slot in the binary format.** `common/include/kmx_file.h` ends the system
store enumeration at `TSS_DISPLAYMAP 44`, with `TSS__MAX 44`. A new store needs a
new `TSS_` constant and a format-version bump.

## 2. Keyman Core already implements this — for LDML keyboards only

This is the finding that reframes the question. The machinery is built, shipped
and marker-safe. It is gated behind a single virtual, and the KMX processor
answers `false`.

| Location | What it establishes |
|---|---|
| `core/src/processor.hpp:126` | `virtual bool supports_normalization() const = 0;` — the gate |
| `core/src/kmx/kmx_processor.hpp:84-86` | KMX returns **`false`** |
| `core/src/ldml/ldml_processor.hpp:80-82` | LDML returns `!normalization_disabled` |
| `core/src/km_core_state_context_set_if_needed.cpp` | on input: `if (should_normalize(state))` → `normalize_nfd(...)`; otherwise the cached context is the app's text verbatim |
| `core/src/state.cpp:122-126`, `core/src/actions_normalize.cpp` | on output: actions converted NFD → NFC across the context\|output boundary, within a normalization-safe segment |

Core maintains two contexts, documented in `developer/core/19.0/keyboards.md`:

- `KM_CORE_DEBUG_CONTEXT_APP` — an exact copy of what the application supplied,
  described as **"NFU — normalization form unknown, and may be mixed
  normalization"**.
- `KM_CORE_DEBUG_CONTEXT_CACHED` — the internal context, which *may be
  normalized* and may contain markers.

For a `.kmn`/KMX keyboard the cached context is byte-identical to the app's NFU
text. Every rule in every Keyman keyboard ever written matches against whatever
the host happened to hand over. That is the defect, stated in upstream's own
terms.

Context-caching semantics that constrain any design here: comparison ignores
cached markers; a *shorter* cached context counts as identical, a *longer* one
forces a reset that **clears all deadkeys and markers**.

`web/src/engine/keyboard/**` contains no normalization code either, so
KeymanWeb's KMX rule processor — and therefore the mobile engines that embed it
— behaves the same way.

## 3. The LDML keyboard spec mandates what `.kmn` lacks

TR35 §keyboards requires NFD for matching and NFC on output: the source is
converted to NFD for processing; transform matching is performed in NFD
regardless of the form in the source file or the edit buffer; text is
re-normalized between transform groups; output is normalized to a specified form,
typically NFC. The single opt-out is `<settings normalization="disabled"/>`,
which the spec accompanies with a caution that the author then owns NFC, NFD and
mixed forms themselves.

Corroborated locally: `resources/standards-data/ldml-keyboards/46/ldml-keyboard3.schema.json:437-441`
declares `settings.normalization` as an enum whose **only legal value is
`disabled`** — normalization is the mandated default and `disabled` is the sole
escape hatch. Keyman's own LDML compiler emits a hint when an author takes it
(`HINT_NormalizationDisabled`, `developer/src/kmc-ldml/src/compiler/ldml-compiler-messages.ts:16`).

So Keyman already ships this behaviour, already has the author-facing opt-out
shape, and already treats disabling it as worth warning about. The `.kmn` gap is
not a capability gap; it is a coverage gap.

## 4. Upstream has tracked it since 2020, with our exact scenario

Keyman uses a dedicated `m:normalization` label. Open issues:

| Issue | Title | Opened |
|---|---|---|
| **3306** | `feat(core): Normalisation in Keyman Core` | 2020-07-02, milestone *Future* |
| **5809** | `feat: support normalization in keyboards` | 2021-10-07 |
| 9466 | `feat(web): identify browser versions: for regex and normalization support` | 2023-08-15 |
| 9598 | `chore(web): global input normalization in lexical models` | 2023-09-20 |

**#3306 is a FieldWorks bug report.** Its body describes Galaxie Greek Mnemonic
with FLEx: the keyboard emits precomposed U+1F01, FLEx decomposes it internally,
so on Windows Keyman sees a decomposed context its rules do not match — and on
Linux, where Keyman cannot read the text store, it emits a backspace for a
character that is no longer there. The direction recorded on the issue:

> A far better solution (which is in the roadmap, at least in theory) is adding
> support for composition and decomposition internally to Keyman Engine… Keyman
> would always emit a consistent normalisation form, but would transparently
> handle either form in the context for keyboard rules. **The keyboard compiler
> would be updated to ensure that keyboards are internally consistent with NFC or
> NFD (probably configurable on the part of the keyboard author, for a number of
> legacy reasons).**

That parenthetical is upstream's own sketch of an author-declared normalization
store, and it matches the write-back policy in [spec.md](spec.md) FR-007.

**#5809** states the requirement and the reason manual work does not scale:

> It is possible to define multiple rules that handle NFC and NFD context, but
> tedious. It is more difficult to handle partially normalized context by
> defining multiple rules — somewhat impractical.

Completed work that built the LDML machinery, available as implementation
precedent: epic **#9999** `feat(core): support normalization in Core`, plus
#9468 (normalization per spec for transforms), #10468 (LDML processor reports
normalization support to Core), #10421 (app context tracking when normalization
is *not* used), #10369 and #10320 (marker normalization), #10516 (reorders must
be normalization-safe), #10554, #10317. Recent maintenance — #15505, #15491 —
shows the code is live, not abandoned.

## 5. Why the engine fix is not simply "flip the `false`"

Setting `kmx_processor::supports_normalization()` to `true` would NFD-normalize
the cached context for every KMX keyboard. That breaks every NFC-authored
keyboard immediately, because **KMX rules are authored against literal
codepoints**: a rule matching U+1ECD stops matching a context that Core has just
decomposed to `o` + U+0323. To match an NFD cached context, an NFC-authored
keyboard's *contexts* must also be projected into NFD.

That projection is exactly the source-level transform [spec.md](spec.md)
specifies.

**Which makes the ordering an argument rather than a coincidence.** The
source-level work is not a stopgap that the engine change would render
pointless; it is the transform the engine change needs in order to be safe, and
upstream's own note on #3306 says the compiler would have to do it. Whether or
not the campaign succeeds, the same expansion is required.

Three further blockers, which are the honest reason this has sat since 2020:

1. **`context(N)` and `index(store,N)` offsets are defined over the context
   buffer.** Renormalizing the buffer silently changes what offset `N` denotes —
   a decomposed character occupies two positions where a composed one occupied
   one. This is a correctness hazard across the entire installed base of
   keyboards, and it is why any such feature must be opt-in and default to
   today's behaviour.
2. **Deadkeys live in the context buffer and are not Unicode characters.** They
   must behave as combining-class-zero blockers that nothing reorders across.
   Core already solves this for LDML markers, so the KMX path would inherit a
   solved problem — but it is not free.
3. **Hosts where Keyman cannot read the text store cannot be fixed by any of
   this.** The Linux case in #3306 is a genuine floor on what the engine change
   can deliver, and any campaign that does not say so will lose credibility when
   someone points it out.

## 6. Why we ship at source level regardless

- **It works on every Keyman version already installed.** A keyboard with
  expanded contexts is an ordinary keyboard. No engine version gate, no
  compiler version gate, nothing for a user to update.
- **It is the documented remedy.** §1 above is Keyman telling authors to do
  precisely this. We are automating advice, not inventing a mechanism.
- **It is proven in the corpus.** `sil_cameroon_qwerty` ships the technique today,
  hand-maintained; `sil_yoruba8` contains hand-written instances of the exact rule
  shape the transform generates.
- **It is a prerequisite for the engine fix**, per §5.
- **The engine fix is not ours to ship.** It is Keyman Core, in C++, in another
  organisation's repository, gated on a binary format bump.

## Caveats and what was not verified

- **TR35 wording in §3 is partly paraphrase.** The specification was fetched twice
  through a summarizing tool; the two passes agreed on substance and the quoted
  sentences, and the mandate is independently corroborated by the vendored CLDR 46
  schema. The **section number was never pinned**, and the surrounding prose
  should be re-read first-hand before any of it is quoted in a campaign document.
  Keyman pins CLDR 46; check whether a later TR35 revision changed anything.
- `ldml_processor`'s `normalization_disabled` field was confirmed to exist and to
  gate `supports_normalization()`, but the exact path by which the runtime reads
  it from the compiled keyboard's settings was not traced.
- The Android and iOS engines were not examined separately; the KeymanWeb finding
  is taken to cover their rule processors, since they embed it.
- The Keyman checkout is recent but is not necessarily today's `master`. Issue
  data was queried live and is current as of this document's date.
