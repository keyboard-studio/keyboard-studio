// Phase F sub-registry.
//
// Fan-out rule: do NOT edit registry.ts directly during the parallel migration.
// The main registry.ts will be consolidated by the team lead after all phase
// agents return. Until then, this file is the authoritative Phase F registry.
//
// All imports are static (not dynamic) so the registry is synchronous.
//
// NOTE (Phase F documentation revision): pf_usage_tip_3/4/5 stay registered here
// even though they are no longer in the live flow membership
// (content/flows/phase_f_helpdocs.modular.yaml). Demotion is not deletion —
// keeping the registry entry, the module file, and its colocated test means
// re-adding an id to the YAML revives the question with no code change.

import type { QuestionModule } from "../types.ts";

import pfDocLanguageMod from "./f/pf_doc_language.ts";
import pfWelcomeParagraphMod from "./f/pf_welcome_paragraph.ts";
import pfFontGuidanceMod from "./f/pf_font_guidance.ts";
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

/**
 * Phase F synchronous sub-registry: { [questionId]: QuestionModule }
 * Merged into the main registry by the team lead after all phase agents return.
 */
export const phaseFRegistry: Readonly<Record<string, QuestionModule>> = {
  // --- Core (always asked) ---
  pf_doc_language: pfDocLanguageMod,
  pf_welcome_paragraph: pfWelcomeParagraphMod,
  pf_font_guidance: pfFontGuidanceMod,
  pf_usage_tip_1: pfUsageTip1Mod,
  pf_usage_tip_2: pfUsageTip2Mod,

  // --- Depth gate ---
  pf_more_detail_gate: pfMoreDetailGateMod,

  // --- Optional battery (reached only when the gate is Yes) ---
  pf_scope_variety: pfScopeVarietyMod,
  pf_provenance_basis: pfProvenanceBasisMod,
  pf_design_rationale: pfDesignRationaleMod,
  // Non-roman branch only (ctx.routing_group == 'non-roman').
  pf_canonical_order: pfCanonicalOrderMod,
  pf_script_glossary: pfScriptGlossaryMod,
  pf_example_words: pfExampleWordsMod,
  pf_troubleshooting: pfTroubleshootingMod,
  pf_related_keyboards: pfRelatedKeyboardsMod,
  pf_known_limitations: pfKnownLimitationsMod,
  pf_further_reading: pfFurtherReadingMod,
  pf_project_url: pfProjectUrlMod,

  // --- Close (always asked) ---
  pf_credits: pfCreditsMod,
  pf_contact_info: pfContactInfoMod,

  // --- Demoted: registered + on disk + test-covered, but not in the live YAML ---
  pf_usage_tip_3: pfUsageTip3Mod,
  pf_usage_tip_4: pfUsageTip4Mod,
  pf_usage_tip_5: pfUsageTip5Mod,
} as const;
