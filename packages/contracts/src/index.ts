// ---------------------------------------------------------------------------
// Data types — the canonical shapes the survey / scaffolder / validator /
// compiler / output pipeline pass between phases. Each module re-exports its
// own factory (makeX) and any related Init type. Alphabetized within group.
// ---------------------------------------------------------------------------
export * from "./assignmentMap";
export * from "./attribution";
export * from "./axes";
export * from "./axisFill";
export * from "./baseKeyboard";
export * from "./compileResult";
export * from "./confirmedAlphabet";
export * from "./copyright";
export * from "./criteria";
// The append-only per-keyboard decision audit (specs/053-decision-audit). Sits
// alongside the survey/IR types it derives from rather than under a subpath —
// engine, studio, and the packaged sidecar all read the same shapes.
export * from "./decisionRecord";
export * from "./keyboard-ir";
export * from "./keyboardId";
// The single authoritative key-budget determination (spec 052 FR-016); axis A7
// in ./axes is its projection, never an independent measurement.
export * from "./keyBudget";
export * from "./keyboardIdentity";
export * from "./linguistInventory";
export * from "./lintFinding";
export * from "./pattern";
export * from "./patternMatch";
export * from "./removalCapability";
export * from "./placementMap";
export * from "./placementStrategy";
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
export * from "./ir/backspaceContext";
export * from "./ir/composable";
export * from "./ir/producedSet";
// The reachability-aware sibling view (spec 058). Deliberately a separate
// function, not an option on buildProducedSet - see both module headers.
export * from "./ir/reachableProducedSet";
export * from "./keyboardIRRoundTrip";
// Structurally-typed rule-element predicates. The engine's shared/rule-shape.ts
// re-exports from here so engine/studio call sites are unchanged; the join below
// and keyboard-lint (which cannot import engine) consume them directly.
export * from "./rule-shape";
export * from "./touch-coverage";
// The canonical touch key <-> rule join (spec 058). Lives here because
// keyboard-lint must consume it and cannot import engine — the same forced
// placement as buildProducedSet and computeTouchCoverage.
export * from "./touch-key-rule-join";
// The touch-node address scheme (spec 058 T114). Defined in engine originally;
// moved here because the diagnostics detectors below build addresses and are
// pinned to contracts. `engine/src/pattern-apply/touchKeyAddress.ts` is now a
// re-export shim over this module, so no call site moved.
export * from "./touch-key-address";
// The edit-time touch-key diagnostics (spec 058 Phase 9). Same forced placement
// as the join above, for the same reason: FR-040 requires the edit-time surface
// and its Layer C siblings to share ONE implementation, and contracts is the
// only package both can import.
export * from "./touch-key-diagnostics";
export * from "./parseTouchLayout";

// ---------------------------------------------------------------------------
// IRPath — typed key-path over KeyboardIR (P2 contract, FR-012).
// Invalid paths are compile errors (G1); stale paths fail typecheck (G2).
// Consumed by QuestionModule.inputs/writes and the P0 dashboard.
// ---------------------------------------------------------------------------
export * from "./ir-path";

// ---------------------------------------------------------------------------
// Utilities — shared pure helpers consumed across packages.
// ---------------------------------------------------------------------------
export * from "./utils/charUtils";
export * from "./utils/bcp47";

// ---------------------------------------------------------------------------
// Loader / data — modules that load checked-in data files (criteria.json) and
// re-export as typed `readonly` arrays / records.
// ---------------------------------------------------------------------------
export * from "./axisPriors";
export * from "./criteriaData";
export * from "./fontEntry";
export * from "./langtags";
