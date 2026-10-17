# content/recognizer-rules/

Curated rules that teach the pattern recognizer which IR node clusters to lift
into `Pattern` instances with `origin: 'recognized'`.

## Relationship to `content/patterns/`

`content/patterns/` defines what a pattern *is* — its survey questions, KMN
fragment template, and test vectors. A pattern YAML is used by the survey and
scaffolder.

`content/recognizer-rules/` defines how to *find* patterns in an existing
keyboard's `KeyboardIR`. A recognizer rule YAML is used by the recognizer engine
(`packages/engine/src/recognizer/`) at import time. Each rule:

1. Describes an IR node cluster shape (which `IRRule`, `IRStore`, and `IRGroup`
   field values indicate "this is an S-02 deadkey family").
2. Names the `Pattern` to lift when the cluster matches.
3. Describes how to extract slot values from the matched nodes.

Recognition is a separate pass from authoring. A user may start a session from
an imported keyboard (IR already exists) instead of from the survey.

## Format status — TypeScript predicates ratified (issue #232); YAML DSL deferred to v1.2 (issue #273), now landing per-strategy (issue #342)

Issue #232 ratified **TypeScript predicates** as the canonical rule format and **deferred** the YAML DSL to v1.2 (issue #273) — deferred, not rejected (decision record: `docs/spec-signoff.md`, D10). Since then the YAML path has become live infrastructure, one strategy at a time, in the PR #338 shape: a YAML file in this directory is **compiled at build time** by `scripts/compile-recognizer-rules.mjs` (root `prebuild`) into a TypeScript rule under `packages/engine/src/recognizer/rules/generated/`, which runs in `DEFAULT_RULES` alongside the hand-written TS recognizers. Runtime never parses YAML — it runs the generated TS objects, whose cluster finders live in `packages/engine/src/recognizer/interpreter.ts`. (An earlier version of this README said the YAML files "are not parsed by any code" — that is false at build time and was corrected with the S-03 landing, issue #342.)

