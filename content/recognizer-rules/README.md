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

The compiler only emits strategies in its supported set (currently S-01, S-02, S-03, S-07, S-08 — a strategy in the set without a YAML file or interpreter branch, like S-08, recognizes nothing). S-07 (diacritic cycling, issue #2212) claims only the strict unguarded cancel form; the guarded literal enumeration that dominates its exemplar keyboards is not claimed, and its YAML says so. Hand-written TS recognizers (implementing the `RecognizerRule` interface from `packages/engine/src/recognizer/types.ts`) remain the other landing path; S-01 and S-02 exist in both forms, held equivalent by round-trip tests.

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

## Priority order (issue #240 first pass)

1. `s02-deadkey-single-tap.yaml` — S-02 deadkey composition; most common in
   `release/` Latin keyboards (12/20 scanned keyboards). **Landed.**
2. `s01-direct-substitution.yaml` — S-01 simple swap; simple but widespread. **Landed.**
3. `s03-sequence-replace.yaml` — S-03 sequence replace (parallel-store form;
   canonical exemplar `sil_ipa`). **Landed** (issue #342). The digraph form
   and the vkey-trigger near-shape are not claimed by this rule.
4. `s07-diacritic-cycling.yaml` — S-07 cycling; important for several SIL
   keyboards. **Not yet authored.**
5. `s05-mnemonic-spelling.yaml` — S-05 Hausa-style. **Not yet authored.**
6. S-09 and others as time permits.

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
