// useLayoutAttribution — the Layout tab's per-key attribution for one layer, verified against
// the one published compile artifact (spec 117 FR-011/FR-013/FR-017/FR-018;
// contracts/attribution.md "Studio: verification").
//
// A pure reader of `rulesDemoArtifactStore` (the D3 artifact): it starts no timer and calls no
// compile. Each time the artifact is ready it decodes the published bytes, runs the engine's
// static `attributeLayer`, simulates every key once per context with `simulateEach`, and lets
// `verifyCells` demote any editable cell the compiled keyboard disagrees with. Until the working
// copy has a compiled `.js`, every cell is `not-compiled` (never a guess); a keyboard that stops
// compiling keeps the last good result, marked stale.

import { useEffect, useMemo, useState } from "react";
import type {
  CompileResult,
  CompilerDiagnostic,
  KeyboardIR,
  LayerCombo,
  LayoutContext,
  SimKeyInput,
  SimulationStep,
  SimulatorContextSeed,
} from "@keyboard-studio/contracts";
import { DESKTOP_ISO_GEOMETRY, attributeLayer, isMnemonic, verifyCells } from "@keyboard-studio/engine";
import type { CellStep, FiredRuleCheck, KeyCellAttribution, RowAttribution } from "@keyboard-studio/engine";
import { extractFiredRule } from "../../components/rules/demoSimulation.ts";
import { buildFiredRuleResolver } from "../../components/rules/firedRuleMapping.ts";
import { useRulesDemoArtifactStore, type RulesDemoArtifact } from "../../stores/rulesDemoArtifactStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

/** The simulator entry the hook needs: each input simulated independently from the same seed. */
export type SimulateEach = (
  compiled: CompileResult,
  inputs: readonly SimKeyInput[],
  seed?: SimulatorContextSeed,
) => SimulationStep[];

/** Every vkey on the ISO desktop grid, frame keys included (attribution marks them `frame`). */
export const DESKTOP_VKEYS: readonly string[] = DESKTOP_ISO_GEOMETRY.map((k) => k.id);

export type LayoutAttributionState = "ready" | "stale" | "not-compiled";

export interface LayoutAttribution {
  /**
   * `ready`: verified against the current artifact. `stale`: the artifact is loading again or
   * failed, so the last good result is shown. `not-compiled`: no `.js` has been published yet.
   */
  state: LayoutAttributionState;
  /** Why the result is stale: the next compile is running, or the last one failed. */
  staleReason: "loading" | "error" | null;
  /** One entry per grid key; every editable behaviour is `not-compiled` read-only in that state. */
  cells: KeyCellAttribution[];
  /** The simulated keystrokes the cells were verified with (empty when not compiled). */
  steps: CellStep[];
  /** True for a mnemonic keyboard (every cell is read-only with reason `mnemonic`). */
  mnemonic: boolean;
  /** Diagnostics of the compile that produced (or failed to produce) the artifact. */
  diagnostics: readonly CompilerDiagnostic[];
  /** Failure message of the last compile or of the verification pass itself, when there was one. */
  errorMessage: string | null;
}

export interface UseLayoutAttributionOptions {
  /** Test injections; production reads the working copy and the D3 artifact store. */
  ir?: KeyboardIR | null;
  artifact?: RulesDemoArtifact;
  jsBytes?: Uint8Array;
  simulateEach?: SimulateEach;
  vkeys?: readonly string[];
}

// ---------------------------------------------------------------------------
// Layer -> simulator input
// ---------------------------------------------------------------------------

const MODIFIER_TO_SIM: ReadonlyMap<string, SimKeyInput["modifiers"][number]> = new Map([
  ["SHIFT", "shift"],
  ["CTRL", "ctrl"],
  ["ALT", "alt"],
  ["LCTRL", "lctrl"],
  ["RCTRL", "rctrl"],
  ["LALT", "lalt"],
  ["RALT", "ralt"],
]);

