// generated — do not edit; source: content/recognizer-rules/s07-diacritic-cycling.yaml
import type { RecognizerRule } from "../../types.js";
import { interpretPredicate, interpretLift } from "../../interpreter.js";
import type { RecognizerRuleYaml } from "../../yaml-schema.js";

const RULE_DEF = {
  "id": "diacritic-cycling",
  "strategyId": "S-07",
  "patternRef": "content/patterns/desktop-input/diacritic-cycling.yaml",
  "format_status": "provisional",
  "description": "Detect a diacritic-cycling cluster in a KeyboardIR and lift it into the diacritic_cycling Pattern. A cluster is one cancel rule in a single IRGroup — any(marked store) followed by one literal cycle-key character, emitting index(plain store, 1) and then the cycle-key character itself — plus, when present in the same group, its paired apply rule (any(plain store) + the same cycle key > index(marked store, 1)). Clusters are keyed by (group, marked store, plain store, cycle key): one tone family in one case is one cluster (vietnamese_telex carries ten: five tones × two cases). The codec may preserve the inline \"+\" as a raw context element; the engine ignores that element when matching.\n",
  "predicate": {
    "cluster_type": "diacritic-cycling",
    "shared_key": "stores",
    "rules": [
      {
        "role": "cancel",
        "description": "The defining rule: a marked vowel (any() over the marked store) followed by the cycle key collapses back to the positionally corresponding plain vowel (index() into the plain store) and the cycle key is re-emitted literally, so the keypress is not lost.\n",
        "context_pattern": [
          {
            "kind": "any",
            "count": "exactly_one",
            "constraints": {
              "storeRef": "S_marked"
            }
          },
          {
            "kind": "char",
            "count": "exactly_one"
          }
        ],
        "output_pattern": [
          {
            "kind": "index",
            "count": "exactly_one",
            "constraints": {
              "storeRef": "S_unmarked",
              "offset_equals_any_position": true
            }
          },
          {
            "kind": "char",
            "count": "exactly_one",
            "constraints": {
              "same_as_trigger_char": true
            }
          }
        ]
      },
      {
        "role": "apply",
        "description": "The paired rule, attached to the cluster when present in the same group: a plain vowel (any() over the plain store) followed by the same cycle key produces the positionally corresponding marked vowel. A cluster forms on the cancel rule alone if no apply rule is present (or if the apply rule is already owned, e.g. lifted as S-03 by an earlier recognizer pass).\n",
        "context_pattern": [
          {
            "kind": "any",
            "count": "exactly_one",
            "constraints": {
              "storeRef": "S_unmarked"
            }
          },
          {
            "kind": "char",
            "count": "exactly_one"
          }
        ],
        "output_pattern": [
          {
            "kind": "index",
            "count": "exactly_one",
            "constraints": {
              "storeRef": "S_marked",
              "offset_equals_any_position": true
            }
          }
        ]
      }
    ],
    "store_constraints": [
      {
        "store": "S_marked",
        "isSystem": false,
        "items_kind": "char"
      },
      {
        "store": "S_unmarked",
        "isSystem": false,
        "items_kind": "char",
        "same_length_as": "S_marked"
      }
    ],
    "group_constraints": {
      "all_rules_same_group": true
    },
    "disqualifiers": [
      "IRRule.ownedByPattern is already set on a rule (already claimed)",
      "The rule carries any leading if() guard (spec 103 FR-007 — guarded rules are not claimed by this pattern)",
      "The output char does not equal the context trigger char (generic diacritic-add — not a cancel)",
      "The index() target store equals the context any() store (no counterpart store — not a cycle pair)",
      "index() offset does not equal the any() element's context position (1, guards excluded)",
      "The marked or plain store does not resolve in the IR (unresolved refs are no evidence, never a pass)",
      "Any element of the rule is kind=raw other than the codec's inline \"+\" separator (unparsed fragment — cannot safely lift)"
    ],
    "combinedWith_if": []
  },
  "lifts_to": {
    "origin": "recognized",
    "patternId": "diacritic_cycling",
    "slot_mapping": {
      "plainChars": {
        "source": "stores[S_unmarked].items",
        "transform": "store_items_to_char_string"
      },
      "markedChars": {
        "source": "stores[S_marked].items",
        "transform": "store_items_to_char_string"
      },
      "cycleKey": {
        "source": "rules[cycle].trigger_chars",
        "transform": "none"
      },
      "cycleStoreName": {
        "source": null
      }
    }
  },
  "corpus_evidence": {
    "keyboards": [
      {
        "id": "vietnamese_telex",
        "path": "release/v/vietnamese_telex/source/vietnamese_telex.kmn",
        "notes": "The canonical S-07 exemplar (spec §7.3 card, §7.5 row). Ten strict cancel rules (lines 61-62, 74-75, 87-88, 100-101, 113-114): five tones (sac 's', huyen 'f', hoi 'r', nga 'x', nang 'j') × two cases, each with its paired apply rule. The file parses to 72,222 typed rules with 0 opaque at the S-03 base (codec verification, #2212).\n"
      },
      {
        "id": "vietnamese_vni",
        "path": "release/v/vietnamese_vni/source/vietnamese_vni.kmn",
        "notes": "The digit-key variant: any(vowels_sac) + '1' > index(vowels, 1) '1' (line 52) and its four sibling tones. Same stores, same pair shape; validates that the cycle key is an arbitrary literal char, not a letter-only assumption.\n"
      },
      {
        "id": "vietnamese_telex_legacy",
        "path": "release/v/vietnamese_telex_legacy/source/vietnamese_telex_legacy.kmn",
        "notes": "Legacy twin of vietnamese_telex carrying the same ten strict cancel rules; an independent file-level witness of the same mechanism.\n"
      }
    ],
    "expected_recognizedRatio_min": 0.0002
  },
  "notes": {
    "linguistic": "The cycle key is a real character key with a second job: it applies a tone after a plain vowel, and after a marked vowel it cancels the tone and types itself — so doubling the key is the author's escape hatch and no keypress is ever swallowed. This is what distinguishes S-07 from a deadkey (S-02: the first keystroke commits nothing) and from S-03 (the trigger collapses a pair into a different character and is not re-emitted).\n",
    "edge_cases": [
      "Cross-tone swap rules (any(vowels_sac) + 'f' > index(vowels_huyen, 1)) share the apply shape with a different target store. They are not claimed: a swap belongs to two tone families at once. A keyboard whose ONLY cycling rules are swaps lifts nothing under this rule.\n",
      "Case variants are separate clusters ('s' and 'S' over the same store pair): the stores are shared nodes between the two lifted Patterns, which is expected and must not trip ownership checks (stores carry no ownedByPattern) — the same situation as sil_ipa's reverse pair under S-03.\n",
      "An apply rule may already be owned when this rule runs (the S-03 recognizer can claim an unguarded parallel-store apply rule as sequence-replace). The cancel cluster still forms; the apply rule is simply not attached. Cluster formation never depends on the apply rule's availability.\n"
    ]
  }
} satisfies RecognizerRuleYaml;

export const rule: RecognizerRule = {
  id: "diacritic-cycling",
  strategyId: "S-07",
  match: (ir) => interpretPredicate(RULE_DEF, ir),
  lift: (m) => interpretLift(RULE_DEF, m),
};
