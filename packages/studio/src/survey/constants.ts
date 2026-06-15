// Shared survey constants.
// Both loadFlow.ts and loadModularFlow.ts import from here to prevent
// phase-set drift during the fan-out period when both loaders coexist.

export const VALID_PHASES = new Set([
  "A",
  "B",
  "C",
  "C-prime",
  "D",
  "E",
  "F",
  "G",
] as const);
