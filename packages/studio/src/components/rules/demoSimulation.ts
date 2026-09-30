// demoSimulation — Track A demo-pane simulation plumbing (spec 082, FR-001/FR-002).
//
// The demo pane ("type here, watch what happens") simulates keystrokes against
// the working copy's ALREADY-COMPILED artifact — the single 300 ms
// compile-cycle artifact the survey walk's pipeline produces (076 D3). This
// module MUST NOT compile, debounce, or recompile: it only (a) maps typed
// characters to SimKeyInput, (b) lazily loads the browser-safe simulator
// entry, and (c) builds per-keystroke trace rows from a SimulationResult.
//
// Browser entry: `@keyboard-studio/engine/context-tolerance` installs the
// `new Function` keyboard loader and exports `simulate` (spec 078). The
// engine's main entry stays simulator-free, so the studio lazy-imports the
// subpath exactly once per session (the langtagsDefaults memo pattern — only
// a successful load is cached, so a failed chunk fetch can be retried).
//
// Typed-character → SimKeyInput mapping: the keyboards under test are
// positional (non-mnemonic), so a typed character is translated to the US
// physical key that produces it (shift state included). Characters with no US
// key (anything outside ASCII, incl. the combining marks and non-Latin
// letters these keyboards exist for) become `U_XXXX` unicode-key events —
// Keyman's own virtual-key form for "the character as a key". Unmatched keys
// fall through to the engine's DefaultOutputRules, which is exactly the
// "host would have typed this" behaviour the blocking demo needs.

import type {
  CompileResult,
  SimKeyInput,
  SimulationResult,
  SimulationStep,
} from "@keyboard-studio/contracts";

/** The simulator function shape the demo pane calls. */
export type DemoSimulate = (
  compiled: CompileResult,
  keys: SimKeyInput[],
) => SimulationResult;

let _simulatePromise: Promise<DemoSimulate> | null = null;

/**
 * Load (once) the browser-safe simulator. Only a successful load is cached —
 * a failed chunk fetch rejects and can be retried by the next caller.
 */
export function loadDemoSimulate(): Promise<DemoSimulate> {
  if (_simulatePromise === null) {
    _simulatePromise = import("@keyboard-studio/engine/context-tolerance")
      .then((m) => m.simulate as DemoSimulate)
      .catch((err: unknown) => {
        _simulatePromise = null;
        throw err;
      });
  }
  return _simulatePromise;
}

// ---------------------------------------------------------------------------
// Typed character → SimKeyInput (US physical-key mapping)
// ---------------------------------------------------------------------------

interface UsKey {
  vkey: string;
  shift: boolean;
}

/**
 * US-layout physical key for each typeable ASCII character.
 *
 * Static demo data, verified against the vendored Keyman engine's
 * `USVirtualKeyCodes` (packages/engine/src/simulator/vendor/keyman/common/
 * types/consts/virtual-key-constants.ts) — the same table `simulate()`'s
 * `buildKeyEvent` resolves `K_XXXX` names through, so a name here can never
 * silently fail to resolve at simulation time.
 */
const US_KEY_FOR_CHAR: Readonly<Record<string, UsKey>> = {
  "1": { vkey: "K_1", shift: false },
  "2": { vkey: "K_2", shift: false },
  "3": { vkey: "K_3", shift: false },
  "4": { vkey: "K_4", shift: false },
  "5": { vkey: "K_5", shift: false },
  "6": { vkey: "K_6", shift: false },
  "7": { vkey: "K_7", shift: false },
  "8": { vkey: "K_8", shift: false },
  "9": { vkey: "K_9", shift: false },
  "0": { vkey: "K_0", shift: false },
  "!": { vkey: "K_1", shift: true },
  "@": { vkey: "K_2", shift: true },
  "#": { vkey: "K_3", shift: true },
  $: { vkey: "K_4", shift: true },
  "%": { vkey: "K_5", shift: true },
  "^": { vkey: "K_6", shift: true },
  "&": { vkey: "K_7", shift: true },
  "*": { vkey: "K_8", shift: true },
  "(": { vkey: "K_9", shift: true },
  ")": { vkey: "K_0", shift: true },
  "-": { vkey: "K_HYPHEN", shift: false },
  _: { vkey: "K_HYPHEN", shift: true },
  "=": { vkey: "K_EQUAL", shift: false },
  "+": { vkey: "K_EQUAL", shift: true },
  "[": { vkey: "K_LBRKT", shift: false },
  "{": { vkey: "K_LBRKT", shift: true },
  "]": { vkey: "K_RBRKT", shift: false },
  "}": { vkey: "K_RBRKT", shift: true },
  "\\": { vkey: "K_BKSLASH", shift: false },
  "|": { vkey: "K_BKSLASH", shift: true },
  ";": { vkey: "K_COLON", shift: false },
  ":": { vkey: "K_COLON", shift: true },
  "'": { vkey: "K_QUOTE", shift: false },
  '"': { vkey: "K_QUOTE", shift: true },
  ",": { vkey: "K_COMMA", shift: false },
  "<": { vkey: "K_COMMA", shift: true },
  ".": { vkey: "K_PERIOD", shift: false },
  ">": { vkey: "K_PERIOD", shift: true },
  "/": { vkey: "K_SLASH", shift: false },
  "?": { vkey: "K_SLASH", shift: true },
  "`": { vkey: "K_BKQUOTE", shift: false },
  "~": { vkey: "K_BKQUOTE", shift: true },
  " ": { vkey: "K_SPACE", shift: false },
};