/**
 * The simulator input for a key pressed in a layer. CAPS is a state key, so it maps to
 * `caps: true`; NCAPS is the default state. (The engine's `chordToSimKeyInput` is not
 * exported from the package root, so this is a local mapper with the same table.)
 */
export function layerToSimInput(vkey: string, layer: LayerCombo): SimKeyInput {
  const modifiers: SimKeyInput["modifiers"] = [];
  let caps = false;
  for (const m of layer) {
    const name = m.toUpperCase();
    if (name === "CAPS") caps = true;
    else if (name !== "NCAPS") {
      const mapped = MODIFIER_TO_SIM.get(name);
      if (mapped !== undefined) modifiers.push(mapped);
    }
  }
  return caps ? { vkey, modifiers, caps } : { vkey, modifiers };
}

/**
 * The number the compiler gives each deadkey, by the deadkey's id in the working copy. The
 * compiled keyboard does not keep the ids a source writes: it numbers its deadkeys 0, 1, ... in
 * the order the source first mentions them (a rule's context, then its output; named deadkeys take
 * a number too), and the simulator is seeded with those numbers. Verified against the observed
 * numbering of the corpus keyboards (the attribution corpus suite).
 */
export function deadkeyOrdinals(ir: KeyboardIR): Map<number, number> {
  const seen = new Map<string, number>();
  const ordinals = new Map<number, number>();
  const note = (el: { kind: string; id?: number; name?: string }): void => {
    if (el.kind === "deadkey" && el.id !== undefined) {
      if (!ordinals.has(el.id)) {
        const n = seen.size;
        seen.set(`d:${el.id}`, n);
        ordinals.set(el.id, n);
      }
    } else if (el.kind === "namedDeadkey" && el.name !== undefined) {
      const key = `n:${el.name.toLowerCase()}`;
      if (!seen.has(key)) seen.set(key, seen.size);
    }
  };
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (!("context" in rule)) continue;
      for (const el of rule.context) note(el);
      if ("output" in rule) for (const el of rule.output) note(el);
    }
  }
  return ordinals;
}

/**
 * The simulator seed for a context ("what came before the keystroke"), or null when it cannot
 * be seeded: a named deadkey has no number until the compiler assigns one, so rows after it stay
 * unverified (the static pass stands) rather than being guessed. `ordinals` maps a deadkey's id
 * to the compiled number (`deadkeyOrdinals`); without it the id itself is used.
 */
export function contextToSeed(context: LayoutContext, ordinals?: ReadonlyMap<number, number>): SimulatorContextSeed | null {
  let text = "";
  const pendingDeadkeys: Array<{ id: number; position: number }> = [];
  for (const el of context) {
    if (el.kind === "text") text += el.text;
    else {
      if (!/^[0-9a-f]+$/i.test(el.deadkeyId)) return null;
      const id = parseInt(el.deadkeyId, 16);
      const compiled = ordinals === undefined ? id : ordinals.get(id);
      if (compiled === undefined) return null;
      pendingDeadkeys.push({ id: compiled, position: Array.from(text).length });
    }
  }
  return pendingDeadkeys.length > 0 ? { text, pendingDeadkeys } : { text };
}

function contextKey(context: LayoutContext): string {
  return context.map((el) => (el.kind === "text" ? `t:${el.text}` : `d:${el.deadkeyId.toLowerCase()}`)).join("\u0001");
}

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

function demoteNotCompiled(row: RowAttribution): RowAttribution {
  if (!row.editable) return row;
  const { readOnlyReason: _drop, ...rest } = row;
  void _drop;
  return { ...rest, editable: false, readOnlyReason: "not-compiled" };
}

/** Every editable behaviour read-only as `not-compiled`: nothing has been compiled to check against. */
export function notCompiledCells(cells: readonly KeyCellAttribution[]): KeyCellAttribution[] {
  return cells.map((c) =>
    c.frame
      ? c
      : { ...c, plain: c.plain === null ? null : demoteNotCompiled(c.plain), rows: c.rows.map(demoteNotCompiled) },
  );
}

