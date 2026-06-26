// generated — do not edit; source: content/recognizer-rules/s02-deadkey-single-tap.yaml
import type { RecognizerRule } from "../../types.js";
import { interpretPredicate, interpretLift } from "../../interpreter.js";
import type { RecognizerRuleYaml } from "../../yaml-schema.js";

const RULE_DEF = {
  "id": "deadkey-single-tap",
  "strategyId": "S-02",
  "patternRef": "content/patterns/desktop-input/deadkey-single-tap.yaml",
  "format_status": "provisional",
  "description": "Detect a three-rule deadkey composition cluster in a KeyboardIR and lift it into the deadkey-single-tap Pattern. The cluster consists of:\n  (1) a trigger rule: one vkey key press sets a named deadkey state,\n  (2) a fan-out rule: the deadkey state plus any() base from a store maps to\n      index() output from a parallel store,\n  (3) an escape rule: the deadkey state plus the same trigger key emits the\n      bare combining accent character.\nAll three rules share the same deadkey id (DK) and live in the same IRGroup.\n",
  "predicate": {
    "cluster_type": "three-rule-deadkey",
    "shared_key": "deadkey.id",
    "rules": [
      {
        "role": "trigger",
        "description": "Pressing a single vkey (no prior state) outputs a deadkey marker. This is the \"arm\" rule — it does not emit a visible character.\n",
        "context_pattern": [
          {
            "kind": "vkey",
            "count": "zero_or_one",
            "constraints": {
              "no_modifiers_required": false,
              "no_prior_deadkey": true
            }
          }
        ],
        "output_pattern": [
          {
            "kind": "deadkey",
            "count": "exactly_one",
            "constraints": {
              "id": "DK"
            }
          }
        ]
      },
      {
        "role": "fan-out",
        "description": "The deadkey state followed by any base letter (from a parallel store) produces the corresponding accented letter (via index into the output store).\n",
        "context_pattern": [
          {
            "kind": "deadkey",
            "count": "exactly_one",
            "constraints": {
              "id": "DK"
            }
          },
          {
            "kind": "any",
            "count": "exactly_one",
            "constraints": {
              "storeRef": "S_bases"
            }
          }
        ],
        "output_pattern": [
          {
            "kind": "index",
            "count": "exactly_one",
            "constraints": {
              "storeRef": "S_output",
              "offset_equals_any_position": true
            }
          }
        ]
      },
      {
        "role": "escape",
        "description": "The deadkey state followed by the same trigger key (pressed twice) emits the bare combining accent mark, allowing the trigger character itself to be typed.\n",
        "context_pattern": [
          {
            "kind": "deadkey",
            "count": "exactly_one",
            "constraints": {
              "id": "DK"
            }
          },
          {
            "kind": "vkey",
            "count": "exactly_one",
            "constraints": {
              "same_as_trigger_rule_vkey": true
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
    "store_constraints": [
      {
        "store": "S_bases",
        "isSystem": false,
        "items_kind": "char"
      },
      {
        "store": "S_output",
        "isSystem": false,
        "items_kind": "char",
        "same_length_as": "S_bases"
      }
    ],
    "group_constraints": {
      "usingKeys": true,
      "all_rules_same_group": true
    },
    "disqualifiers": [
      "Any rule in the cluster has output element kind=raw (unparsed fragment — cannot safely lift)",
      "S_bases or S_output items contain kind=vkey or kind=deadkey (complex stores, not plain char lists)",
      "The two stores have different item counts (parallel-store invariant violated — Layer A bug)",
      "IRRule.ownedByPattern is already set on any rule in the cluster (already claimed)"
    ],
    "combinedWith_if": [
      {
        "condition": {
          "any_rule_in_group": {
            "output_has_element": {
              "kind": "beep"
            }
          }
        },
        "action": "flag_for_human_review",
        "note": "Do not automatically assign combinesWith: [\"S-10\"]. Surface a review annotation on the lifted Pattern so the author can confirm whether the beep is intentional constraint feedback (A6=loud → S-10) or incidental.\n"
      }
    ]
  },
  "lifts_to": {
    "origin": "recognized",
    "patternId": "deadkey_single_tap",
    "slot_mapping": {
      "triggerKey": {
        "source": "rules[trigger].context_pattern[0].name",
        "transform": "none"
      },
      "deadkeyName": {
        "source": "rules[trigger].output_pattern[0].id",
        "transform": "numeric_id_to_label"
      },
      "baseLetters": {
        "source": "stores[S_bases].items",
        "transform": "store_items_to_char_string"
      },
      "accentedForms": {
        "source": "stores[S_output].items",
        "transform": "store_items_to_char_string"
      },
      "accentChar": {
        "source": "rules[escape].output_pattern[0].value"
      }
    }
  },
  "corpus_evidence": {
    "keyboards": [
      {
        "id": "sil_euro_latin",
        "path": "release/sil/sil_euro_latin/source/sil_euro_latin.kmn",
        "notes": "Primary spec §6 exemplar. 92 deadkey rules across multiple accent families (acute, grave, circumflex, tilde, diaeresis, macron). Each family is a canonical three-rule cluster. Confirming this keyboard gets recognizedRatio > 0 is the first AC validation target.\n"
      },
      {
        "id": "basic_kbdfr",
        "path": "release/basic/basic_kbdfr/source/basic_kbdfr.kmn",
        "notes": "French keyboard. Bracket key as circumflex prefix. Uses virtual-key trigger (K_LBRKT) rather than string-literal trigger, which tests that the trigger rule's context_pattern handles both forms.\n"
      },
      {
        "id": "sil_cameroon_qwerty",
        "path": "release/sil/sil_cameroon_qwerty/source/sil_cameroon_qwerty.kmn",
        "notes": "Cameroon QWERTY. Colon as diacritic prefix for Cameroonian General Alphabet characters. Secondary S-02 in an S-08-primary keyboard — tests that the recognizer correctly lifts S-02 clusters even when S-08 is the primary strategy.\n"
      }
    ],
    "expected_recognizedRatio_min": 0.6
  },
  "notes": {
    "linguistic": "The escape rule (trigger-key double-tap) is critical for correct linguistic behavior — without it the trigger character itself cannot be typed. The escape rule's output is the trigger character's own Unicode identity, which may be a combining diacritic (e.g. U+0301 COMBINING ACUTE ACCENT), a spacing modifier letter (e.g. U+02BC MODIFIER LETTER APOSTROPHE), or ordinary punctuation (e.g. U+0027 APOSTROPHE) depending on the keyboard's design. It is NOT always a combining mark. Keyboards that use apostrophe as a deadkey trigger (common for glottal stops and modifier letters in African and Pacific orthographies) emit plain U+0027 from the escape rule, not a combining character. The escape rule must always be present for linguistically complete S-02 behavior.\n",
    "edge_cases": [
      "Some keyboards use string-literal context (e.g. \"'\" > deadkey(acute)) rather than a virtual-key context (+ [K_QUOTE] > deadkey(acute)). The predicate must handle both ContextElement shapes.\n",
      "A keyboard may define multiple S-02 families (e.g. acute + grave + circumflex). Each family has its own distinct deadkey id (DK) and its own trigger key. The recognizer should lift each family as a separate Pattern instance.\n",
      "If index().offset does not equal the 1-indexed position of the any() element in the fan-out rule's context, this is an unusual pattern that should not be silently lifted — do not assume offset is always 2.\n"
    ]
  }
} satisfies RecognizerRuleYaml;

export const rule: RecognizerRule = {
  id: "deadkey-single-tap",
  strategyId: "S-02",
  match: (ir) => interpretPredicate(RULE_DEF, ir),
  lift: (m) => interpretLift(RULE_DEF, m),
};
