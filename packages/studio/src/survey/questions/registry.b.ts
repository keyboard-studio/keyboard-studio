// Phase B sub-registry.
//
// Fan-out rule: do NOT edit registry.ts directly during the parallel migration.
// The main registry.ts will be consolidated by the team lead after all phase
// agents return. Until then, this file is the authoritative Phase B registry.
//
// All imports are static (not dynamic) so the registry is synchronous.

import type { QuestionModule } from "../types.ts";

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
import pbMarkInputOrderMod from "./b/pb_mark_input_order.ts";
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
import pbRtlDirectionMarksMod from "./b/pb_rtl_direction_marks.ts";
import pbRtlDirectionMarksDetailMod from "./b/pb_rtl_direction_marks_detail.ts";
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

/**
 * Phase B synchronous sub-registry: { [questionId]: QuestionModule }
 * Merged into the main registry by the team lead after all phase agents return.
 */
export const phaseBRegistry: Readonly<Record<string, QuestionModule>> = {
  pb_existing_keyboards: pbExistingKeyboardsMod,
  pb_co_installed_keyboards: pbCoInstalledKeyboardsMod,
  pb_discovery_intro: pbDiscoveryIntroMod,
  pb_text_sample: pbTextSampleMod,
  pb_text_sample_review: pbTextSampleReviewMod,
  pb_linguist_confirm: pbLinguistConfirmMod,
  pb_picker_confirm: pbPickerConfirmMod,
  pb_routing_branch: pbRoutingBranchMod,
  pb_standard_letters: pbStandardLettersMod,
  pb_typing_approach: pbTypingApproachMod,
  pb_mark_input_order: pbMarkInputOrderMod,
  pb_special_letters: pbSpecialLettersMod,
  pb_special_letters_list: pbSpecialLettersListMod,
  pb_special_letters_notes: pbSpecialLettersNotesMod,
  pb_latin_digraphs_gate: pbLatinDigraphsGateMod,
  pb_latin_digraphs_list: pbLatinDigraphsListMod,
  pb_punctuation_gate: pbPunctuationGateMod,
  pb_punctuation_list: pbPunctuationListMod,
  pb_digit_set: pbDigitSetMod,
  // spec 046: pb_accent_marks_gate, pb_diacritic_select, pb_stacking_marks,
  // pb_mark_style, pb_capitals_marks are RETIRED from active use (superseded by
  // the marks question series); pb_mark_input_order is relocated as its S3
  // station. Modules stay on disk (demotion, not deletion — spec 022 precedent).
  pb_char_count: pbCharCountMod,
  pb_latin_qwerty_branch: pbLatinQwertyBranchMod,
  pb_spare_keys_qwerty: pbSpareKeysQwertyMod,
  pb_latin_azerty_branch: pbLatinAzertyBranchMod,
  pb_azerty_qz_swap: pbAzertyQzSwapMod,
  pb_spare_keys_azerty: pbSpareKeysAzertyMod,
  pb_non_roman_branch: pbNonRomanBranchMod,
  pb_indic_conjuncts: pbIndicConjunctsMod,
  pb_indic_virama: pbIndicViramaMod,
  pb_indic_vowels_separate: pbIndicVowelsSeparateMod,
  pb_indic_pre_base_vowels: pbIndicPreBaseVowelsMod,
  pb_indic_nukta_gate: pbIndicNuktaGateMod,
  pb_indic_nukta_detail: pbIndicNuktaDetailMod,
  pb_indic_vowels_onset: pbIndicVowelsOnsetMod,
  pb_indic_vowels_onset_list: pbIndicVowelsOnsetListMod,
  pb_sea_medials: pbSeaMedialsMod,
  pb_sea_stacked_consonants: pbSeaStackedConsonantsMod,
  pb_rtl_direction_confirm: pbRtlDirectionConfirmMod,
  pb_rtl_short_vowels: pbRtlShortVowelsMod,
  pb_rtl_direction_marks: pbRtlDirectionMarksMod,
  pb_rtl_direction_marks_detail: pbRtlDirectionMarksDetailMod,
  pb_rtl_special_letters: pbRtlSpecialLettersMod,
  pb_syllabic_note: pbSyllabicNoteMod,
  pb_syllabic_grid: pbSyllabicGridMod,
  pb_syllabic_finals_gate: pbSyllabicFinalsGateMod,
  pb_syllabic_finals_detail: pbSyllabicFinalsDetailMod,
  pb_other_free_entry: pbOtherFreeEntryMod,
  pb_contact_language: pbContactLanguageMod,
  pb_legacy_encoding: pbLegacyEncodingMod,
  pb_use_case: pbUseCaseMod,
  pb_additional_methods: pbAdditionalMethodsMod,
} as const;
