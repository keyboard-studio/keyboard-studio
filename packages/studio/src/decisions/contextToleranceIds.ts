// The context-tolerance survey-answer ids (spec 078 FR-007) — a leaf
// module with no imports. These constants used to live in
// contextToleranceProposal.ts, whose recordSurveyAnswers import chain
// reaches the question registry; the marks renderer (spec 090 T023, the
// marks-treatment module's renderer, itself imported by the registry
// through the module) needs the ids without closing that cycle
// (D-090-8 leaf-extraction pattern).

export const CONTEXT_TOLERANCE_QUESTION_ID = "marks.context_tolerance";
export const CONTEXT_TOLERANCE_SITES_QUESTION_ID = "marks.context_tolerance.sites";

/** Separator for the `.sites` answer's accepted rule ids. */
export const SITE_ID_SEPARATOR = ",";
