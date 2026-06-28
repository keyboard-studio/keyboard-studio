// Shared survey constants consumed by loadModularFlow.ts.

// Set<string> (not Set<"A"|"B"|...>) so .has(arbitraryString) typechecks at call
// sites where the input is an untyped YAML field. The literal-tuple narrowing is
// not useful here.
export const VALID_PHASES: ReadonlySet<string> = new Set([
  "A",
  "B",
  "C",
  "C-prime",
  "D",
  "E",
  "F",
  "G",
]);
