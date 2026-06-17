// ---------------------------------------------------------------------------
// Data types — the canonical shapes the survey / scaffolder / validator /
// compiler / output pipeline pass between phases. Each module re-exports its
// own factory (makeX) and any related Init type. Alphabetized within group.
// ---------------------------------------------------------------------------
export * from "./assignmentMap";
export * from "./axes";
export * from "./baseKeyboard";
export * from "./compileResult";
export * from "./criteria";
export * from "./keyboard-ir";
export * from "./keyboardId";
export * from "./keyboardIdentity";
export * from "./linguistInventory";
export * from "./lintFinding";
export * from "./pattern";
export * from "./patternMatch";
export * from "./placementMap";
export * from "./provenance";
export * from "./simulation";
export * from "./strategy";
export * from "./surveyPhaseResult";
export * from "./surveySession";
export * from "./virtualFS";

// ---------------------------------------------------------------------------
// Runtime schemas — zod mirrors of the locked contract types (spec §5, §11).
// Used at the data-file load boundaries to validate criteria.json and the
// pattern-library YAML; compile-time drift guards keep schema and type in sync.
// ---------------------------------------------------------------------------
export * from "./schemas";

// ---------------------------------------------------------------------------
// Service interfaces — runtime APIs each pipeline step exposes. Engine team
// implements these against real backends; content team uses the mocks subpath
// for fixture-driven UI work. Alphabetized.
// ---------------------------------------------------------------------------
export * from "./baseBrowser";
export * from "./characterDiscovery";
export * from "./compiler";
export * from "./lintEngine";
export * from "./outputService";
export * from "./patternLibrary";
export * from "./scaffolder";
export * from "./validator";

// ---------------------------------------------------------------------------
// IR utilities — shared helpers that operate on KeyboardIR at the contracts
// layer (both engine and keyboard-lint consume these; lint cannot import engine).
// ---------------------------------------------------------------------------
export * from "./ir/producedSet";
export * from "./keyboardIRRoundTrip";

// ---------------------------------------------------------------------------
// Loader / data — modules that load checked-in data files (criteria.json) and
// re-export as typed `readonly` arrays / records.
// ---------------------------------------------------------------------------
export * from "./criteriaData";
export * from "./fontEntry";
