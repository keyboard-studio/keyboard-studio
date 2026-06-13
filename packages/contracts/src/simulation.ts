// Simulation contract types — public API shapes for the headless simulate() pipeline.
// @see packages/engine/src/simulator/index.ts

/**
 * A single key input to the simulator.
 *
 * `vkey` must be one of:
 *   - `K_XXXX` — a named Keyman virtual key (e.g. "K_A", "K_QUOTE")
 *   - `U_XXXX` — a Unicode virtual key (4–6 uppercase hex digits, e.g. "U_0041")
 *
 * `modifiers` lists the active modifier keys for this event (may be empty).
 * `caps` is handled separately from modifiers: it sets the CAPITALFLAG state key,
 * not a modifier bit, which is the correct Keyman Engine treatment of CapsLock.
 */
export interface SimKeyInput {
  vkey: string;
  modifiers: Array<"shift" | "ctrl" | "alt" | "lctrl" | "rctrl" | "lalt" | "ralt">;
  caps?: boolean;
}

/** Snapshot of a single pending deadkey at one simulation step. */
export interface DeadkeySnapshot {
  /** Numeric deadkey ID as assigned by the keyboard rule. */
  id: number;
  /** Code-point position in the text store where the deadkey is pending. */
  position: number;
}

/**
 * Trace entry produced after processing one key event.
 *
 * `outputAfter` is the full text-store contents after this keystroke (not
 * just the delta). `pendingDeadkeys` are deadkeys with `matched === 0` at
 * the time of capture.
 *
 * Required trace fields per issue #183: key input, deadkey state, string output.
 */
export interface SimulationStep {
  input: SimKeyInput;
  outputAfter: string;
  pendingDeadkeys: DeadkeySnapshot[];
  beep: boolean;
}

/**
 * Result of a full simulate() call.
 *
 * `finalOutput` is `trace[trace.length - 1].outputAfter` (or `""` for an
 * empty key sequence). `trace` has one entry per key event in the input.
 */
export interface SimulationResult {
  finalOutput: string;
  trace: SimulationStep[];
}

/**
 * Outcome of running one TestVector through simulate().
 */
export interface TestVectorResult {
  /** Human-readable description from the TestVector, if provided. */
  description?: string;
  /** The input key sequence. */
  input: string[];
  /** Expected output declared in the TestVector. */
  expectedOutput: string;
  /** Actual output produced by simulate(). */
  actualOutput: string;
  /** True when actualOutput === expectedOutput. */
  pass: boolean;
  /** Full simulation trace for debugging. */
  trace: SimulationStep[];
}

/**
 * Outcome of running all tests in a Pattern against a compiled keyboard.
 */
export interface PatternTestResult {
  /** True when every TestVector passed. */
  allPass: boolean;
  /** Per-vector results, in the same order as Pattern.tests. */
  vectors: TestVectorResult[];
}
