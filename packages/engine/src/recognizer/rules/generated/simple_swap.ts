// generated — do not edit; source: content/recognizer-rules/s01-direct-substitution.yaml
import type { RecognizerRule } from "../../types.js";
import { interpretPredicate, interpretLift } from "../../interpreter.js";
import type { RecognizerRuleYaml } from "../../yaml-schema.js";

const RULE_DEF = {
  "id": "simple_swap",
  "strategyId": "S-01",
  "patternRef": "content/patterns/substitute/simple-swap.yaml",
  "format_status": "provisional",
  "description": "Detect a cluster of one to five independent single-key substitution rules in a KeyboardIR and lift them into the simple-swap Pattern. Each qualifying rule maps exactly one vkey keystroke (with optional modifiers) to exactly one Unicode character, with no store references, no deadkey involvement, and no context dependency. Shift variants of the same base character (e.g. K_Q -> ɛ and SHIFT K_Q -> Ɛ) count as one logical character and are grouped into the same lifted Pattern.\n",
  "predicate": {
    "cluster_type": "single-rule-direct",
    "shared_key": "none",
    "rules": [
      {
        "role": "single",
        "description": "A direct substitution rule: one vkey (with optional modifier) in context, one char in output. No state, no store references, no prior context.\n",
        "context_pattern": [
          {
            "kind": "vkey",
            "count": "exactly_one",
            "constraints": {
              "no_prior_deadkey": true,
              "no_any": true
            }
          }
        ],
        "output_pattern": [
          {
            "kind": "char",
            "count": "exactly_one",
            "constraints": {
              "single_codepoint": true
            }
          }
        ]
      }
    ],
    "store_constraints": [],
    "group_constraints": {
      "usingKeys": true
    },
    "disqualifiers": [
      "IRRule.ownedByPattern is already set (rule already claimed by another recognizer)",
      "context contains a kind=deadkey element (belongs to an S-02 cluster)",
      "output contains kind=deadkey, kind=index, kind=outs, kind=beep, or kind=raw",
      "context or output references a storeRef (store involvement indicates S-02/S-04/S-05)",
      "context has more than one element (context dependency — not a simple swap)",
      "output has more than one element (multi-char output — not a simple swap)",
      "IRGroup.usingKeys is false (nomatch/match group — system rules, not substitutions)"
    ],
    "cluster_constraints": {
      "max_distinct_base_chars": 5
    },
    "combinedWith_if": []
  },
  "lifts_to": {
    "origin": "recognized",
    "patternId": "simple_swap",
    "slot_mapping": {
      "keystrokeCharacterMap": {
        "source": "cluster_rules[*]",
        "transform": "rules_to_keystroke_char_map"
      },
      "swapCharDescriptions": {
        "source": null,
        "transform": "none"
      }
    }
  },
  "corpus_evidence": {
    "keyboards": [
      {
        "id": "akan",
        "path": "release/a/akan/source/akan.kmn",
        "notes": "The canonical S-01 exemplar. Adds ɛ (K_Q) and ɔ (K_C) with case variants (Ɛ on SHIFT K_Q, Ɔ on SHIFT K_C). Exactly 4 rules, 2 distinct base chars. spec §7.5 Akan regression row confirms the tree routes to S-01 for this keyboard (A1=tiny, A3=strong, A4=none).\n"
      },
      {
        "id": "hausa_kano",
        "path": "release/h/hausa_kano/source/hausa_kano.kmn",
        "notes": "Secondary corpus witness (phonebook-indexed, BCP47: ha-Latn). Hausa uses implosive consonants (ɓ, ɗ) and the voiced pharyngeal fricative ɦ that may appear as simple key swaps on unused keys in a Latin-QWERTY layout. Verify S-01 cluster presence against actual source before marking AC checkbox 2 — Hausa keyboards sometimes use S-05 mnemonic sequences instead of direct key swaps for these characters.\n"
      }
    ],
    "expected_recognizedRatio_min": 0.3
  },
  "notes": {
    "linguistic": "S-01 is the simplest strategy, but the 5-character cluster limit is a linguistic judgment call, not an arbitrary number. The spec §7.2 decision tree routes to S-01 only when A1=tiny (fewer than 5 new characters). Above this threshold, keyboards typically have enough characters to benefit from a deadkey or mnemonic organization. The recognizer should NOT silently lift larger clusters as S-01.\n",
    "edge_cases": [
      "A keyboard may have both S-01 (a couple of standalone character swaps) and S-02 (a deadkey family) in the same group. The S-02 recognizer runs first and claims its rules (sets IRRule.ownedByPattern). The S-01 recognizer then runs on the unclaimed rules. Correct ordering is the engine's responsibility, not this rule's.\n",
      "RAlt (RALT K_X) variants are valid S-01 context elements. A keyboard that puts ɛ on RAlt+Q counts as S-01 if the total is still ≤5 distinct base chars.\n",
      "Some keyboards use context= \"\" (empty string literal) instead of a vkey context. These look like \"output only\" rules. Whether to treat them as S-01 or noise depends on the IR parser's handling of string-context rules. For now, require kind=vkey in context; string-context rules are disqualified.\n"
    ]
  }
} satisfies RecognizerRuleYaml;

export const rule: RecognizerRule = {
  id: "simple-swap",
  strategyId: "S-01",
  match: (ir) => interpretPredicate(RULE_DEF, ir),
  lift: (m) => interpretLift(RULE_DEF, m),
};
