// generated — do not edit; source: content/recognizer-rules/s02-deadkey-single-tap.yaml
import type { RecognizerRule } from "../../types.js";
import { interpretPredicate, interpretLift } from "../../interpreter.js";
import type { RecognizerRuleYaml } from "../../yaml-schema.js";

const RULE_DEF = {
  "id": "deadkey-single-tap",
  "strategyId": "S-02",
  "patternRef": "content/patterns/desktop-input/deadkey-single-tap.yaml",
  "format_status": "provisional",
  "description": "Detect a deadkey composition cluster in a KeyboardIR and lift it into the deadkey-single-tap Pattern. The cluster consists of:\n  (1) a trigger rule: one keystroke (vkey, character literal, or any() over\n      a single-character store) sets a named deadkey state,\n  (2) a fan-out rule: the deadkey state plus any() base from a store maps to\n      index() output from a parallel store,\n  (3) an escape rule (OPTIONAL): the deadkey state plus the trigger key\n      emits the bare accent character.\nA family is keyed by (fan-out group, deadkey id, prefix character, base store, output store) — one deadkey id may carry several families, and the rules of a family need not share a group: triggers live in a 'using keys' group, fan-out and escape in the fan-out's group. A postfix family (a literal prefix character before the deadkey in the fan-out context) is self-triggering: the prefix character is its trigger identity, and no trigger rule need exist. Shape checks run on the context with the codec's '+' separator elements removed; index() offsets count positions in that cleaned context. (Generalised in #2233 — before it, both shipped matchers found zero families on sil_euro_latin and sil_pan_africa_mnemonic.) NFD (base-plus-mark) form, classic context only: a fan-out whose output is index() into the SAME store as its any() (self-indexing, no output store) followed by one or more combining-mark chars lifts to patternId deadkey_single_tap_nfd with a markChars slot (the mark sequence) and no accentedForms slot. Code-level (s02-families.ts nfdMarks); not expressible in the predicate DSL below, which describes the parallel-store form.\n",
  "predicate": {
    "cluster_type": "three-rule-deadkey",
    "shared_key": "deadkey.id",
    "rules": [
      {
        "role": "trigger",
        "description": "Pressing a single keystroke (no prior state) outputs a deadkey marker. This is the \"arm\" rule — it does not emit a visible character. Three keystroke forms occur in the corpus: a vkey ([K_X]), a character literal (\"x\"), and any() over a store holding exactly one character (sil_pan_africa: + any(K_1) > dk(1) with K_1 = \"[\"). An any() over a multi-item store is a set selector, not a trigger. The trigger rule must live in a 'using keys' group. A postfix family has no trigger rule at all — it is self-triggering via its prefix character.\n",
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
        "description": "The deadkey state followed by any base letter (from a parallel store) produces the corresponding accented letter (via index into the output store). Two cleaned-context forms: the classic [deadkey, any] and the postfix [char, deadkey, any] (sil_euro_latin: \"x\" dk(1) + any(K) > index(O, 3)), where the leading char is the family's prefix character. The output must be exactly one index() element — a fan-out whose output carries additional elements (e.g. a use() group transition) is not S-02.\n",
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
        "optional": true,
        "description": "The deadkey state followed by the trigger keystroke emits the bare accent character, allowing the trigger character itself to be typed. Classic cleaned form: [deadkey, vkey|char] > [char]. Postfix cleaned form: [char(X), deadkey, char(X)] > [char(X)] where X is the family's prefix character (the three-way equality is definitional). An escape matched by several families is recorded on each (for its accentChar) and owned by none.\n",
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
              "same_as_trigger_rule_vkey": false
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
        "isSystem": false
      },
      {
        "store": "S_output",
        "isSystem": false,
        "same_length_as": "S_bases"
      }
    ],
    "group_constraints": {
      "usingKeys": true,
      "all_rules_same_group": false
    },
    "disqualifiers": [
      "Any rule in the cluster has output element kind=raw (unparsed fragment — cannot safely lift)",
      "A context under test contains a raw element other than the codec '+' separator (the rule's true shape is unknown — e.g. platform(...) tokens stay unclaimed)",
      "The two stores have different item counts (parallel-store invariant violated — Layer A bug)",
      "The fan-out output is not exactly one index() element (e.g. [index, use] is two-mechanism behaviour, not S-02)",
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
        "notes": "19 families, ALL in the postfix form (\"x\" dk(1) + any(K) > index(O, 3)) sharing the single deadkey dk(1), keyed by prefix character + store pair, each with a postfix escape (\"x\" dk(1) + \"x\" > \"x\"). There is NO typed trigger rule — the arming rules sit behind if() guards and the families are self-triggering. (Corrected in #2233: this keyboard was previously described as canonical three-rule clusters; the shipped matchers in fact found zero families on it.)\n"
      },
      {
        "id": "sil_pan_africa_mnemonic",
        "path": "release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn",
        "notes": "5 families (dk(1) x2 store pairs, dk(2) x3), all roles in one 'using keys' group. Triggers are any() over single-character stores (+ any(K_1) > dk(1), K_1 = \"[\"); the shared triggers serve several families and are owned by none. No escape rules. A sixth dk(1) body with output [index, use] is correctly NOT claimed.\n"
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
    "linguistic": "The escape rule (trigger-key double-tap) is critical for correct linguistic behavior — without it the trigger character itself cannot be typed. The escape rule's output is the trigger character's own Unicode identity, which may be a combining diacritic (e.g. U+0301 COMBINING ACUTE ACCENT), a spacing modifier letter (e.g. U+02BC MODIFIER LETTER APOSTROPHE), or ordinary punctuation (e.g. U+0027 APOSTROPHE) depending on the keyboard's design. It is NOT always a combining mark. Keyboards that use apostrophe as a deadkey trigger (common for glottal stops and modifier letters in African and Pacific orthographies) emit plain U+0027 from the escape rule, not a combining character. The escape rule must be present for linguistically complete S-02 behavior; recognition does not require it (#2233) — keyboards such as basic_kbdfr ship no escape rule and carry the bare accent as slot 0 of the fan-out stores instead.\n",
    "edge_cases": [
      "Some keyboards use string-literal context (e.g. \"'\" > deadkey(acute)) rather than a virtual-key context (+ [K_QUOTE] > deadkey(acute)). The predicate must handle both ContextElement shapes.\n",
      "A keyboard may define multiple S-02 families (e.g. acute + grave + circumflex). Families are keyed by (group, deadkey id, prefix character, base store, output store): one deadkey id may carry several families (sil_euro_latin's 19 families all share dk(1)), told apart by prefix character and store pair. The recognizer lifts each family as a separate Pattern instance.\n",
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
