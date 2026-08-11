// Help-docs answers captured during Phase F authoring (spec 061, data-model.md).

/**
 * The author-supplied side of a keyboard's shipped documentation.
 *
 * Lives on the working copy store as `helpDocs: HelpDocsAnswers | null` — `null`
 * until Phase F's `onCommit` first fires, mirroring `Attribution | null`'s own
 * null-until-set convention. Every field except `description` is optional; a
 * field absent or blank means the author left it out, rendered as no section at
 * all, never an empty one.
 */
export interface HelpDocsAnswers {
  /** pf_welcome_paragraph. The one required field (FR-001). */
  description: string;

  /** pf_usage_tip_1, pf_usage_tip_2 (only these two are reachable — research D-11). */
  usageTips: string[];

  /** pf_credits. */
  credits?: string;

  /** pf_contact_info. */
  contactInfo?: string;

  /** pf_project_url line 1 (required if any line is given). */
  projectHomeUrl?: string;
  /** pf_project_url line 2, when a second line is given. */
  projectHelpUrl?: string;

  /**
   * pf_doc_language. Absent/blank means English (existing question default).
   *
   * Write-time author guidance only — it instructs which language(s) to
   * write the OTHER free-text answers in (the question's own prompt: "This
   * decides how you write every answer that follows"). No render path reads
   * this field: the renderer displays whatever prose the author wrote
   * verbatim, in any of the three cases. The shipped `<html lang>` attribute
   * is a separate concern already covered by FR-006, driven by the
   * keyboard's `primaryBcp47`, not by this field. Recorded here for
   * provenance/audit only.
   */
  docLanguage?: "english" | "target" | "bilingual";

  // Opt-in "additional detail" battery (FR-011/FR-014) — order in research D-10.
  designRationale?: string; // pf_design_rationale
  fontGuidance?: string; // pf_font_guidance
  canonicalOrder?: string; // pf_canonical_order (non-roman scripts only — existing gate)
  scriptGlossary?: string; // pf_script_glossary
  exampleWords?: string; // pf_example_words
  scopeVariety?: string; // pf_scope_variety
  provenanceBasis?: string; // pf_provenance_basis
  troubleshooting?: string; // pf_troubleshooting
  knownLimitations?: string; // pf_known_limitations
  relatedKeyboards?: string; // pf_related_keyboards
  furtherReading?: string; // pf_further_reading
}
