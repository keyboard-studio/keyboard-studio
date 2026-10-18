/**
 * TEST-ONLY STUB for spec 104's production resolver (T003).
 *
 * `packages/contracts/src/touchProduction.ts` is being landed by a parallel
 * crew on another branch. The two consumers on THIS branch
 * (`touch-key-diagnostics.ts` T006, `touch-coverage.ts` T025) import
 * `resolveTouchProduction` from `./touchProduction` against the API specified
 * in specs/104-touch-key-id-criteria/contracts/key-id-criteria.md §1, and
 * `vitest.config.ts` aliases that specifier to THIS file so the contracts
 * suites can run before the branches integrate.
 *
 * This stub is a faithful-but-minimal implementation of the contract §1
 * semantics over the spec 063 rule-join. It is NOT the resolver: delete the
 * vitest alias (and this directory) when the real module lands. Known
 * simplifications, all flagged for the integration reconciliation:
 *
 *  - Layer-state is derived from the layer id by token scan (shift / rightalt
 *    / caps / …), per research.md's substring account of
 *    `Codes.getStateFromLayer`. The per-key `layer` override is ignored.
 *  - Modifier applicability is a subset test against the layer-state tokens;
 *    NCAPS and chirality subtleties are not modelled.
 *  - The K_ fallback table covers letters, digits, and common punctuation
 *    only; an unmapped K_ id resolves to `none` here (the real resolver reads
 *    KMW's full base tables).
 *  - A non-producing binding set (guard / suppresses / transitions only)
 *    returns source `"none"` WITH `ruleRefs` populated — the contract §1
 *    literal reading. Consumers must therefore not treat `source: "none"`
 *    alone as "no rule": FR-009/FR-023 define the dead key as a producing
 *    T_ key WITH NO RULE, so the diagnostics consumer additionally requires
 *    `ruleRefs` to be empty. See the reconciliation note in
 *    `touch-key-diagnostics.ts`.
 *  - An undecodable `U_` id (malformed hex) resolves to `"unclassified"`.
 *  - For a RULED U_ key, the U_ decode is appended as a final production
 *    (the no-rule-matches arm, contract §1 rule arm), so set-valued
 *    consumers (coverage) credit both arms.
 */

import type { KeyboardIR, TouchKeyIR } from "../src/keyboard-ir";
import {
  bindingsForKeyId,
  normalizeTouchKeyId,
  type TouchKeyRuleBinding,
  type TouchKeyRuleIndex,
} from "../src/touch-key-rule-join";
import { decodeUnicodeKeyId } from "../src/touch-coverage";

// ---------------------------------------------------------------------------
// The specified API (contracts §1 record shape)
// ---------------------------------------------------------------------------

export type TouchProductionSource =
  | "rule"
  | "u-decode"
  | "k-fallback"
  | "emulation"
  | "none"
  | "unclassified";

/** A production's output, discriminated so consumers never guess at a string's meaning. */
export type TouchProductionOutput =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "deadkey"; readonly name: string }
  | { readonly kind: "layerSwitch"; readonly layerId: string }
  | { readonly kind: "none" }
  | { readonly kind: "unknown" };

export interface TouchProduction {
  readonly output: TouchProductionOutput;
  /** Context condition, present when `contextConditional` splits the production set. */
  readonly condition?: string;
}

export interface TouchProductionRecord {
  readonly productions: readonly TouchProduction[];
  readonly source: TouchProductionSource;
  readonly contextConditional: boolean;
  /** Node ids of the bindings (any role) that apply in this state. */
  readonly ruleRefs: readonly string[];
  readonly fallbackCertain: boolean;
}

export interface TouchProductionInputs {
  /** Optional: coverage calls with a rule index only. Absent ⇒ the nomatch presumption is unexamined. */
  readonly ir?: KeyboardIR;
  readonly ruleIndex: TouchKeyRuleIndex;
}

