// Test-only harness H5: keystroke equivalence between a KMN keyboard and its LDML export
// (FR-051; research R24). Never import this from product code.
//
// KMN side: the engine's simulator over a compiled copy with `&TARGETS` forced to `any`.
// Its base layout is fixed to `us`, so the export is always built with the US base here.
// LDML side: `ldmlInterpreter`. Sequences: every key in every layer, every context rule's
// `context + key` path, and seeded random walks. Comparison: NFC(kmn) === ldml.

import { US_BASE_LAYOUT, createVirtualFS, isPlusSeparator } from "@keyboard-studio/contracts";
import type { CompileResult, KeyboardIR, SimKeyInput } from "@keyboard-studio/contracts";
import { enumerateUnhandledPositions } from "../../base-fallback/unhandledPositions.js";
import { compile } from "../../compiler/index.js";
import { simulate } from "../../simulator/node.js";
import { instrumentFiredRuleTracking } from "../../simulator/firedRuleTracker.js";
import { US_BASE } from "../__fixtures__/us-base.js";
import { buildLdmlExport } from "../package.js";
import { loadLdml, type LdmlKeystroke } from "./ldmlInterpreter.js";
import type { CompatibilityItem, LdmlExportInput } from "../types.js";

export const MODIFIER_STATES: readonly SimKeyInput["modifiers"][] = [[], ["shift"], ["ralt"], ["shift", "ralt"]];

const POSITIONS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => `K_${c}`),
  ..."0123456789".split("").map((c) => `K_${c}`),
  "K_BKQUOTE", "K_HYPHEN", "K_EQUAL", "K_LBRKT", "K_RBRKT", "K_BKSLASH",
  "K_COLON", "K_QUOTE", "K_COMMA", "K_PERIOD", "K_SLASH", "K_SPACE",
];

