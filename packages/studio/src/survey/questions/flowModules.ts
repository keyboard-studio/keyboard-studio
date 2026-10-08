// flowModules — each flow's membership (flow_id -> its question modules),
// in walk order.
//
// Extracted from registry.ts (spec 090 delta D-090-7): the step layer
// derives step provides from these lists, and it must not import the
// registry to get them. Gallery decision modules put store-coupled
// renderer components into the registry's import graph (registry → gallery
// module → renderer → workingCopyStore → dashboard/completeness →
// stepOrder), so a step-layer → registry import closed a cycle that left
// this module's sibling bindings uninitialized when the step layer ran
// during registry load. This module is a leaf: it imports question
// modules only, and registry.ts composes the flows from here.

import type { QuestionModule } from "../types.ts";

import il_language_english from "./a/il_language_english.ts";
import il_language_region from "./a/il_language_region.ts";
import il_language_autonym from "./a/il_language_autonym.ts";
import il_language_code from "./a/il_language_code.ts";
import il_target_script from "./a/il_target_script.ts";
import il_script_not_supported from "./a/il_script_not_supported.ts";
import il_author_name from "./a/il_author_name.ts";
import il_author_email from "./a/il_author_email.ts";
import il_copyright_holder from "./a/il_copyright_holder.ts";
import pbExistingKeyboardsMod from "./b/pb_existing_keyboards.ts";
import pbCoInstalledKeyboardsMod from "./b/pb_co_installed_keyboards.ts";
import pbDiscoveryIntroMod from "./b/pb_discovery_intro.ts";
import pbTextSampleMod from "./b/pb_text_sample.ts";
import pbTextSampleReviewMod from "./b/pb_text_sample_review.ts";
import pbLinguistConfirmMod from "./b/pb_linguist_confirm.ts";
import pbPickerConfirmMod from "./b/pb_picker_confirm.ts";
import pbRoutingBranchMod from "./b/pb_routing_branch.ts";
import pbStandardLettersMod from "./b/pb_standard_letters.ts";
import pbTypingApproachMod from "./b/pb_typing_approach.ts";
import pbSpecialLettersMod from "./b/pb_special_letters.ts";
import pbSpecialLettersListMod from "./b/pb_special_letters_list.ts";
import pbSpecialLettersNotesMod from "./b/pb_special_letters_notes.ts";
import pbLatinDigraphsGateMod from "./b/pb_latin_digraphs_gate.ts";
import pbLatinDigraphsListMod from "./b/pb_latin_digraphs_list.ts";
import pbPunctuationGateMod from "./b/pb_punctuation_gate.ts";
import pbPunctuationListMod from "./b/pb_punctuation_list.ts";
import pbDigitSetMod from "./b/pb_digit_set.ts";
import pbCharCountMod from "./b/pb_char_count.ts";
import pbLatinQwertyBranchMod from "./b/pb_latin_qwerty_branch.ts";
import pbSpareKeysQwertyMod from "./b/pb_spare_keys_qwerty.ts";
import pbLatinAzertyBranchMod from "./b/pb_latin_azerty_branch.ts";
import pbAzertyQzSwapMod from "./b/pb_azerty_qz_swap.ts";
import pbSpareKeysAzertyMod from "./b/pb_spare_keys_azerty.ts";
import pbNonRomanBranchMod from "./b/pb_non_roman_branch.ts";
import pbIndicConjunctsMod from "./b/pb_indic_conjuncts.ts";
import pbIndicViramaMod from "./b/pb_indic_virama.ts";
import pbIndicVowelsSeparateMod from "./b/pb_indic_vowels_separate.ts";
import pbIndicPreBaseVowelsMod from "./b/pb_indic_pre_base_vowels.ts";
import pbIndicNuktaGateMod from "./b/pb_indic_nukta_gate.ts";
import pbIndicNuktaDetailMod from "./b/pb_indic_nukta_detail.ts";
import pbIndicVowelsOnsetMod from "./b/pb_indic_vowels_onset.ts";
import pbIndicVowelsOnsetListMod from "./b/pb_indic_vowels_onset_list.ts";
import pbSeaMedialsMod from "./b/pb_sea_medials.ts";
import pbSeaStackedConsonantsMod from "./b/pb_sea_stacked_consonants.ts";
import pbRtlDirectionConfirmMod from "./b/pb_rtl_direction_confirm.ts";
import pbRtlShortVowelsMod from "./b/pb_rtl_short_vowels.ts";
import pbRtlSpecialLettersMod from "./b/pb_rtl_special_letters.ts";
import pbSyllabicNoteMod from "./b/pb_syllabic_note.ts";
import pbSyllabicGridMod from "./b/pb_syllabic_grid.ts";
import pbSyllabicFinalsGateMod from "./b/pb_syllabic_finals_gate.ts";
import pbSyllabicFinalsDetailMod from "./b/pb_syllabic_finals_detail.ts";
import pbOtherFreeEntryMod from "./b/pb_other_free_entry.ts";
import pbContactLanguageMod from "./b/pb_contact_language.ts";
import pbLegacyEncodingMod from "./b/pb_legacy_encoding.ts";
import pbUseCaseMod from "./b/pb_use_case.ts";
import pbAdditionalMethodsMod from "./b/pb_additional_methods.ts";
import pfDocLanguageMod from "./f/pf_doc_language.ts";
import pfWelcomeParagraphMod from "./f/pf_welcome_paragraph.ts";
import pfFontGuidanceMod from "./f/pf_font_guidance.ts";
import pfHistoryEntryMod from "./f/pf_history_entry.ts";
import pfHistoryEntryBulletsMod from "./f/pf_history_entry_bullets.ts";
import pfUsageTip1Mod from "./f/pf_usage_tip_1.ts";
import pfUsageTip2Mod from "./f/pf_usage_tip_2.ts";
import pfUsageTip3Mod from "./f/pf_usage_tip_3.ts";
import pfUsageTip4Mod from "./f/pf_usage_tip_4.ts";
import pfUsageTip5Mod from "./f/pf_usage_tip_5.ts";
import pfMoreDetailGateMod from "./f/pf_more_detail_gate.ts";
import pfScopeVarietyMod from "./f/pf_scope_variety.ts";
import pfProvenanceBasisMod from "./f/pf_provenance_basis.ts";
import pfDesignRationaleMod from "./f/pf_design_rationale.ts";
import pfCanonicalOrderMod from "./f/pf_canonical_order.ts";
import pfScriptGlossaryMod from "./f/pf_script_glossary.ts";
import pfExampleWordsMod from "./f/pf_example_words.ts";
import pfTroubleshootingMod from "./f/pf_troubleshooting.ts";
import pfRelatedKeyboardsMod from "./f/pf_related_keyboards.ts";
import pfKnownLimitationsMod from "./f/pf_known_limitations.ts";
import pfFurtherReadingMod from "./f/pf_further_reading.ts";
import pfProjectUrlMod from "./f/pf_project_url.ts";
import pfCreditsMod from "./f/pf_credits.ts";
import pfContactInfoMod from "./f/pf_contact_info.ts";
import trackChoiceMod from "./g/track_choice.ts";
import projectDisplayNameMod from "./g/project_display_name.ts";
import projectKeyboardIdMod from "./g/project_keyboard_id.ts";
import desktop_first_notice from "./reserve/desktop_first_notice.ts";
import language_name_autonym from "./reserve/language_name_autonym.ts";
import language_name_english from "./reserve/language_name_english.ts";
import iso_code from "./reserve/iso_code.ts";
import region from "./reserve/region.ts";
import primary_script from "./reserve/primary_script.ts";
import writing_direction from "./reserve/writing_direction.ts";
import script_not_supported_stub from "./reserve/script_not_supported_stub.ts";
import layout_family from "./reserve/layout_family.ts";
import script_family from "./reserve/script_family.ts";
import pa_primary_target from "./reserve/pa_primary_target.ts";
import author_display_name from "./reserve/author_display_name.ts";
import author_contact_email from "./reserve/author_contact_email.ts";
import pa_copyright_holder from "./reserve/pa_copyright_holder.ts";
import provenance_opt_in from "./reserve/provenance_opt_in.ts";
import provenance_requester_name from "./reserve/provenance_requester_name.ts";
import provenance_requester_contact from "./reserve/provenance_requester_contact.ts";
import provenance_requester_affiliation from "./reserve/provenance_requester_affiliation.ts";
import provenance_requester_relation from "./reserve/provenance_requester_relation.ts";
import provenance_community_rep_name from "./reserve/provenance_community_rep_name.ts";
import provenance_community_rep_role from "./reserve/provenance_community_rep_role.ts";
import provenance_community_rep_email from "./reserve/provenance_community_rep_email.ts";
import provenance_speaker_count from "./reserve/provenance_speaker_count.ts";
import provenance_regions from "./reserve/provenance_regions.ts";
import provenance_language_status from "./reserve/provenance_language_status.ts";
import provenance_existing_tools from "./reserve/provenance_existing_tools.ts";
import provenance_orthography_url from "./reserve/provenance_orthography_url.ts";
import provenance_community_involvement from "./reserve/provenance_community_involvement.ts";
import provenance_casing_notes from "./reserve/provenance_casing_notes.ts";
import provenance_additional_notes from "./reserve/provenance_additional_notes.ts";

