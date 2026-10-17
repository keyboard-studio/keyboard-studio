// generated — do not edit; source: content/recognizer-rules/s09-retroactive-reph.yaml
import type { RecognizerRule } from "../../types.js";
import { interpretPredicate, interpretLift } from "../../interpreter.js";
import type { RecognizerRuleYaml } from "../../yaml-schema.js";

const RULE_DEF = {
  "id": "retroactive-reph",
  "strategyId": "S-09",
  "patternRef": "content/patterns/desktop-input/retroactive-reph.yaml",
  "format_status": "provisional",
  "description": "Detect a retroactive-reph cluster in a KeyboardIR and lift it into the retroactive_reph Pattern. A cluster is every rule in a single IRGroup sharing one (consonant store, trigger character) pair, of the form: any(consonant store), then zero or more further context elements (any() over a further store, or a literal char — a matra or nukta already typed), then one literal trigger character, emitting the script's ra and virama followed by a re-emission of the whole pre-trigger context in order. The trigger contributes no output element. The codec may preserve the inline \"+\" as a raw context element; the engine ignores that element when matching.\n",
  "predicate": {
    "cluster_type": "retroactive-reph",
    "shared_key": "stores",
    "rules": [
      {
        "role": "reph",
        "description": "A retroactive-reph rule: a previously typed consonant (any() over the consonant store), optionally followed by further already-typed context elements, then the reph key collapses the sequence into ra + virama + the re-emitted context, so the shaping engine renders the dead ra above the cluster.\n",
        "context_pattern": [
          {
            "kind": "any",
            "count": "exactly_one",
            "constraints": {
              "storeRef": "S_consonants"
            }
          },
          {
            "kind": "any",
            "count": "zero_or_more"
          },
          {
            "kind": "char",
            "count": "zero_or_more"
          },
          {
            "kind": "char",
            "count": "exactly_one"
          }
        ],
        "output_pattern": [
          {
            "kind": "char",
            "count": "exactly_one",
            "constraints": {
              "reph_prefix": "ra"
            }
          },
          {
            "kind": "char",
            "count": "exactly_one",
            "constraints": {
              "reph_prefix": "virama"
            }
          },
          {
            "kind": "index",
            "count": "zero_or_more",
            "constraints": {
              "re_emits_context_any_at_own_position": true
            }
          },
          {
            "kind": "char",
            "count": "zero_or_more",
            "constraints": {
              "same_as_context_char": true
            }
          },
          {
            "kind": "context",
            "count": "zero_or_one",
            "constraints": {
              "re_emits_context": true
            }
          }
        ]
      }
    ],
    "store_constraints": [
      {
        "store": "S_consonants",
        "isSystem": false,
        "items_kind": "char"
      }
    ],
    "group_constraints": {
      "all_rules_same_group": true
    },
    "disqualifiers": [
      "IRRule.ownedByPattern is already set on a rule (already claimed)",
      "The rule carries any if() guard (spec 103 FR-007 — guarded rules are not claimed by this pattern)",
      "The output does not begin with the script's (ra, virama) prefix pair (rakār, generic conjuncts, half-forms, ZWNJ-prefixed second-order reph)",
      "The output does not re-emit the entire pre-trigger context in order (partial or reordered re-emission)",
      "The trigger character contributes an output element (the reph key is consumed silently; a rule that types it is a different mechanism)",
      "The last context element is not a literal char (no reph key — e.g. an any()-triggered rewrite)",
      "A store referenced by the context does not resolve in the IR (unresolved refs are no evidence, never a pass)",
      "Any element of the rule is kind=raw other than the codec's inline \"+\" separator (unparsed fragment — cannot safely lift)"
    ],
    "combinedWith_if": []
  },
  "lifts_to": {
    "origin": "recognized",
    "patternId": "retroactive_reph",
    "slot_mapping": {
      "consonantChars": {
        "source": "stores[S_consonants].items",
        "transform": "store_items_to_char_string"
      },
      "triggerChar": {
        "source": "rules[reph].trigger_chars",
        "transform": "none"
      },
      "raChar": {
        "source": "rules[reph].ra_char",
        "transform": "none"
      },
      "viramaChar": {
        "source": "rules[reph].virama_char",
        "transform": "none"
      },
      "consonantStoreName": {
        "source": null
      }
    }
  },
  "corpus_evidence": {
    "keyboards": [
      {
        "id": "sil_devanagari_phonetic",
        "path": "release/sil/sil_devanagari_phonetic/source/sil_devanagari_phonetic.kmn",
        "notes": "The canonical S-09 exemplar (spec §7.3 card) and the LIVE witness. Three reph rules (lines 116-118, each self-labelled \"c reph\"; the ConsonantsU store comment reads \"consonants (so we can reposition the reph)\"): the base rule any(ConsonantsU) + \"R\" > U+0930 U+094D index(ConsonantsU, 1), plus the matra and nukta+matra scaled variants re-emitting the full pre-trigger context in order. All three are claimed as one cluster.\n"
      },
      {
        "id": "hindi_modular",
        "path": "release/h/hindi_modular/source/hindi_modular.kmn",
        "notes": "The FORM witness for the bare-`context` spelling: any(cl) + \"'\" > U+0930 U+094D context (line 181) and any(cl) U+093F + \"'\" > U+0930 U+094D context (line 184). CAVEAT, quoted from the source: the author annotates this block \"These next 4 rules do not fire\" — the form is attested, the mechanism is not live in this file. Its ZWNJ-prefixed sibling rules (lines 182, 185) are NOT claimed (prefix pin).\n"
      }
    ],
    "expected_recognizedRatio_min": 0.007
  },
  "notes": {
    "linguistic": "Reph is not a codepoint: it is the sequence ra + virama held in logical order before a consonant cluster, which the shaping engine renders as a dead ra above the cluster. Typing the consonant first and pressing a reph key afterwards is the natural order for authors who think \"this syllable takes reph\" after typing its onset — the rule exists to reorder, which is what distinguishes S-09 here from pre-typed reph (no rule) and from rakār (ra as the cluster's second member, below the line — the mirror mechanism, not claimed).\n",
    "edge_cases": [
      "One consonant store can serve several reph keys or scripts' clusters; clusters are keyed by (group, store, trigger) and the trigger is part of the lifted Pattern's instance id, so distinct reph keys never collide into one Pattern.\n",
      "A keyboard whose reph rules are all ZWNJ-prefixed second-order forms lifts nothing under this rule: the prefix pin is the boundary, and second-order reph (reph over an existing conjunct) is a separate design question.\n",
      "The (ra, virama) prefix table is seeded with Devanagari only — the only block with witnesses. A Malayalam or Telugu retroactive- reph keyboard lifts nothing until its block's pair is added WITH a witness; the table is corpus-checked knowledge, not a guess.\n"
    ]
  }
} satisfies RecognizerRuleYaml;

export const rule: RecognizerRule = {
  id: "retroactive-reph",
  strategyId: "S-09",
  match: (ir) => interpretPredicate(RULE_DEF, ir),
  lift: (m) => interpretLift(RULE_DEF, m),
};