/** Forces `&TARGETS` to `any` in a test copy; never touches a rule. */
export function withTargetsAny(kmn: string): string {
  const re = /^([ \t]*store\(&TARGETS\)[ \t]*)(['"])[^'"]*\2/im;
  if (re.test(kmn)) return kmn.replace(re, "$1'any'");
  return kmn.replace(/^([ \t]*store\(&NAME\).*)$/im, "$1\nstore(&TARGETS) 'any'");
}

export function compileForSimulation(id: string, kmn: string): Promise<CompileResult> {
  return compile(createVirtualFS([{ path: `source/${id}.kmn`, content: withTargetsAny(kmn), isBinary: false }]), id);
}

/** A small deterministic generator (mulberry32) seeded from a string. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Sequence {
  keys: SimKeyInput[];
  seed: string;
}

const keyOf = (vkey: string, modifiers: SimKeyInput["modifiers"], caps: boolean): SimKeyInput => ({ vkey, modifiers, caps });

/** The main-block spelling of a vkey name (`K_OE2` for `K_oE2`), or the name unchanged. */
function tableVKeyName(name: string): string {
  return POSITIONS.find((p) => p.toUpperCase() === name.toUpperCase()) ?? name;
}

const STATE_OF = (mods: SimKeyInput["modifiers"]): string =>
  mods.includes("shift") ? (mods.includes("ralt") ? "shiftAltgr" : "shift") : mods.includes("ralt") ? "altgr" : "none";

/**
 * The simulator does not model caps lock acting on the base keyboard's default output, so a
 * caps-on keystroke is only compared where a rule handles the position (spec 109's enumerator).
 */
export function capsComparable(ir: KeyboardIR): (vkey: string, mods: SimKeyInput["modifiers"]) => boolean {
  // Only a context-free rule fixes the key's own output; a key with context rules alone still gets
  // the base keyboard's character, which the simulator does not caps-shift.
  const contextFree: KeyboardIR = {
    ...ir,
    groups: ir.groups.map((g) => ({ ...g, rules: g.rules.filter((r) => r.context.length === 1) })),
  };
  const unhandled = new Set(enumerateUnhandledPositions(contextFree, POSITIONS).map((p) => `${p.vkey}|${p.state}`));
  return (vkey, mods) => !unhandled.has(`${vkey}|${STATE_OF(mods)}`);
}

export function allKeySequences(ir: KeyboardIR): Sequence[] {
  const comparable = capsComparable(ir);
  const out: Sequence[] = [];
  for (const vkey of POSITIONS) {
    for (const mods of MODIFIER_STATES) {
      for (const caps of [false, true]) {
        if (caps && !comparable(vkey, mods)) continue;
        out.push({ keys: [keyOf(vkey, mods, caps)], seed: "" });
      }
    }
  }
  return out;
}

/** Each typed-context rule's `context + key` path, with the context as seed text. */
export function contextRuleSequences(ir: KeyboardIR): Sequence[] {
  const out: Sequence[] = [];
  for (const g of ir.groups) {
    if (!g.usingKeys) continue;
    for (const r of g.rules) {
      let plus = -1;
      r.context.forEach((el, i) => {
        if (isPlusSeparator(el)) plus = i;
      });
      if (plus < 0) continue;
      const key = r.context[plus + 1];
      if (key?.kind !== "vkey" || !POSITIONS.includes(tableVKeyName(key.name))) continue;
      let seed = "";
      let typed = true;
      for (const el of r.context.slice(0, plus)) {
        if (el.kind === "char") seed += el.value;
        else if (el.kind === "any") {
          const s = ir.stores.find((x) => x.name.toLowerCase() === el.storeRef.toLowerCase());
          const first = s?.items[0];
          if (first?.kind === "char") seed += first.value;
          else typed = false;
        } else typed = false;
      }
      if (!typed) continue;
      const mods = key.modifiers.map((m) => m.toLowerCase()).filter((m): m is SimKeyInput["modifiers"][number] => ["shift", "ctrl", "alt", "lctrl", "rctrl", "lalt", "ralt"].includes(m));
      out.push({ keys: [keyOf(key.name, mods, false)], seed });
    }
  }
  return out;
}

export function randomWalks(id: string, ir: KeyboardIR, count = 200): Sequence[] {
  const comparable = capsComparable(ir);
  const rnd = seeded(id);
  const out: Sequence[] = [];
  for (let n = 0; n < count; n++) {
    const len = 1 + Math.floor(rnd() * 6);
    const keys: SimKeyInput[] = [];
    for (let k = 0; k < len; k++) {
      const vkey = POSITIONS[Math.floor(rnd() * POSITIONS.length)] as string;
      const mods = MODIFIER_STATES[Math.floor(rnd() * MODIFIER_STATES.length)] as SimKeyInput["modifiers"];
      keys.push(keyOf(vkey, mods, rnd() < 0.15 && comparable(vkey, mods)));
    }
    out.push({ keys, seed: "" });
  }
  return out;
}

const KMN_TO_LDML_MOD: Record<string, string> = { shift: "shift", ctrl: "ctrl", alt: "alt", lctrl: "ctrlL", rctrl: "ctrlR", lalt: "altL", ralt: "altR" };

export function toLdmlKeys(keys: readonly SimKeyInput[]): LdmlKeystroke[] {
  return keys.map((k) => ({ vkey: k.vkey, modifiers: k.modifiers.map((m) => KMN_TO_LDML_MOD[m] ?? m), caps: k.caps === true }));
}

export interface Mismatch {
  keys: string;
  seed: string;
  kmn: string;
  ldml: string;
  excused: boolean;
  /** Why: a fired KMN rule that is an A/N item, or the keyboard's partial call chain. */
  excusedBy: "rule" | "option" | "chain" | null;
}

export interface EquivalenceResult {
  total: number;
  /** Sequences the simulator could not run (counted, never silently dropped). */
  skipped: number;
  mismatches: Mismatch[];
  unexcused: Mismatch[];
  /** A/N items that may excuse a mismatch. */
  lossyItems: CompatibilityItem[];
  compileOk: boolean;
}

/** Virtual keys (upper case) the keystroke of the rule at a source line names; a character maps through the US layout. */
function keysAtLine(ir: KeyboardIR, line: number): string[] {
  const out: string[] = [];
  for (const g of ir.groups) {
    for (const r of g.rules) {
      if (r.sourceLine !== line) continue;
      const last = r.context[r.context.length - 1];
      if (last?.kind === "vkey") out.push(last.name.toUpperCase());
      else if (last?.kind === "char") {
        for (const [k, v] of US_BASE_LAYOUT) if (v === last.value) out.push(k.replace(/^S\+/, "").toUpperCase());
      }
    }
  }
  return out;
}

/** The compiled script's per-group rule source lines, from the simulator's own instrumentation. */
function ruleLines(compiled: CompileResult): Map<string, Array<number | null>> {
  const js = compiled.artifacts.find((x) => x.filename.endsWith(".js"));
  const out = new Map<string, Array<number | null>>();
  if (js?.data === undefined) return out;
  const inst = instrumentFiredRuleTracking(new TextDecoder("utf-8").decode(js.data));
  for (const g of inst?.groups ?? []) out.set(g.name, g.ruleSrcLines);
  return out;
}

/** Rows whose items describe LDML running a group on keystrokes the KMN rule never reached. */
const CHAIN_ROWS = new Set(["1.6", "1.7"]);

/**
 * Compare the KMN and LDML behaviour of one keyboard (T039; research R24). A mismatch is excused
 * only when a KMN rule that fired in the sequence (the simulator's `firedRule`, mapped to its source
 * line) is the line of an A or N item. Two further cases are counted apart: a key named by a row 3.17
 * (option default) item, because the simulator cannot preset option stores; and a keyboard with a partial
 * call chain (rows 1.6, 1.7) runs the called group in LDML after keystrokes that never reached it in
 * KMN, which no KMN fired rule can name; its mismatches are reported as `chain`, not as `rule`.
 * Items for touch-only groups never excuse anything. `lineOffset` maps compiled-text lines to the IR's.
 */
export async function checkEquivalence(
  id: string,
  kmn: string,
  ir: KeyboardIR,
  build: (input: LdmlExportInput) => Promise<Awaited<ReturnType<typeof buildLdmlExport>>>,
  input: LdmlExportInput,
  extra: readonly Sequence[] = [],
  lineOffset = 0,
): Promise<EquivalenceResult> {
  const compiled = await compileForSimulation(id, kmn);
  const compileOk = compiled.artifacts.some((a) => a.filename.endsWith(".js"));
  const result = await build({ ...input, baseLayout: US_BASE });
  if (!result.ok) throw new Error(`export refused: ${result.reason}`);
  const xml = [...result.files.entries()].find(([k]) => k.endsWith(".xml"))?.[1] as string;
  const ldml = loadLdml(xml);

  const touchOnly = ["1.3", "1.4", "1.4a", "1.4b", "1.10", "1.11", "4.9", "4.11", "4.12", "2.15", "4.16", "4.17", "2.26"];
  const lossyItems = result.classification.items.filter((i) => (i.status === "A" || i.status === "N") && !touchOnly.includes(i.rowId));
  const lossyLines = new Set<number>();
  for (const i of lossyItems) if (i.line !== null) lossyLines.add(i.line);
  const hasChain = lossyItems.some((i) => CHAIN_ROWS.has(i.rowId));
  // The simulator starts option stores unset, so a rule guarded by `if(opt = 'default')` cannot fire
  // there even though Keyman (and the export) start every option at its default (research R24).
  // Mismatches on a key named by a row 3.17 item are reported as `option`, apart from `rule`.
  const optionKeys = new Set<string>();
  for (const i of lossyItems) if (i.rowId === "3.17" && i.line !== null) for (const k of keysAtLine(ir, i.line)) optionKeys.add(k);
  const lines = ruleLines(compiled);

  const sequences = [...allKeySequences(ir), ...contextRuleSequences(ir), ...randomWalks(id, ir), ...extra];
  const mismatches: Mismatch[] = [];
  let skipped = 0;
  for (const s of sequences) {
    let kmnOut: string;
    let fired: number[] = [];
    try {
      const sim = simulate(compiled, s.keys, { text: s.seed });
      kmnOut = sim.finalOutput.normalize("NFC");
      for (const step of sim.trace) {
        const fr = step.firedRule;
        const line = fr === undefined ? null : (lines.get(fr.group)?.[fr.ruleIndex] ?? null);
        if (line !== null) fired.push(line + lineOffset);
      }
    } catch {
      skipped += 1;
      continue;
    }
    const ldmlOut = ldml.type(toLdmlKeys(s.keys), s.seed);
    if (kmnOut === ldmlOut) continue;
    const byRule = fired.some((l) => lossyLines.has(l));
    const byOption = s.keys.some((k) => optionKeys.has(k.vkey.toUpperCase()));
    mismatches.push({
      excusedBy: byRule ? "rule" : byOption ? "option" : hasChain ? "chain" : null,
      excused: byRule || byOption || hasChain,
      keys: s.keys.map((k) => `${k.modifiers.join("+")}${k.caps ? "+caps" : ""} ${k.vkey}`).join(", "),
      seed: s.seed,
      kmn: kmnOut,
      ldml: ldmlOut,
    });
    fired = [];
  }
  return {
    total: sequences.length,
    skipped,
    mismatches,
    unexcused: mismatches.filter((m) => !m.excused),
    lossyItems,
    compileOk,
  };
}
