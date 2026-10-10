// Fixed payloads the StudioShell mock children emit. Deterministic so the
// golden-walk oracle and the shell suites see the same data on every run.

/** Minimal IdentityLiteResult the IdentityLite stub completes with. */
export const fakeIdentity = {
  autonym: "English",
  english: "English",
  languageSubtag: "en",
  targetScriptRaw: "Latn",
  bcp47: "en-Latn",
  supported: true,
  prefill: { script: "Latn", scriptClass: "alphabetic", routingGroup: "qwerty-qwertz" },
};

/** Empty SurveyPhaseResult the phase stubs complete with. */
export const fakePhaseResult = { phase: "B" as const, answers: [], confirmedInventory: [] };

/**
 * The identity phase result the IdentityLite stub completes with — the four
 * identity answers matching fakeIdentity, so the decisions recorded at
 * completion derive the same identity result (spec 089: nothing stores the
 * identity object itself anymore; it is derived from these answers' records).
 * #1901: the author/copyright answers are NOT here anymore — they are the
 * attribution step's completion (fakeAttributionPhaseResult below).
 */
export const fakeIdentityPhaseResult = {
  phase: "A" as const,
  answers: [
    { questionId: "il_language_autonym", answerType: "text" as const, value: "English" },
    { questionId: "il_language_english", answerType: "text" as const, value: "English" },
    { questionId: "il_language_code", answerType: "text" as const, value: "en" },
    { questionId: "il_target_script", answerType: "select" as const, value: "Latn" },
  ],
  confirmedInventory: [],
};

/**
 * The attribution phase result the FlowStepHost stub completes with (#1901)
 * — the same author/copyright answers the identity stub used to emit, now
 * from the post-track attribution step, so the golden walks record the
 * same decisions and land the same attribution, one step later.
 */
export const fakeAttributionPhaseResult = {
  phase: "G" as const,
  answers: [
    { questionId: "il_author_name", answerType: "text" as const, value: "Test Author" },
    { questionId: "il_author_email", answerType: "text" as const, value: "author@example.org" },
    { questionId: "il_copyright_holder", answerType: "text" as const, value: "Test Author" },
  ],
  confirmedInventory: [],
};

/** The base keyboard the BaseResolution stub previews. */
export const fakeBase = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  displayName: "English (US)",
  targets: ["windows"],
  version: "1.0",
};
