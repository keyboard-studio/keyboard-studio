// legacyStepIds — the frozen map from pre-091 step ids to the derived
// screen that now holds that step's decisions (spec 091 FR-004 / SC-005).
//
// The inventory is every step id declared on `main` at 18e63aa4 (from
// stepDependencies.ts DECLARATIONS at that commit, inventoried in
// research.md). Screen ids were seeded with today's step names (the
// gallery modules' declared screen keys; the question screens' groups),
// so every entry is an identity mapping today — the map exists so a
// future rename is a data change here, not a code path change in the
// deep-link resolver or the draft-history sanitiser.
//
// `done` and `unsupported` are addressable terminals in the location
// model, not screens: they are deliberately absent from the map and pass
// through the resolver unchanged, as does any unknown id.

/** Pre-091 step id -> the id of the screen holding that step's decisions. */
export const LEGACY_STEP_ID_MAP: Readonly<Record<string, string>> = {
  identity: "identity",
  layout: "layout",
  choose_base: "choose_base",
  track: "track",
  project_name: "project_name",
  characters: "characters",
  marks: "marks",
  punctuation: "punctuation",
  invisibles: "invisibles",
  convenience: "convenience",
  carve: "carve",
  deadkeys: "deadkeys",
  rules: "rules",
  mechanisms: "mechanisms",
  touch_seed_source: "touch_seed_source",
  touch: "touch",
  help: "help",
  // `package` is a terminal screen appended after the last derived screen
  // (RULED, owner ruling 2026-10-06); it maps to itself.
  package: "package",
};

/**
 * Resolve a step id that may predate derived screens to the screen id
 * that now holds its decisions. Unmapped ids (the `done` / `unsupported`
 * terminals, or anything unknown) pass through unchanged.
 */
export function resolveLegacyStepId(id: string): string {
  return LEGACY_STEP_ID_MAP[id] ?? id;
}
