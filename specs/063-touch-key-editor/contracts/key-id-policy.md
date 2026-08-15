# Contract: touch key id minting and validation

Normative for FR-024…FR-029 and FR-045 of [spec.md](../spec.md). Rationale in [research.md](../research.md) R3/R6.

---

## 1. The principle

Keyman Developer's default id for a new key is `T_new_<n>` with no rule — a dead key by construction. The corpus ships **34** of them. Developer can do no better because it has no proposal engine and no access to the `.kmn`; we have both.

Under [spec.md](../../../spec.md) §3c ("Defaults are the product", "no default is a defect"), the studio **proposes a working id and confirms it**. It never presents an empty or sentinel id field, and it never lets a dead key reach the artifact (SC-008).

---

## 1a. The premise, pinned: `T_<HEX>` does **not** self-output

A natural and wrong assumption is that a hex-shaped custom id such as `T_0061` natively emits its codepoint, and that only a mnemonic id such as `T_ACUTE` needs a rule. **Both are equally inert.** Verified in the KeymanWeb engine:

- `web/src/engine/keyboard/src/defaultRules.ts` — `forAny()` is the complete default-output chain (`forSpecialEmulation` → `forNumpadKeys` → `forUnicodeKeynames` → `forBaseKeys`). The only id→output step, `forUnicodeKeynames`, opens with `if(!keyName || keyName.substr(0,2) != 'U_') return null;` (line 163). No branch anywhere parses trailing hex from a `T_` id.
- `forBaseKeys` cannot rescue it: it keys on the keyCode, and a custom key's code is ≥256, assigned by `GetVKCode`'s VKDictionary interning — not a US-layout keycode.
- The keycap behaves identically: `ActiveKey.unicodeIDToText` (`web/src/engine/keyboard/src/keyboards/activeLayout.ts:271`) also requires a `U_` prefix, so a `T_0061` with no `text` renders **blank** as well as producing nothing.
- `web/src/engine/js-processor/src/kbdInterface.ts:502` states the distinction outright: *"will now return true for U_xxxx keys, but not for T_xxxx keys."*

The hex in Cameroon's `T_0300` is therefore a **human** convention, not a machine-interpreted one: it makes the id and the rule body restate each other (`+ [T_0300] > U+0300`) so the pair is trivially cross-checkable. That is also why the keyboard writes all fourteen mark rules explicitly — under a self-outputting id they would be redundant. The AZERTY defect ([research.md](../research.md) R6) is the confirming natural experiment: swapping the layout key from `T_03B1` to `U_03B1` orphaned the rule pair, which is only a meaningful edit because `T_` ids do not self-output.

**Consequence for §2:** the choice between `U_<HEX>` and `T_<HEX>` is never cosmetic. `U_<HEX>` is self-outputting and cannot go dead; `T_<HEX>` is inert until a rule exists, which is precisely what makes it guardable — and what makes an unpaired `T_` key the defect class the dead-key check hunts.

---

## 2. Minting policy

| Author intent | Minted id | Rules written | Why |
|---|---|---|---|
| Single-codepoint output, no guard needed, no case variants | **`U_<HEX>`** | **none** | Keyman derives the output from the id. Simplest possible; zero `.kmn` surface; **cannot go dead**. This is the default. |
| Multi-codepoint / string output (`FCFA`, a digraph) | `T_<MNEMONIC>` | `+ [T_X] > 'FCFA'` | A `U_` id cannot express a string. |
| **Combining mark** (General_Category `M*`) | `T_<UPPERHEX>` | guard **+** producing | A `U_` id **self-outputs before any rule can guard it**, so the diablock protection is reachable only via a `T_` id. This is the technical reason behind Cameroon's convention, not a stylistic one — and the AZERTY defect ([research.md](../research.md) R6) is what happens when it is violated. |
| Case triplication requested | `T_<HEX or MNEMONIC>` | NCAPS / SHIFT+NCAPS / CAPS trio | A `U_` id has one output. |
| Layer switch or UI key | `T_<MNEMONIC>` | none | `nextlayer` does the work; the key is a frame key. |
| Gap or blank | `T_SPACER` / `T_BLANK` | none | Matches the corpus sentinels. |

