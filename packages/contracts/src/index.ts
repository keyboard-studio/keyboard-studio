// ---------------------------------------------------------------------------
// Data types — the canonical shapes the survey / scaffolder / validator /
// compiler / output pipeline pass between phases. Each module re-exports its
// own factory (makeX) and any related Init type. Alphabetized within group.
// ---------------------------------------------------------------------------
export * from "./axes";
export * from "./baseKeyboard";
export * from "./compileResult";
export * from "./criteria";
export * from "./lintFinding";
export * from "./pattern";
export * from "./patternMatch";
export * from "./strategy";
export * from "./surveyPhaseResult";
export * from "./virtualFS";

// ---------------------------------------------------------------------------
// Service interfaces — runtime APIs each pipeline step exposes. Engine team
// implements these against real backends; content team uses the mocks subpath
// for fixture-driven UI work. Alphabetized.
// ---------------------------------------------------------------------------
export * from "./baseBrowser";
export * from "./compiler";
export * from "./lintEngine";
export * from "./outputService";
export * from "./patternLibrary";
export * from "./scaffolder";
export * from "./validator";

// ---------------------------------------------------------------------------
// Loader / data — modules that load checked-in data files (criteria.json) and
// re-export as typed `readonly` arrays / records.
// ---------------------------------------------------------------------------
export * from "./criteriaData";
