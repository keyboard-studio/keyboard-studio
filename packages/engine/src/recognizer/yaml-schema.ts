// Types for the YAML DSL used in content/recognizer-rules/*.yaml

export type RoleType = "trigger" | "fan-out" | "escape" | "single";

export interface ContextConstraints {
  no_prior_deadkey?: boolean;
  no_any?: boolean;
  no_modifiers_required?: boolean;
  id?: string | number;
  same_as_trigger_rule_vkey?: boolean;
  storeRef?: string;
  [key: string]: unknown;
}

export interface ContextPatternEntry {
  // vkey, deadkey, any, char (char = string-literal trigger, per isTrigger() in s02)
  kind: "vkey" | "deadkey" | "any" | "char";
  count: "exactly_one" | "zero_or_one";
  constraints?: ContextConstraints;
}

export interface OutputConstraints {
  single_codepoint?: boolean;
  id?: string | number;
  storeRef?: string;
  offset_equals_any_position?: boolean;
  [key: string]: unknown;
}

export interface OutputPatternEntry {
  // char, deadkey, index, beep, outs, raw
  kind: "char" | "deadkey" | "index" | "beep" | "outs" | "raw";
  count: "exactly_one" | "zero_or_one";
  constraints?: OutputConstraints;
}

export interface RuleEntry {
  role: RoleType;
  description?: string;
  context_pattern: ContextPatternEntry[];
  output_pattern: OutputPatternEntry[];
}

export interface StoreConstraint {
  store: string;
  isSystem?: boolean;
  items_kind?: "char" | "vkey" | "deadkey" | "any" | "raw";
  same_length_as?: string;
}

export interface GroupConstraints {
  usingKeys?: boolean;
  all_rules_same_group?: boolean;
}

export interface CombinedWithCondition {
  any_rule_in_group?: {
    output_has_element?: { kind: string };
  };
}

export interface CombinedWithEntry {
  condition: CombinedWithCondition;
  // flag_for_human_review: sets a provenance annotation on the lifted Pattern;
  // S-10 is NOT automatically added (see s02-deadkey-single-tap.yaml note)
  action: "flag_for_human_review" | string;
  note?: string;
}

export interface PredicateBlock {
  cluster_type: string;
  shared_key?: string;
  rules: RuleEntry[];
  store_constraints?: StoreConstraint[];
  group_constraints?: GroupConstraints;
  // Free-form strings: documentation only; the interpreter implements them as code
  disqualifiers?: string[];
  cluster_constraints?: Record<string, unknown>;
  combinedWith_if?: CombinedWithEntry[];
}

export interface SlotEntry {
  source: string | null;
  // transform is optional; absent means pass-through (same as "none")
  transform?:
    | "rules_to_keystroke_char_map"
    | "store_items_to_char_string"
    | "numeric_id_to_label"
    | "none";
}

export interface SlotMapping {
  [slotId: string]: SlotEntry;
}

export interface LiftsTo {
  origin: "recognized";
  patternId: string;
  slot_mapping?: SlotMapping;
}

export interface CorpusEvidence {
  keyboards?: Array<{
    id: string;
    path?: string;
    notes?: string;
  }>;
  expected_recognizedRatio_min?: number;
}

export interface RecognizerRuleYaml {
  id: string;
  strategyId: string;
  patternRef?: string;
  format_status?: string;
  description?: string;
  predicate: PredicateBlock;
  lifts_to: LiftsTo;
  corpus_evidence?: CorpusEvidence;
  notes?: Record<string, unknown>;
}