Hex is **uppercase and zero-padded to at least four digits**, matching both Cameroon's convention and our existing `U_` encoder. Mint the `T_<UPPERHEX>` form from a sibling of that encoder so the two forms cannot drift.

The `U_`-by-default rule is not a simplification we invented: Cameroon's own author uses ruleless `U_00A1` / `U_00BF` for the `¡` / `¿` longpresses under rule-backed `T_0021` / `T_003F` keys ([research.md](../research.md) R6). The policy matches what a skilled author already does, and it makes `WARN_TouchLayoutCustomKeyNotDefined` (0x092) **structurally impossible** for keys the studio creates.

**Case triplication has a fail-safe boundary.** `caseCounterpart` ([casePair.ts](../../../packages/engine/src/character-discovery/casePair.ts)) tests a character against `\p{Ll}` or `\p{Lu}` only, so a **titlecase** single character — General_Category `Lt` (e.g. Dž, Lj, Nj) — matches neither and gets no case-triple proposal. This is fail-safe, not a bug: the proposal UI must say *why* no triple is offered (the character is its own third case-form, not upper or lower) rather than silently proposing nothing.

**Multi-codepoint grapheme clusters are first-class instances of the string-output row.** The "Multi-codepoint / string output" row above is not limited to Latin digraphs like `FCFA` — an Indic conjunct or a split base+matra sequence that a keyboard treats as one authored unit is the same row: `T_<MNEMONIC>` with a literal string output, no different in kind from `T_FCFA`.

### 2.1 Presenting the choice

When both a `U_` and a `T_` path are viable, show the `U_` option **pre-selected** and the `T_` option with the **literal rule text** and the honest reason to prefer it — typically that the same id already appears on N other layers or platforms, so one rule serves all of them. Never present the rule-bearing option as merely "advanced"; for imported keyboards it is often the right answer.

The "already appears on N other layers/platforms" reason string, and every other composed-prose sentence this contract shows in example form, is studio-composed and localized per FR-044/FR-051 — the strings quoted in this document are English illustrations of the *content*, not literals the implementation must emit verbatim.

---

## 3. Validation — rejects the mutation, never merely reports

Per FR-045, each of these blocks the edit rather than emitting a finding. Findings are for layouts we did not create; these are for edits we are about to make.

1. **Syntax.** Two different rules for two different purposes — **importing** an id and **minting** one are not the same check.

   Upstream (`KeyIdType`/`GetKeyIdUnicodeType` in `keyman/developer/src/kmc-kmn/src/kmw-compiler/validate-layout-file.ts`) enforces **no digit-count shape on `U_`** — it splits on `_` and requires each segment to parse as hex into the semantic range `IsValidUnicodeValue`: `[0x20,0x7F] ∪ [0xA0,0x10FFFF]` (excluding surrogates, which fall outside that range already). An unpadded `U_41` is upstream-legal and ships in the wild. The studio therefore validates an **imported** id by semantic range only — the padded `U_[0-9A-F]{4,6}` shape below is a **minting-only** constraint, never a rejection ground for an id we did not create:

   ```
   // Import-time acceptance (matches upstream KeyIdType exactly):
   /^((K_[A-Z0-9_?]+)|(T_\S+)|(U_[0-9A-F_]+))$/   // + per-segment semantic-range check on U_

   // Studio minting only (never applied to reject an imported id):
   U_[0-9A-F]{4,6}(_[0-9A-F]{4,6})*
   ```

   A `K_` id must resolve against one of Keyman's three key-name tables ([research.md](../research.md) R3) — this is where Developer's VK autocomplete table earns its keep as *validation data* rather than as a substitute for validation.

2. **Uniqueness.** No collision with an existing id in the same layer of the same platform, **unless** the new key carries a distinct per-key `layer` override. This is what stops a feature that lets authors add keys from manufacturing the exact ambiguity `touchKeyAddress` documents as unaddressable. (The exemption depends on the contract addition in [touch-key-rule-join.md](touch-key-rule-join.md) §7; without it, reject all in-layer collisions.)

