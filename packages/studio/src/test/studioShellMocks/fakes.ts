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

/** The base keyboard the BaseResolution stub previews. */
export const fakeBase = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  displayName: "English (US)",
  targets: ["windows"],
  version: "1.0",
};