/**
 * `FiredRuleCheck` over `firedRuleMapping`: false only when the fired rule can be named with
 * confidence and is not the row's own rule. When the mapping cannot name it, the check passes
 * (the output comparison in `verifyCells` still applies).
 */
export function makeFiredRuleCheck(
  ir: KeyboardIR,
  jsSource: string,
  compiledKmn: string | null = null,
): FiredRuleCheck {
  const resolve = buildFiredRuleResolver(ir, jsSource, compiledKmn);
  return (step, ruleNodeId) => {
    const fired = extractFiredRule(step);
    if (fired === undefined) return true;
    const rule = resolve(fired);
    return rule === undefined || rule.nodeId === ruleNodeId;
  };
}

/**
 * Attribute `layer`, simulate every non-frame key (empty context, plus every context some row
 * on the layer is written for, plus `context`), and verify. Synchronous and pure given
 * `simulateEach`.
 */
export function computeLayerAttribution(args: {
  ir: KeyboardIR;
  layer: LayerCombo;
  vkeys: readonly string[];
  compiled: CompileResult;
  simulateEach: SimulateEach;
  firedRuleIs?: FiredRuleCheck;
  context?: LayoutContext;
}): { cells: KeyCellAttribution[]; steps: CellStep[] } {
  const { ir, layer, vkeys, compiled, simulateEach, firedRuleIs } = args;
  const cells = attributeLayer(ir, layer, vkeys);

  const contexts = new Map<string, { context: LayoutContext; vkeys: Set<string> }>();
  const want = (context: LayoutContext, vkey: string): void => {
    const id = contextKey(context);
    let e = contexts.get(id);
    if (e === undefined) {
      e = { context, vkeys: new Set() };
      contexts.set(id, e);
    }
    e.vkeys.add(vkey);
  };
  const chosen = args.context !== undefined && args.context.length > 0 ? args.context : null;
  for (const c of cells) {
    if (c.frame) continue;
    want([], c.vkey);
    if (chosen !== null) want(chosen, c.vkey);
    for (const r of c.rows) if (r.context.length > 0) want(r.context, c.vkey);
  }

  const steps: CellStep[] = [];
  const ordinals = deadkeyOrdinals(ir);
  for (const { context, vkeys: keys } of contexts.values()) {
    const seed = contextToSeed(context, ordinals);
    if (seed === null) continue;
    const ordered = [...keys];
    const simulated = simulateEach(
      compiled,
      ordered.map((vkey) => layerToSimInput(vkey, layer)),
      seed,
    );
    ordered.forEach((vkey, i) => {
      const step = simulated[i];
      if (step !== undefined) steps.push({ vkey, layer, ...(context.length > 0 ? { context } : {}), step });
    });
  }
  return { cells: verifyCells(cells, steps, firedRuleIs), steps };
}

// ---------------------------------------------------------------------------
// Published bytes and the simulator (browser)
// ---------------------------------------------------------------------------

const jsBytesCache = new Map<string, Uint8Array>();

async function fetchPublishedBytes(url: string): Promise<Uint8Array> {
  const cached = jsBytesCache.get(url);
  if (cached !== undefined) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetching the compiled keyboard failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  jsBytesCache.set(url, bytes);
  return bytes;
}

let simulateEachPromise: Promise<SimulateEach> | null = null;

/**
 * Load (once) the browser-safe simulator. The browser entry (`engine/context-tolerance`) installs
 * the `new Function` keyboard loader; it exports `simulate` and, where the engine publishes it,
 * `simulateEach`. Without `simulateEach` each input is simulated on its own from the same seed,
 * which gives the same result at the cost of loading the keyboard once per key.
 */
