// Derived-order regression guard (km/decisions-spike, spec 087 T040).
//
// The thin identity_lite.modular.yaml order list was deleted — the order is
// now derived from the il_* modules' own provides/requires declarations.
// This test pins the derived order against the deleted list's frozen
// content, so any accidental reorder fails loudly. (Provenance: the parity
// test that compared derived vs YAML before the cutover.)

import { describe, it, expect } from "vitest";
import { flowModules, moduleRecord } from "../survey/questions/registry.ts";
import { flowSources, loadFlowSourceDef } from "../steps/flowSources.ts";
import type { QuestionModule } from "../survey/types.ts";
import { orderDecisions } from "./orderDecisions.ts";

/** Frozen from the deleted content/flows/identity_lite.modular.yaml. */
const LEGACY_IDENTITY_LITE_ORDER: readonly string[] = [
  "il_language_english",
  "il_language_region",
  "il_language_autonym",
  "il_language_code",
  "il_target_script",
  "il_script_not_supported",
  "il_author_name",
  "il_author_email",
  "il_copyright_holder",
];

describe("orderDecisions — identity_lite derived order (post-YAML)", () => {
  it("derived order equals the frozen legacy order", () => {
    const derived = orderDecisions(flowModules.identity_lite).map(
      (m) => m.definition.id,
    );
    expect(derived).toEqual([...LEGACY_IDENTITY_LITE_ORDER]);
  });
});

// ---------------------------------------------------------------------------
// Phase G flows (spec 087 T042) — one frozen legacy order per migrated flow.
// Add a row here when migrating the next flow (see flowSources.ts header).
// ---------------------------------------------------------------------------

const FROZEN_LEGACY_ORDERS: ReadonlyArray<{
  flowId: string;
  phase: string;
  registry: Readonly<Record<string, QuestionModule>>;
  order: readonly string[];
}> = [
  // Frozen from the deleted content/flows/track.modular.yaml.
  { flowId: "track", phase: "G", registry: moduleRecord(flowModules.track), order: ["track_choice"] },
  // Frozen from the deleted content/flows/project_name.modular.yaml.
  {
    flowId: "project_name",
    phase: "G",
    registry: moduleRecord(flowModules.project_name),
    order: ["project_display_name", "project_keyboard_id"],
  },
  // Frozen from the deleted content/flows/phase_f_helpdocs.modular.yaml. The
  // demoted pf_usage_tip_3/4/5 stay registered but are not flow members, so the
  // flow's module list (not the whole registry) is what orders.
  {
    flowId: "phase_f_helpdocs",
    phase: "F",
    registry: moduleRecord(flowModules.phase_f_helpdocs),
    order: [
      "pf_welcome_paragraph",
      "pf_usage_tip_1",
      "pf_history_entry",
      "pf_history_entry_bullets",
      "pf_more_detail_gate",
      "pf_doc_language",
      "pf_font_guidance",
      "pf_usage_tip_2",
      "pf_scope_variety",
      "pf_provenance_basis",
      "pf_design_rationale",
      "pf_canonical_order",
      "pf_script_glossary",
      "pf_example_words",
      "pf_troubleshooting",
      "pf_related_keyboards",
      "pf_known_limitations",
      "pf_further_reading",
      "pf_project_url",
      "pf_credits",
      "pf_contact_info",
    ],
  },
  // Order is a topological order of routing (`next`) too: the legacy YAML listed
  // pb_special_letters (the shared-tail join that eight non-roman/Indic/SEA/RTL/
  // syllabic modules route INTO) at index 10, before those modules. The derived order
  // places the join after every module that routes into it; the earlier frozen copy
  // of the legacy order violated routing.
  // Frozen from the deleted content/flows/phase_b_characters.modular.yaml.
  {
    flowId: "phase_b_characters",
    phase: "B",
    registry: moduleRecord(flowModules.phase_b_characters),
    order: [
      "pb_existing_keyboards",
      "pb_co_installed_keyboards",
      "pb_discovery_intro",
      "pb_text_sample",
      "pb_text_sample_review",
      "pb_linguist_confirm",
      "pb_picker_confirm",
      "pb_routing_branch",
      "pb_standard_letters",
      "pb_typing_approach",
      "pb_non_roman_branch",
      "pb_indic_conjuncts",
      "pb_indic_virama",
      "pb_indic_vowels_separate",
      "pb_indic_pre_base_vowels",
      "pb_indic_nukta_gate",
      "pb_indic_nukta_detail",
      "pb_indic_vowels_onset",
      "pb_indic_vowels_onset_list",
      "pb_sea_medials",
      "pb_sea_stacked_consonants",
      "pb_rtl_direction_confirm",
      "pb_rtl_short_vowels",
      "pb_rtl_special_letters",
      "pb_syllabic_note",
      "pb_syllabic_grid",
      "pb_syllabic_finals_gate",
      "pb_syllabic_finals_detail",
      "pb_other_free_entry",
      "pb_special_letters",
      "pb_special_letters_list",
      "pb_special_letters_notes",
      "pb_latin_digraphs_gate",
      "pb_latin_digraphs_list",
      "pb_punctuation_gate",
      "pb_punctuation_list",
      "pb_digit_set",
      "pb_char_count",
      "pb_latin_qwerty_branch",
      "pb_spare_keys_qwerty",
      "pb_latin_azerty_branch",
      "pb_azerty_qz_swap",
      "pb_spare_keys_azerty",
      "pb_contact_language",
      "pb_legacy_encoding",
      "pb_use_case",
      "pb_additional_methods",
    ],
  },
];