The compiler only emits strategies in its supported set (currently S-01, S-02, S-03, S-07, S-08, S-09 — a strategy in the set without a YAML file or interpreter branch, like S-08, recognizes nothing). S-07 (diacritic cycling, issue #2212) claims only the strict unguarded cancel form; the guarded literal enumeration that dominates its exemplar keyboards is not claimed, and its YAML says so. S-09 (retroactive reph, issue #2223) claims only the [ra, virama, re-emitted context] form in two form-witness keyboards (one live), under a stated partial deviation from the two-keyboard bar; its YAML says so. Hand-written TS recognizers (implementing the `RecognizerRule` interface from `packages/engine/src/recognizer/types.ts`) remain the other landing path; S-01 and S-02 exist in both forms, held equivalent by round-trip tests.

Not delivered, and not implied by any vocabulary in the schema: **S-11** (guard presence is not a toggle detector — most corpus guards test externally-driven option stores, and `set()` is an opaque fragment today) and **S-12** (`call()` is an opaque fragment by codec design; a schema `call` kind would match nothing). Both are tracked as follow-ons from issue #342.

<details>
<summary>YAML format</summary>

Fields in each file:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique rule identifier; matches the `Pattern.id` it lifts to |
| `strategyId` | yes | S-XX strategy this rule targets |
| `patternRef` | yes | Repo-root-relative path to the corresponding pattern YAML (e.g. `content/patterns/desktop-input/deadkey-single-tap.yaml`). Always resolved from the repository root, not relative to this file's directory. |
| `description` | yes | Human-readable summary of what this rule detects |
| `predicate` | yes | Machine-readable IR cluster match spec (see below) |
| `lifts_to` | yes | How to populate the lifted `Pattern` instance |
| `corpus_evidence` | recommended | Keyboards that validate this rule; required for AC |
| `format_status` | yes | `provisional` until #232 closes; `ratified` after |

### Predicate block structure

```yaml
predicate:
  cluster_type: <string>          # human label, e.g. "three-rule-deadkey"
  shared_key: <field>             # IR field that links rules in the cluster
  rules:                          # one entry per role in the cluster
    - role: <trigger|fan-out|escape|single>
      context_pattern:            # ContextElement[] constraints
        - kind: <vkey|deadkey|any|char|index|raw>
          constraints: { ... }
      output_pattern:             # OutputElement[] constraints
        - kind: <char|deadkey|index|beep|outs|raw>
          constraints: { ... }
  store_constraints:              # IRStore-level checks
    - store: <slot name>
      isSystem: false
      items_kind: <char|vkey|deadkey|raw>
      same_length_as: <other store slot name>
  group_constraints:
    usingKeys: true
    all_rules_same_group: true
  disqualifiers:                  # conditions that veto the match
    - <description>
  combinedWith_if:                # optional combinesWith inference
    - condition: { ... }
      add: <S-XX>
```

### Slot mapping block structure

```yaml
lifts_to:
  origin: recognized
  patternId: <id>
  slot_mapping:
    <slotId>:
      source: <ir_field_path>     # dot-path into the matched cluster
      transform: <optional>       # e.g. "store_items_to_string"
```

</details>

## File naming

The reference YAML files in this directory are named `s<NN>-<strategy-slug>.yaml`, matching the S-XX identifier in
`spec.md §7.3`. This makes the priority order from issue #240 immediately
visible in a directory listing.

## Priority order (issue #240 first pass — order is the #240 queue; statuses are current)

1. `s02-deadkey-single-tap.yaml` — S-02 deadkey composition; most common in
   `release/` Latin keyboards (12/20 scanned keyboards). **Landed.**
2. `s01-direct-substitution.yaml` — S-01 simple swap; simple but widespread. **Landed.**
3. `s03-sequence-replace.yaml` — S-03 sequence replace (parallel-store form;
   canonical exemplar `sil_ipa`). **Landed** (issue #342). The digraph form
   and the vkey-trigger near-shape are not claimed by this rule.
4. `s07-diacritic-cycling.yaml` — S-07 cycling; important for several SIL
   keyboards. **Landed** (issue #2212).
5. `s05-mnemonic-spelling.yaml` — S-05 mnemonic spelling. **Determined —
   not permanent (issue #2224): stays unrecognized.** No sound
   cluster-level discriminator exists, and the cluster-statistical case
   is closed; a future proposal is admissible only in a different
   evidence class and must clear #2224's four-part bar.
6. `s09-retroactive-reph.yaml` — S-09 retroactive reph (canonical exemplar
   `sil_devanagari_phonetic`). **Landed** (issue #2223), with the deviation
   stated in its corpus_evidence.
7. `s06-deadkey-chained-two-tier.yaml` — S-06 chained deadkeys
   (two-trigger chain sense only). **Landed** (issue #2235) as a
   hand-written recognizer (`rules/s06-deadkey-chained-two-tier.ts`,
   registered first in `DEFAULT_RULES`); the YAML here is its record —
   the compiler skips S-06 (not in `SUPPORTED_STRATEGIES`) because the
   finder is hand-written. Census admission: `sil_cameroon_azerty` only
   (n = 1, recorded on issue #2235).

**Determined — not permanent (issue #2213)**: the grouping question is
closed for S-06 (family selection, rule 6) and S-06 (pending-letter,
rule 8) — neither sense has a grouping lift. S-06 (two-trigger chain,
library pattern) is the separate lift at item 7 above, landed via its
gated follow-on, issue #2235.

## Permanently out of scope

**S-12 DLL IME callout — recognition permanently out of scope (issue #2214, km-lead ruling 2026-10-16).** The codec opaquifies `call()`/`return()` rules by design (D8, reason `call-return`); `cs_pinyin`, the sole S-12 exemplar in the corpus, therefore imports as `RawKmnFragment`s classified `not-removable:opaque`. No recognizer rule — over typed IR or over `ir.raw` — will be built for S-12, and `call()` will not be modelled in KeyboardIR for this purpose. Rationale: the strategy's semantics live in an external Windows DLL the studio cannot inspect, simulate, or edit, so a lift has no consuming author outcome — strategy selection already recommends S-12 from the axis vector for new authoring (spec 007 §7.2 rule 1, pattern `content/patterns/ime/dll-ime-callout.yaml`), and recognition would reclassify the fragments from `not-removable:opaque` to `not-removable:unknown`, a less accurate verdict. The opaque presentation is the honest one (spec 037: unrecognized content reads as residue, never as coverage). This closes the *recognition* question only; S-12 remains a supported authoring strategy. It reopens only on a new fact: (i) a second genuine S-12 keyboard (massive/logographic, `call()` as the sole main-group mechanism) appears in the corpus or is named by a real author as an import-adapt base; or (ii) an opaque-construct typing programme arising from the named-deadkey (#2232) or `set()`/S-11 assessments adopts criteria under which `call()` independently qualifies — re-scoped inside that programme, never as a standalone recognizer issue; or (iii) a named consumer appears that must read call rules as typed data. Note: the `call-return` reason also covers bare `return`, a separate construct; any future work must match `call(...)` specifically and account for `match`/`nomatch` rules, which carry call() in typed-raw outputs, not fragments. This record does not decide `set()`/S-11.

**S-13 Touch layer switch — not a recognizer strategy.** S-13 is detected structurally from the typed touch-layout IR (more than one named layer; spec 007 §7.2), not by matching KMN rule clusters, so no rule belongs in this directory.

**Scope note.** This section records permanent exclusions only. S-05 and S-06 are not listed here: both were closed by determination (#2224, #2213) without a permanence ruling — S-05 stays unrecognized subject to its ruling's different-evidence-class bar, and the S-06 chain lift has landed as gated follow-on #2235 (two-trigger chain sense only).

## Adding a new rule

Per-strategy, end-to-end, in one PR (the PR #338 precedent — never land a
schema or compiler-gate slot without an interpreter behind it):

1. Read the matching Pattern in `content/patterns/` for the slot structure.
2. Author the YAML file here (`s<NN>-<slug>.yaml`), including `corpus_evidence`
   (issue #240 AC: at least two validating keyboards — if the corpus cannot
   supply two, say so in the file rather than implying coverage).
3. Add the strategy to `SUPPORTED_STRATEGIES` in `scripts/compile-recognizer-rules.mjs`.
4. Implement the cluster finder + dispatch branch + slot/lift support in
   `packages/engine/src/recognizer/interpreter.ts` (or, for the hand-written
   path, implement the `RecognizerRule` interface in
   `packages/engine/src/recognizer/rules/s<NN>-<slug>.ts`).
5. Run `pnpm run compile-recognizer-rules` to regenerate
   `packages/engine/src/recognizer/rules/generated/` (never hand-edit it) and
   register the rule in `DEFAULT_RULES` in `packages/engine/src/recognizer/index.ts`.
6. Add tests alongside the generated rule / rule file, with fixtures in
   `packages/engine/src/recognizer/rules/__fixtures__/recognizerIr.ts`.