export function loadSimulateEach(): Promise<SimulateEach> {
  if (simulateEachPromise === null) {
    simulateEachPromise = import("@keyboard-studio/engine/context-tolerance")
      .then((m): SimulateEach => {
        const each = (m as { simulateEach?: SimulateEach }).simulateEach;
        if (each !== undefined) return each;
        return (compiled, inputs, seed) =>
          inputs.map((input) => m.simulate(compiled, [input], seed).trace[0] as SimulationStep);
      })
      .catch((err: unknown) => {
        simulateEachPromise = null;
        throw err;
      });
  }
  return simulateEachPromise;
}

function asCompileResult(bytes: Uint8Array, url: string): CompileResult {
  return {
    success: true,
    artifacts: [{ filename: "keyboard.js", url, sizeBytes: bytes.length, data: bytes }],
    diagnostics: [],
    compileMs: 0,
    isWarmCompile: true,
  };
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

interface Computed {
  ir: KeyboardIR;
  url: string;
  layerId: string;
  contextId: string;
  cells: KeyCellAttribution[];
  steps: CellStep[];
}

/**
 * Attribution of `layer` (and, for the "after ..." view, the chosen `context`) for the working
 * copy, verified against the published compile artifact.
 */
export function useLayoutAttribution(
  layer: LayerCombo,
  context?: LayoutContext,
  opts: UseLayoutAttributionOptions = {},
): LayoutAttribution {
  const storeArtifact = useRulesDemoArtifactStore((s) => s.artifact);
  const artifact = opts.artifact ?? storeArtifact;
  const storeIr = useWorkingCopyStore((s) => s.ir);
  const ir = opts.ir !== undefined ? opts.ir : storeIr;
  const vkeys = opts.vkeys ?? DESKTOP_VKEYS;
  const layerId = layer.join("+");
  const contextId = context === undefined ? "" : contextKey(context);

  const [computed, setComputed] = useState<Computed | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const url = artifact.status === "ready" ? artifact.jsBlobUrl : null;
  const compiledKmn = artifact.compiledKmn;
  useEffect(() => {
    if (ir === null || url === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const bytes = opts.jsBytes ?? (await fetchPublishedBytes(url));
        const simulateEach = opts.simulateEach ?? (await loadSimulateEach());
        const out = computeLayerAttribution({
          ir,
          layer,
          vkeys,
          compiled: asCompileResult(bytes, url),
          simulateEach,
          firedRuleIs: makeFiredRuleCheck(ir, new TextDecoder().decode(bytes), compiledKmn),
          ...(context !== undefined ? { context } : {}),
        });
        if (cancelled) return;
        setComputed({ ir, url, layerId, contextId, ...out });
        setFailure(null);
      } catch (err: unknown) {
        if (!cancelled) setFailure(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // `layer` and `context` are covered by their ids; the injected seams are test-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ir, url, compiledKmn, layerId, contextId, vkeys, opts.jsBytes, opts.simulateEach]);

  return useMemo((): LayoutAttribution => {
    const mnemonic = ir !== null && isMnemonic(ir);
    const base = { mnemonic, diagnostics: artifact.diagnostics };
    if (computed !== null && computed.layerId === layerId && computed.contextId === contextId) {
      const fresh = artifact.status === "ready" && computed.ir === ir && computed.url === url && failure === null;
      if (fresh) {
        return { ...base, state: "ready", staleReason: null, cells: computed.cells, steps: computed.steps, errorMessage: null };
      }
      return {
        ...base,
        state: "stale",
        staleReason: artifact.status === "error" || failure !== null ? "error" : "loading",
        cells: computed.cells,
        steps: computed.steps,
        errorMessage: artifact.errorMessage ?? failure,
      };
    }
    return {
      ...base,
      state: "not-compiled",
      staleReason: null,
      cells: ir === null ? [] : notCompiledCells(attributeLayer(ir, layer, vkeys)),
      steps: [],
      errorMessage: artifact.errorMessage ?? failure,
    };
    // `layer` is covered by `layerId`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed, artifact, ir, url, failure, layerId, contextId, vkeys]);
}