/** One key occurrence — the FR-001 unit (platform × layer × key). */
export interface TouchKeyOccurrence {
  readonly platformId: string;
  readonly layerId: string;
  readonly key: TouchKeyIR;
}

// ---------------------------------------------------------------------------
// Stub implementation
// ---------------------------------------------------------------------------

const EMULATION_IDS = new Set([
  "K_BKSP",
  "K_ENTER",
  "K_TAB",
  "K_LOPT",
  "K_ROPT",
  "K_LALT",
  "K_RALT",
  "K_LCTRL",
  "K_RCTRL",
  "K_LSHIFT",
  "K_RSHIFT",
  "K_CAPS",
  "K_ESC",
]);

/** US base characters for the K_ fallback: [state-0, SHIFT] per key id. */
const BASE_KEYS: Readonly<Record<string, readonly [string, string]>> = {
  K_A: ["a", "A"], K_B: ["b", "B"], K_C: ["c", "C"], K_D: ["d", "D"],
  K_E: ["e", "E"], K_F: ["f", "F"], K_G: ["g", "G"], K_H: ["h", "H"],
  K_I: ["i", "I"], K_J: ["j", "J"], K_K: ["k", "K"], K_L: ["l", "L"],
  K_M: ["m", "M"], K_N: ["n", "N"], K_O: ["o", "O"], K_P: ["p", "P"],
  K_Q: ["q", "Q"], K_R: ["r", "R"], K_S: ["s", "S"], K_T: ["t", "T"],
  K_U: ["u", "U"], K_V: ["v", "V"], K_W: ["w", "W"], K_X: ["x", "X"],
  K_Y: ["y", "Y"], K_Z: ["z", "Z"],
  K_1: ["1", "!"], K_2: ["2", "@"], K_3: ["3", "#"], K_4: ["4", "$"],
  K_5: ["5", "%"], K_6: ["6", "^"], K_7: ["7", "&"], K_8: ["8", "*"],
  K_9: ["9", "("], K_0: ["0", ")"],
  K_SPACE: [" ", " "],
  K_QUOTE: ["'", '"'],
  K_COMMA: [",", "<"],
  K_PERIOD: [".", ">"],
  K_SLASH: ["/", "?"],
  K_BKSLASH: ["\\", "|"],
  K_SEMICOLON: [";", ":"],
  K_EQUAL: ["=", "+"],
  K_HYPHEN: ["-", "_"],
  K_LBRKT: ["[", "{"],
  K_RBRKT: ["]", "}"],
  K_ACCENT: ["`", "~"],
};

/** Layer-state tokens from a layer id, by token scan (stub simplification — see header). */
function stateTokensForLayer(layerId: string): ReadonlySet<string> {
  const tokens = new Set<string>();
  for (const part of layerId.toLowerCase().split(/[-_]/)) {
    if (part === "shift") tokens.add("SHIFT");
    else if (part === "rightalt" || part === "ralt") tokens.add("RALT");
    else if (part === "leftalt" || part === "lalt") tokens.add("LALT");
    else if (part === "alt") tokens.add("ALT");
    else if (part === "caps" || part === "capital") tokens.add("CAPITAL");
    else if (part === "ctrl" || part === "control") tokens.add("CTRL");
  }
  return tokens;
}

function bindingAppliesInState(
  binding: TouchKeyRuleBinding,
  state: ReadonlySet<string>,
): boolean {
  return binding.modifiers.every((m) => state.has(m.toUpperCase()));
}

const NONE_RECORD = (
  ruleRefs: readonly string[],
): TouchProductionRecord => ({
  productions: [{ output: { kind: "none" } }],
  source: "none",
  contextConditional: false,
  ruleRefs,
  fallbackCertain: true,
});