/** One typed character paired with the key event the simulator will see. */
export interface DemoKey {
  /** The character the author typed. */
  char: string;
  /** The physical key pressed, e.g. "K_5" or "U_0301". */
  vkey: string;
  /** True when the US mapping needed Shift for this character. */
  shift: boolean;
  /** The SimKeyInput handed to simulate(). */
  input: SimKeyInput;
}

/** Format a code point as `U_XXXX` (4–6 uppercase hex digits, per SimKeyInput). */
export function codePointToUKey(codePoint: number): string {
  return `U_${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * Map one typed character to the key event `simulate()` should process.
 *
 * ASCII typeables resolve to their US physical key (+ shift). Everything else
 * — the combining marks, non-Latin letters, and symbols these keyboards are
 * built for — becomes a `U_XXXX` unicode-key event. Control characters
 * (newline, tab) map to their named keys; other C0/C1 controls are returned
 * as unicode-key events and left for the engine's default output rules.
 */
export function charToDemoKey(char: string): DemoKey {
  if (char === "\n") {
    return { char, vkey: "K_ENTER", shift: false, input: { vkey: "K_ENTER", modifiers: [] } };
  }
  if (char === "\t") {
    return { char, vkey: "K_TAB", shift: false, input: { vkey: "K_TAB", modifiers: [] } };
  }
  const us = US_KEY_FOR_CHAR[char];
  if (us !== undefined) {
    return {
      char,
      vkey: us.vkey,
      shift: us.shift,
      input: { vkey: us.vkey, modifiers: us.shift ? ["shift"] : [] },
    };
  }
  const lower = char.toLowerCase();
  if (/^[a-z]$/.test(lower) && char.length === 1) {
    const vkey = `K_${lower.toUpperCase()}`;
    const shift = char !== lower;
    return { char, vkey, shift, input: { vkey, modifiers: shift ? ["shift"] : [] } };
  }
  const codePoint = char.codePointAt(0) ?? 0;
  const vkey = codePointToUKey(codePoint);
  return { char, vkey, shift: false, input: { vkey, modifiers: [] } };
}

/**
 * Split typed text into per-code-point DemoKeys. Iterates by code point (not
 * UTF-16 unit) so astral characters (e.g. U+1F600) become one `U_1F600`
 * event rather than two lone surrogates.
 */
export function textToDemoKeys(text: string): DemoKey[] {
  return Array.from(text).map(charToDemoKey);
}

// ---------------------------------------------------------------------------
// firedRule — the sibling (076 FR-011 / spec 082 FR-002) trace enrichment.
//
// `SimulationStep.firedRule?: { group: string; ruleIndex: number;
// matchedContext?: string; emittedOutput?: string }` is landed by a sibling
// workstream. Until then every step lacks the field and the pane renders the
// outputAfter-diff fallback (see DemoPane). The extraction below is
// defensive BOTH ways: it validates the runtime shape instead of trusting
// the type, so it keeps working after the field lands in contracts.
// ---------------------------------------------------------------------------

/** The fired-rule trace carried on a SimulationStep (sibling contract). */
export interface FiredRuleTrace {
  /** Compiled group name the fired rule lives in (e.g. "main"). */
  group: string;
  /** Index of the rule within that group's compiled rule list. */
  ruleIndex: number;
  /** Human-readable rendering of the matched context, when provided. */
  matchedContext?: string;
  /** Human-readable rendering of the emitted output, when provided. */
  emittedOutput?: string;
}

/**
 * Extract the fired-rule trace from a simulation step, or `undefined` when
 * the step carries none (enrichment not landed, or no rule fired).
 *
 * Shape-validated at runtime: a malformed value is treated as absent rather
 * than rendered.
 */
export function extractFiredRule(step: SimulationStep): FiredRuleTrace | undefined {
  if (!("firedRule" in step)) return undefined;
  const value: unknown = (step as { firedRule?: unknown }).firedRule;
  if (typeof value !== "object" || value === null) return undefined;
  const { group, ruleIndex, matchedContext, emittedOutput } = value as {
    group?: unknown;
    ruleIndex?: unknown;
    matchedContext?: unknown;
    emittedOutput?: unknown;
  };
  if (typeof group !== "string" || typeof ruleIndex !== "number") return undefined;
  const trace: FiredRuleTrace = { group, ruleIndex };
  if (typeof matchedContext === "string") trace.matchedContext = matchedContext;
  if (typeof emittedOutput === "string") trace.emittedOutput = emittedOutput;
  return trace;
}

/** True when at least one step in the trace carries a fired-rule trace. */
export function traceHasFiredRules(trace: readonly SimulationStep[]): boolean {
  return trace.some((step) => extractFiredRule(step) !== undefined);
}

// ---------------------------------------------------------------------------
// Code-point formatting helpers for the trace rows
// ---------------------------------------------------------------------------

/** `"á"` → `"U+00E1"`; `""` → `"(empty)"`. */
export function codePointsOf(text: string): string {
  if (text === "") return "(empty)";
  return Array.from(text)
    .map((ch) => `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
}

/**
 * Short human delta between the buffer before and after one keystroke:
 * `+"x"` (appended), `−"y"` (removed), or `→ "after"` (replaced).
 */
export function describeDelta(before: string, after: string): string {
  if (before === after) return "—";
  if (after.startsWith(before)) return `+"${after.slice(before.length)}"`;
  if (before.startsWith(after)) return `−"${before.slice(after.length)}"`;
  return `→ "${after}"`;
}