describe("orderDecisions — derived flows equal their frozen legacy YAML order", () => {
  for (const { flowId, phase, registry, order } of FROZEN_LEGACY_ORDERS) {
    it(`${flowId}: derived order equals the frozen legacy order`, () => {
      const derived = orderDecisions(Object.values(registry)).map((m) => m.definition.id);
      expect(derived).toEqual([...order]);
    });

    it(`${flowId}: flowSources entry derives with the legacy phase`, () => {
      const source = flowSources[flowId]!;
      const flow = loadFlowSourceDef(source);
      expect(flow.flow_id).toBe(flowId);
      expect(flow.phase).toBe(phase);
      expect(flow.questions.map((q) => q.id)).toEqual([...order]);
    });
  }
});

// ---------------------------------------------------------------------------
// phase_a_identity (proposed flow, spec 087 US4). It cannot ride the table
// above: the YAML carried TWO lists (`questions` + `provenance_questions`), and
// the flow derives one order over all 30 modules then splits it, so the table's
// single-list row shape does not fit. Both lists are frozen here.
// ---------------------------------------------------------------------------

/** Frozen from the deleted content/flows/proposed/phase_a_identity.modular.yaml `questions`. */
const LEGACY_PHASE_A_IDENTITY_ORDER: readonly string[] = [
  "desktop_first_notice",
  "language_name_english",
  "language_name_autonym",
  "iso_code",
  "region",
  "primary_script",
  "writing_direction",
  "script_not_supported_stub",
  "layout_family",
  "script_family",
  "pa_primary_target",
  "author_display_name",
  "author_contact_email",
  "pa_copyright_holder",
  "provenance_opt_in",
];

/** Frozen from the same YAML's `provenance_questions`. */
const LEGACY_PHASE_A_PROVENANCE_ORDER: readonly string[] = [
  "provenance_requester_name",
  "provenance_requester_contact",
  "provenance_requester_affiliation",
  "provenance_requester_relation",
  "provenance_community_rep_name",
  "provenance_community_rep_role",
  "provenance_community_rep_email",
  "provenance_speaker_count",
  "provenance_regions",
  "provenance_language_status",
  "provenance_existing_tools",
  "provenance_orthography_url",
  "provenance_community_involvement",
  "provenance_casing_notes",
  "provenance_additional_notes",
];

describe("orderDecisions - phase_a_identity (proposed) equals its frozen legacy YAML order", () => {
  it("derived order over all 30 modules is the legacy questions list then provenance list", () => {
    const derived = orderDecisions(flowModules.phase_a_identity).map(
      (m) => m.definition.id,
    );
    expect(derived).toEqual([
      ...LEGACY_PHASE_A_IDENTITY_ORDER,
      ...LEGACY_PHASE_A_PROVENANCE_ORDER,
    ]);
  });

  it("flowSources entry derives, keeps status proposed and the provenance_questions split", () => {
    const source = flowSources["phase_a_identity"]!;
    expect(source.status).toBe("proposed");
    const flow = loadFlowSourceDef(source);
    expect(flow.flow_id).toBe("phase_a_identity");
    expect(flow.phase).toBe("A");
    expect(flow.questions.map((q) => q.id)).toEqual([...LEGACY_PHASE_A_IDENTITY_ORDER]);
    expect((flow.provenance_questions ?? []).map((q) => q.id)).toEqual([
      ...LEGACY_PHASE_A_PROVENANCE_ORDER,
    ]);
  });
});
