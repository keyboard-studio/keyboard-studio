// generated — do not edit; source: content/recognizer-rules/s03-sequence-replace.yaml
import type { RecognizerRule } from "../../types.js";
import { interpretPredicate, interpretLift } from "../../interpreter.js";
import type { RecognizerRuleYaml } from "../../yaml-schema.js";

const RULE_DEF = {
  "id": "sequence-replace",
  "strategyId": "S-03",
  "patternRef": "content/patterns/desktop-input/context-sensitive-substitution.yaml",
  "format_status": "provisional",
  "description": "Detect a sequence-replace cluster in a KeyboardIR and lift it into the context-sensitive-substitution Pattern. Each cluster is one or more rules in a single IRGroup sharing one (base store, output store) pair, of the form: an optional leading if() guard cluster, then any(base store), then one literal trigger character, emitting index(output store, n) where n is the 1-based position of the any() element in the context (leading guards count — the guarded sil_ipa form has n = 2). The codec may preserve the inline \"+\" as a raw context element; the engine ignores that element when matching, exactly as the production detector does.\n",
  "predicate": {
    "cluster_type": "sequence-replace",
    "shared_key": "stores",
    "rules": [
      {
        "role": "single",
        "description": "A sequence-replace rule: previously typed base character (any() over the base store) followed by one literal trigger character collapses to the positionally corresponding marked form (index() into the output store).\n",
        "context_pattern": [
          {
            "kind": "if",
            "count": "zero_or_one",
            "constraints": {
              "storeRef": "guard_store"
            }
          },
          {
            "kind": "any",
            "count": "exactly_one",
            "constraints": {
              "storeRef": "S_bases"
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
              "storeRef": "S_output",
              "offset_equals_any_position": true
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
      "all_rules_same_group": true
    },
    "disqualifiers": [
      "IRRule.ownedByPattern is already set on a rule (already claimed)",
      "The base or output store does not resolve in the IR (unresolved refs are no evidence, never a pass)",
      "Unguarded form whose store pair is NOT a genuine base→marked remap (positional pairs related by decomposition-with-added-marks or by Unicode name extension — the production detector's standard; shape alone would claim any parallel-store remap, S-04/S-05 territory)",
      "index() offset does not equal the any() element's context position counting leading guards",
      "Trigger element is a vkey, not a literal char (vkey-trigger near-shape — not claimed, see header)",
      "First context element (after guards) is not any() (literal-char first element is the digraph form — not claimed, see header)",
      "Any rule in the cluster has output element kind=raw (unparsed fragment — cannot safely lift)"
    ],
    "combinedWith_if": []
  },
  "lifts_to": {
    "origin": "recognized",
    "patternId": "context_sensitive_substitution",
    "slot_mapping": {
      "contextChars": {
        "source": "stores[S_bases].items",
        "transform": "store_items_to_char_string"
      },
      "contextOutputs": {
        "source": "stores[S_output].items",
        "transform": "store_items_to_char_string"
      },
      "triggerChar": {
        "source": "rules[sequence].trigger_chars",
        "transform": "none"
      },
      "contextStoreName": {
        "source": null
      },
      "defaultOutput": {
        "source": null
      }
    }
  },
  "corpus_evidence": {
    "keyboards": [
      {
        "id": "sil_ipa",
        "path": "release/sil/sil_ipa/source/sil_ipa.kmn",
        "notes": "The canonical S-03 exemplar (spec §7.3 card, §7.5 IPA row). Store pairs include equalD/equalU (trigger \"=\"), greatD/greatU (\">\"), lessD/lessU (\"<\"), hatD/hatU (\"^\"), pipeD/pipeU (\"|\"), subscriptD/subscriptU (\"_\"). Each pair appears in an unguarded offset-1 form and an if(option_key='')-guarded offset-2 form.\n"
      },
      {
        "id": "sil_cameroon_qwerty",
        "path": "release/sil/sil_cameroon_qwerty/source/sil_cameroon_qwerty.kmn",
        "notes": "CONTEXT ONLY — not claimed by this rule. Carries the vkey-trigger near-shape: any(composed) + [K_BKSP] > index(comp-dia,1). Recorded so the boundary of this rule is explicit; pid_piaroa (any(vowel) + [RALT K_COMMA] > index(vowel,1)) is the same near-shape family.\n"
      }
    ],
    "expected_recognizedRatio_min": 0.1
  },
  "notes": {
    "linguistic": "The trigger character is typed AFTER the base and stays meaningful on its own (it is a literal suffix key, e.g. \"=\" in IPA transcription); this is what distinguishes S-03 from a deadkey (S-02), where the first keystroke commits nothing visible. The guarded form (if(option_key='')) is the live sil_ipa default: the same pairs also exist unguarded, and both forms must lift — a recognizer that only matches the unguarded form misses the keyboard's canonical state.\n",
    "edge_cases": [
      "sil_ipa also contains a REVERSE pair (any(subscriptU) + \"_\" > index(subscriptD,2)): output store of one cluster is the base store of another. Each (base, output) pair is its own cluster; sharing a store node between two lifted Patterns is expected and must not trip the recognizer's ownership checks (stores carry no ownedByPattern).\n",
      "A trigger character may be shared across pairs (\"_\" serves both subscript directions). Clusters key on the store pair, never on the trigger char alone.\n",
      "Guarded rules qualify on shape + offset alone (production-detector standard): the live sil_ipa pairs do not all pass the base→marked relation check (B → small-capital B is a name change, not a name extension), so applying the relation check to guarded rules would silently lose the canonical exemplar.\n"
    ]
  }
} satisfies RecognizerRuleYaml;

export const rule: RecognizerRule = {
  id: "sequence-replace",
  strategyId: "S-03",
  match: (ir) => interpretPredicate(RULE_DEF, ir),
  lift: (m) => interpretLift(RULE_DEF, m),
};
