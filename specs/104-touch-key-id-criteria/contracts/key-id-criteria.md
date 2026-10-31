# Contract: touch key-id criteria (spec 104)

Normative companion to [../spec.md](../spec.md). Where this contract and the
spec's FR text differ in wording, the meaning is the same; where they differ
in substance, the spec wins and this contract is the defect.

## 1. The production resolver (FR-003)

For one key occurrence (platform × layer × key) and one layer-state, the
resolver returns one production record. A rule-bound key's production can
be a function of context, not of state alone (T_0300 produces U+0300 after
a letter and nothing after a space, in the same state), so the record
carries conditional productions rather than pretending to one output:

```
{ productions: [{ output: char | string | deadkey(name) | layerSwitch(layerId) | none,
                  condition?: string,      // context condition when contextConditional
                  viaFallback?: true }],   // set on a ruled U_ key's decode fall-through entry
  source: "rule" | "u-decode" | "k-fallback" | "emulation" | "none" | "unclassified",
  contextConditional: boolean,
  ruleRefs: nodeId[]        // bindings of any role (see the rule arm)
  fallbackCertain: boolean  // false only for presumptive u-decode (caps-state K_ is certain since T022, §5)
}
```

- `rule`: the spec 063 rule-join (`buildTouchKeyRuleIndex`) binds the key
  id in this state — for K_, T_, and U_ ids alike — AND at least one
  binding is a producing binding: the id in key position of a rule with
  an output, in this state. Non-producing bindings (guard, suppression,
  transition, context membership, store listing) are reported in
  `ruleRefs` but do not set `source`. A ruled U_ key's production is its
  rule's output for the keystrokes the rule matches; its U_ decode is
  the production only for keystrokes no rule matches — so the record for
  a decodable ruled U_ id APPENDS the decode as an additional production
  entry, marked `viaFallback: true` with condition `"no rule matches"`,
  and the record is `contextConditional: true` (matched and unmatched
  keystrokes produce differently). Consumers distinguish the decode
  entry by the typed `viaFallback` marker, never by matching the
  condition label. Where producing
  bindings carry incompatible context conditions, the record is
  `contextConditional: true` and lists one production per condition —
  consumers (the FR-025 table, SC-002 parity) MUST handle the set, never
  collapse it to one output.
- `u-decode`: the id is `U_<HEX>[_<HEX>]*` and no rule binds it in this
  state. Output is the decoded string. This is a PRESUMPTION, not a
  certainty, where the keyboard has a `nomatch` group (U_ taps are
  flagged `LisVirtualKey=false` precisely so `nomatch` sees them) or any
  rule binds the U_ id in any role: then `fallbackCertain: false`.
- `k-fallback`: the id is a `K_` id, no producing rule binds it in this
  state, and the modifier state is state-0 or SHIFT. Output is the US
  base character for that key from KMW's base tables. In any other
  modifier state the production is `none`. The keystroke's Lstate is
  irrelevant to this arm: in caps state the fallback fires with the
  same output the modifier state gives without caps (settled by the
  T022 probe, §5), and the record is `fallbackCertain: true`.
- `emulation`: engine-defined special-function K_ ids (K_BKSP, K_ENTER,
  K_TAB, K_LOPT, K_ROPT, numpad keys) produce through KMW's special
  emulation / command handling / numpad arm, not through rules or the
  base table. These ids are frame-class by role (FR-006) and are
  excluded from FR-002 equality and from severance.
- `none`: a T_ id with no producing binding (and no `nextlayer`), any
  classified id in a state with no rule and no applicable fallback, or a
  spacer/blank class key. For a producing-class T_ key, `none` is the
  FR-009/FR-023 dead-key finding, not a legitimate production.
- `unclassified`: an imported id outside the K_/T_/U_ families (ISO 9995
  and other non-prefixed forms). No criterion may consume an
  `unclassified` production; in particular FR-009 MUST NOT read it as
  dead.

Every consumer named in FR-003 takes production from this resolver.
A consumer that classifies a key by prefix, by keycap text, or by U_-decode
alone is non-conformant.

## 2. The minting / destination decision (FR-005, FR-010)

Input: the key's role set, its desired per-state productions, whether rule
logic is required, any existing identity, the keyboard's `&VERSION`, and
the keyboard's guard specification (for marks). First matching arm wins:

| # | Condition | Destination |
|---|---|---|
| 0 | Desired behaviour equals the linked physical key's behaviour in every exercised state (FR-002, incl. host rider) | keep `K_` |
| a | Rule logic required; no existing ruled identity | mint `T_` + rules, atomically |
| b | Rule logic required; existing ruled `U_` identity | keep `U_`, write rules against the `U_` id |
| c | No rule logic; plain char, or fixed string with &VERSION ≥ 15.0, provided every segment is a runtime-decodable codepoint (not C0/C1 — the runtime decoder silently skips those) | `U_<HEX>` (multi-segment for strings) |
| c′ | No rule logic; fixed string with &VERSION < 15.0, or a string containing a C0/C1 segment | arm (a) |
| d | Combining mark, no guard specified, not deadkey-composed output | `U_<HEX>` |
| d′ | Combining mark with a guard specified | arm (a), guard from the keyboard's guard specification |
| d″ | Combining mark that is deadkey-composed output | arm (a), as a deadkey output rule (the guard specification is irrelevant to this route) |
| e | All roles non-producing (frame / navigation / spacer) | `T_` frame class, no rules |

Role-set rule (FR-006): arms are tested against the key's full role set —
producer, layer-switch, subkey host. Any producing role excludes arm (e).
`nextlayer` and subkeys are properties carried by the key under whichever
arm wins; they never change the arm.

