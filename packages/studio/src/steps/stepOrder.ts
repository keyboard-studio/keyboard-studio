// stepOrder — the manifest's step ids, in manifest order, as plain data.
//
// Exists so a store can order per-step data by the manifest without importing
// the manifest itself (which imports every step component, and so, at runtime,
// the stores — a cycle). manifest.persistence.test.ts asserts this equals
// `manifest.map((s) => s.id)`, so it cannot drift.

export const STEP_ORDER: readonly string[] = [
  "identity",
  "choose_base",
  "track",
  "project_name",
  "characters",
  "marks",
  "punctuation",
  "invisibles",
  "convenience",
  "carve",
  "mechanisms",
  "touch_seed_source",
  "touch",
  "help",
  "package",
];