3. **Case.** Reject an id differing only by case from an existing id. `kmcmplib` interns case-insensitively but Developer's validator compares case-sensitively, so such a pair compiles here and warns there — a trap worth closing at the source.

4. **`T_` with no rule.** A `T_` id with zero bindings, no `nextlayer`, and a producing `sp` class is **blocked**, with a proposal pre-filled with the rule we would synthesize ("this key will do nothing — add a rule?"). A dead key must never be creatable. **Opaque carve-out (mirrors [touch-key-rule-join.md](touch-key-rule-join.md) §6.1's P0-4):** when the working copy carries any `RawKmnFragment` (`opaqueFragmentCount > 0`), this hard block MUST downgrade to warn-and-confirm — the join cannot prove a rule for this id isn't hiding inside opaque text, so an unconditional block would be a false positive the author cannot fix by adding a rule that already exists.

5. **`U_` with a rule.** Reclassify per [touch-key-rule-join.md](touch-key-rule-join.md) §2.3: a rule keyed on a `U_` id is an **override**, not automatically redundant — `forUnicodeKeynames` makes the `U_` id self-output *before* any rule can run, so the rule always fires instead of the default, exactly like any other rule. Warn "redundant, offer dropping the rule" only when the rule's produced text equals the id's decoded codepoint(s) exactly; otherwise warn "this rule overrides the id's default output" and offer no fix beyond acknowledging it, since removing an override that changes behavior is not the same act as removing a genuinely redundant rule.

6. **Reserved prefixes.** Never mint, and reject as author input: `T_new_*` (Developer's auto-mint), `T_removed_*` (desktop-modification placeholder), `T_carved_*` (carve cascade), `T_touchdel_*` (touch-method deletion), the sentinels `T_BLANK` / `T_SPACER` / `T_NUL` where not intended as sentinels, and the exact-match private-use triple KeymanWeb injects: `T_*_MT_SHIFT_TO_SHIFT`, `T_*_MT_SHIFT_TO_CAPS`, `T_*_MT_SHIFT_TO_DEFAULT` (`PRIVATE_USE_IDS` in `keyman/common/web/types/src/keyman-touch-layout/keyman-touch-layout-file.ts`). **Correction:** the literal `*` in these ids is valid under both the import and mint regexes above (`T_\S+` and `T_[^\s\]]+` both accept a non-whitespace `*`) — the odd form is a TS-typing convenience upstream, not something either validator's pattern excludes. So this is **not** a regex-exclusion case; collision-rejection here needs an **exact-match blocklist** against `PRIVATE_USE_IDS`, same as upstream's own approach.

---

## 4. Rename

The rename field is **pre-filled with the proposed id**, never blank, and validation runs on every keystroke. Before confirming, the dialog states what the rename touches: occurrences in this layer, in other layers, in other platforms, and any `.kmn` rule referencing the old id. As in §2.1, this impact summary is studio-composed, localized prose (FR-044/FR-051) — not a literal template.

On confirm, the fix-up is complete or the rename does not happen: the key id, every rule keyed on the old id (**producing and guard alike**), the node-id map entries that embed the key id, and any matching address in the deletion overlay.

Two failure modes to avoid explicitly:

- Developer's own layer-rename fix-up iterates the flick map with `forEach` although it is an object, so **flick sub-keys are silently missed**. Handle the flick map as an object.
- Provenance promotion matches by id across all platforms and layers, so a rename must promote the **old** id before and the **new** id after — or promotion silently misses and re-propagation eats the edit. Prefer an **address-matched** promotion (FR-031).

---

## 5. What the author never types

Per [specs/008-data-flow](../../008-data-flow/spec.md) (*"Layer ids are auto-derived, not author-typed (§3c)… there is no user naming step"*):

- **Layer ids** are derived from modifier combos. The Next Layer field is a **picker over existing layers**, never a text box. The single legitimate naming case — an author-added non-modifier plane — arrives in Increment 3 with a hinted default, **never a blank id**.
- **Row ids** are regenerated on emit; there is no row-id UI (Developer agrees).
- **The per-key modifier override** is displayed read-only as "Sends: …", derived from the layer's combo. Increment 1 preserves it but does not author it.