export function resolveTouchProduction(
  inputs: TouchProductionInputs,
  occurrence: TouchKeyOccurrence,
): TouchProductionRecord {
  const { ruleIndex } = inputs;
  const { layerId, key } = occurrence;
  const state = stateTokensForLayer(layerId);
  const normalized = normalizeTouchKeyId(key.id);

  const applicable = bindingsForKeyId(ruleIndex, key.id).filter((b) =>
    bindingAppliesInState(b, state),
  );
  const ruleRefs = applicable.map((b) => b.ruleNodeId);
  const producing = applicable.filter((b) => b.role === "produces");

  if (producing.length > 0) {
    const productions: TouchProduction[] = producing.map((b) => ({
      output: {
        kind: "text",
        text: b.producedText ?? b.produced.join(""),
      } as const,
      ...(b.contextGuarded ? { condition: "context-guarded" } : {}),
    }));
    const contextConditional = producing.some((b) => b.contextGuarded);
    if (contextConditional) {
      // The swallowed arm: where the guard's context does not hold, the
      // producing rule does not fire.
      productions.push({
        output: { kind: "none" },
        condition: "guard not satisfied",
      });
    }
    // A ruled U_ key keeps its decode as the no-rule-matches arm.
    if (normalized.startsWith("U_")) {
      const decoded = decodeUnicodeKeyId(normalized);
      if (decoded !== undefined) {
        productions.push({ output: { kind: "text", text: decoded } });
      }
    }
    return {
      productions,
      source: "rule",
      contextConditional,
      ruleRefs,
      fallbackCertain: true,
    };
  }

  if (applicable.length > 0) {
    // Bindings exist but none produces in this state (guard / suppresses /
    // transitions only). Contract §1 literal reading: source stays "none";
    // ruleRefs is what tells a consumer a rule EXISTS (FR-023).
    return NONE_RECORD(ruleRefs);
  }

  if (key.nextlayer !== undefined && key.nextlayer.length > 0) {
    return {
      productions: [
        { output: { kind: "layerSwitch", layerId: key.nextlayer } },
      ],
      source: "none",
      contextConditional: false,
      ruleRefs: [],
      fallbackCertain: true,
    };
  }

  if (normalized.startsWith("U_")) {
    const decoded = decodeUnicodeKeyId(normalized);
    if (decoded === undefined) {
      return {
        productions: [],
        source: "unclassified",
        contextConditional: false,
        ruleRefs: [],
        fallbackCertain: true,
      };
    }
    const hasNomatch =
      inputs.ir?.groups.some((g) => g.name.toLowerCase() === "nomatch") ??
      false;
    return {
      productions: [{ output: { kind: "text", text: decoded } }],
      source: "u-decode",
      contextConditional: false,
      ruleRefs: [],
      fallbackCertain: !hasNomatch,
    };
  }

  if (normalized.startsWith("K_")) {
    if (EMULATION_IDS.has(normalized) || normalized.startsWith("K_NP")) {
      return {
        productions: [],
        source: "emulation",
        contextConditional: false,
        ruleRefs: [],
        fallbackCertain: true,
      };
    }
    if (state.has("CAPITAL")) {
      // Caps-state fallback is UNSETTLED (contracts §5): report it as such.
      return {
        productions: [{ output: { kind: "unknown" } }],
        source: "k-fallback",
        contextConditional: false,
        ruleRefs: [],
        fallbackCertain: false,
      };
    }
    const nonShift = [...state].filter((t) => t !== "SHIFT");
    if (nonShift.length === 0) {
      const base = BASE_KEYS[normalized];
      if (base !== undefined) {
        return {
          productions: [
            { output: { kind: "text", text: state.has("SHIFT") ? base[1] : base[0] } },
          ],
          source: "k-fallback",
          contextConditional: false,
          ruleRefs: [],
          fallbackCertain: true,
        };
      }
    }
    return NONE_RECORD([]);
  }

  if (normalized.startsWith("T_")) {
    return NONE_RECORD([]);
  }

  return {
    productions: [],
    source: "unclassified",
    contextConditional: false,
    ruleRefs: [],
    fallbackCertain: true,
  };
}