Reserved and sentinel ids keep their spec 063 policy (`T_new_`, `T_removed_`,
`T_carved_`, `T_touchdel_` are never author-mintable; `T_BLANK`/`T_SPACER`/
`T_NUL` only as the sentinel they name). Minted `U_` ids use the studio's
padded form; import acceptance stays the permissive upstream regime.

## 3. Severance (FR-008, FR-011)

Trigger: an edit makes desired behaviour differ from the linked physical
key's behaviour in any exercised state (arm 0 fails), or the author
explicitly severs.

Procedure:
1. Collect every rule naming the source key that serves the touch key's
   behaviour, across all groups, with their full contexts — including
   store memberships and shared pattern arms that name the key.
2. First check the target id for collision: the T_ namespace is shared
   with .kmn-only names (e.g. sil_euro_latin rules `[T_N_Dieresis]`,
   which appears on no touch key), so a minted target that already names
   a rule-side concept would silently merge two identities. A collision
   is a refusal under step 3. If every collected rule can be cloned
   verbatim with only the key name
   changed to the new T_ id, do so (one transplant record listing the
   cloned rule node ids, source → target). "Verbatim" is behavioural,
   not just textual: clones keep the source rule's group and relative
   order (Keyman matching is ordered and group-routed), and clone the
   rule NODE including any `if()` guard elements in place — under
   spec 103 a guard is a context element occupying an `index()`
   position, so a transplant that re-derives context instead of cloning
   the node shifts offsets. If group/order cannot be preserved, that is
   a refusal under step 3.
3. If any collected rule's context binds the key to shared stores,
   deadkeys, or other keys' rules such that a verbatim clone would change
   another key's behaviour, REFUSE: emit no clones, flag the key for
   manual definition at its owning step, and record the refusal with the
   binding that caused it.
4. Replace the id only on occurrences in the layer family where arm 0
   failed; occurrences in other families keep the K_ id and their rules
   untouched (the same `K_1` on a symbol layer may still be the digit,
   behaviour matching — severing it too would break a working key).
   The transplant record lists the layers affected. Subkeys and
   `nextlayer` are untouched.
5. Record the key identity decision (criterion, track, proposer, author's
   answer where asked) and show the severance line (§6) on the automatic
   paths; on Track 2 the transplant runs only after the author's choice
   (FR-016).

Re-linking (T_/U_ → K_) is the mirror procedure offered when arm 0 holds
again (FR-029): it deletes the transplanted rules and restores the K_ id,
is offered as an author-invoked recorded action, and is never automatic.

## 4. Carve contract (FR-019, FR-020)

For a removed character, the resolver enumerates every producing occurrence
(all platforms, layers, main keys, subkeys). One operation then:
- neutralises each occurrence to `T_BLANK` / sp 10 (the corpus spelling),
  preserving row geometry; and
- suppresses every rule in each neutralised key's binding set (bare,
  modifier, and guarded forms), except rules whose binding set also serves
  a kept character — those are preserved for the kept character, and if
  the two productions cannot be separated, the operation is refused with
  the binding named (FR-008's refusal rule applied to carve).

For a ruled U_ key both halves are mandatory: key-only removal leaves
orphaned rules; rule-only removal revives production via the U_ decode.

## 5. Caps state and the K_ fallback (settled by T022)

CAPITAL is an Lstate, not an Lmodifier — and the K_ fallback does not
inspect it. KMW's `DefaultOutputRules.forBaseKeys` gates on
`Lmodifiers` alone, so the fallback fires in caps state exactly as it
fires in the same modifier state without caps: state 0 → the unshifted
US base character, SHIFT → the shifted character, any other modifier
state → none.

Settled empirically (T022 probe, 2026-10-18; fixture `caps_probe`,
taps pinned in `tapSimulation.test.ts`): an unmatched K_Q on a caps
layer types `q`; on a caps+SHIFT layer, `Q`. A `[CAPS K_B]` /
`[NCAPS K_B]` witness pair in the same fixture proves the CAPITAL
Lstate genuinely engaged during those taps, so the verdict is not an
artefact of caps state never being presented.

Consequence: there is no caps proviso. The resolver returns the
ordinary k-fallback record for caps-state K_ keys, with
`fallbackCertain: true`; criteria, choices, and repairs may premise
on caps-state fallback values like any other. (Before the probe, this
section barred that: the resolver returned `output: unknown,
fallbackCertain: false` for caps-state K_.)

## 6. Author copy (normative strings, en; fr via the catalogue, FR-026)

- Severance line: "This touch key is now on its own: it types only what
  you set here, and changing the {physicalKeyLabel} key on the typing
  keyboard won't change it." `{physicalKeyLabel}` is the linked key's
  host-layout label, and the line is ONE Lingui descriptor with a value
  placeholder — never assembled by concatenation (FR-026).
- Severance line, no physical key (creation with no physical counterpart,
  FR-005): "This touch key is on its own: it types only what you set
  here, and no typing-keyboard key controls it."
- Guard question (once per keyboard, marks step): "What should happen
  when someone taps a tone mark at the start of a word, or right after a
  space, a number, or punctuation — the mark appears anyway, or nothing
  happens because there is no letter for it to sit on?"
- Track 2 severance choice, keep-link option consequence: "The typing
  keyboard's rules for this key will keep applying to this touch key,
  including any changes made to them later."
- Dead-key repair heading: "This touch key types nothing" — body names
  the key, its layer, and that a touch key with its own name needs a rule
  or a Unicode id to type anything.