/**
 * Each flow's membership (flow_id -> its question modules), in walk order.
 *
 * - identity_lite and attribution hold ONLY the live il_* modules; the demoted Phase A battery
 *   lives under phase_a_identity (a status:"proposed" flow, see flowSources).
 * - phase_a_identity: the 30 demoted Phase A modules; their decisions use
 *   `reserve-*` ids, distinct from the live il_* ones, so one decision index
 *   covers both.
 */
export const flowModules = {
  identity_lite: [
    il_language_english,
    il_language_region,
    il_language_autonym,
    il_language_code,
    il_target_script,
    il_script_not_supported,
  ],

  track: [
    trackChoiceMod,
  ],

  // Attribution capture (spec 064 US1's questions, re-homed by #1901): the
  // author name / email / copyright holder are asked AFTER the track
  // choice, in their own flow, because what they should propose depends
  // on the track (confirm-from-profile on copy; the base's holder seeded
  // on update — see il_copyright_holder's seedWhen). Separate ids from
  // the demoted author_display_name / author_contact_email /
  // pa_copyright_holder, because routing lives in definition.next and
  // those three belong to the phase_a chain.
  attribution: [
    il_author_name,
    il_author_email,
    il_copyright_holder,
  ],

  project_name: [
    projectDisplayNameMod,
    projectKeyboardIdMod,
  ],

  phase_b_characters: [
    pbExistingKeyboardsMod,
    pbCoInstalledKeyboardsMod,
    pbDiscoveryIntroMod,
    pbTextSampleMod,
    pbTextSampleReviewMod,
    pbLinguistConfirmMod,
    pbPickerConfirmMod,
    pbRoutingBranchMod,
    pbStandardLettersMod,
    pbTypingApproachMod,
    pbSpecialLettersMod,
    pbSpecialLettersListMod,
    pbSpecialLettersNotesMod,
    pbLatinDigraphsGateMod,
    pbLatinDigraphsListMod,
    pbPunctuationGateMod,
    pbPunctuationListMod,
    pbDigitSetMod,
    // spec 071: the five Phase B marks questions it superseded (accent-marks
    // gate, diacritic select, stacking, mark style, capitals-with-marks) were
    // retired and later deleted; pb_mark_input_order is relocated to reserve/ as
    // the series' S3 station.
    pbCharCountMod,
    pbLatinQwertyBranchMod,
    pbSpareKeysQwertyMod,
    pbLatinAzertyBranchMod,
    pbAzertyQzSwapMod,
    pbSpareKeysAzertyMod,
    pbNonRomanBranchMod,
    pbIndicConjunctsMod,
    pbIndicViramaMod,
    pbIndicVowelsSeparateMod,
    pbIndicPreBaseVowelsMod,
    pbIndicNuktaGateMod,
    pbIndicNuktaDetailMod,
    pbIndicVowelsOnsetMod,
    pbIndicVowelsOnsetListMod,
    pbSeaMedialsMod,
    pbSeaStackedConsonantsMod,
    pbRtlDirectionConfirmMod,
    pbRtlShortVowelsMod,
    pbRtlSpecialLettersMod,
    pbSyllabicNoteMod,
    pbSyllabicGridMod,
    pbSyllabicFinalsGateMod,
    pbSyllabicFinalsDetailMod,
    pbOtherFreeEntryMod,
    pbContactLanguageMod,
    pbLegacyEncodingMod,
    pbUseCaseMod,
    pbAdditionalMethodsMod,
  ],

  phase_f_helpdocs: [
    // Keys are in WALK order: orderDecisions uses registry order as the tie-break
    // where provides/requires are silent (spec 087 Q3).

    // --- Default path ---
    pfWelcomeParagraphMod,
    pfUsageTip1Mod,
    // HISTORY proposal (spec 079 US5): confirm / edit / dismiss, spliced in
    // via pf_usage_tip_1's `next` (last default-path screen before the gate).
    pfHistoryEntryMod,
    pfHistoryEntryBulletsMod,

    // --- Depth gate ---
    pfMoreDetailGateMod,

    // --- Optional battery (reached only when the gate is Yes) ---
    pfDocLanguageMod,
    pfFontGuidanceMod,
    pfUsageTip2Mod,
    pfScopeVarietyMod,
    pfProvenanceBasisMod,
    pfDesignRationaleMod,
    // Non-roman branch only (ctx.routing_group == 'non-roman').
    pfCanonicalOrderMod,
    pfScriptGlossaryMod,
    pfExampleWordsMod,
    pfTroubleshootingMod,
    pfRelatedKeyboardsMod,
    pfKnownLimitationsMod,
    pfFurtherReadingMod,
    pfProjectUrlMod,

    // --- Close (always asked) ---
    pfCreditsMod,
    pfContactInfoMod,
  ],

  phase_a_identity: [
    desktop_first_notice,
    language_name_english,
    language_name_autonym,
    iso_code,
    region,
    primary_script,
    writing_direction,
    script_not_supported_stub,
    layout_family,
    script_family,
    pa_primary_target,
    author_display_name,
    author_contact_email,
    pa_copyright_holder,
    provenance_opt_in,
    provenance_requester_name,
    provenance_requester_contact,
    provenance_requester_affiliation,
    provenance_requester_relation,
    provenance_community_rep_name,
    provenance_community_rep_role,
    provenance_community_rep_email,
    provenance_speaker_count,
    provenance_regions,
    provenance_language_status,
    provenance_existing_tools,
    provenance_orthography_url,
    provenance_community_involvement,
    provenance_casing_notes,
    provenance_additional_notes,
  ],
} as const satisfies Record<string, readonly QuestionModule[]>;

/**
 * Demoted Phase F tip slots: registered + on disk + test-covered but
 * deliberately absent from the live flow. Demotion is not deletion — moving a
 * module into `flowModules.phase_f_helpdocs` revives it with no other change.
 */
export const demotedPhaseFModules: readonly QuestionModule[] = [
  pfUsageTip3Mod,
  pfUsageTip4Mod,
  pfUsageTip5Mod,
];
