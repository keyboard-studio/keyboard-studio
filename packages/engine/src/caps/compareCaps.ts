// Caps comparison (spec 112, research R5): does replacing a keyboard's CAPS
// rules with `&CasedKeys` change what any key types? Compiles both texts the
// way the context-tolerance simulation does (the same compiler path, run on
// demand outside the 300 ms validation cycle) and simulates each key on each
// used modifier plane under {none, Shift, Caps, Shift+Caps}.

import { caseCounterpart, isCapsModifier, type IRRule, type KeyboardIR, type SimKeyInput } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { compile } from "../compiler/index.js";
import { simulate } from "../simulator/index.js";
import {
  buildStoreCharIndex,
  buildToleranceCompileVfs,
  hasSimulatableJs,
  resolveKeyPart,
  splitRuleAtPlus,
} from "../validator/context-tolerance.js";

export interface CapsOutputs {
  none: string;
  shift: string;
  caps: string;
  shiftCaps: string;
}

export type CapsVerdict = "identical" | "gains-uppercase" | "differs";

export interface CapsRow {
  vkey: string;
  /** Modifier plane, lowercase and `+`-joined; `base` when none. */
  plane: string;
  /** The deadkey the key was pressed after, when the row is a deadkey follow-up. */
  afterDeadkey?: string;
  before: CapsOutputs;
  after: CapsOutputs;
  verdict: CapsVerdict;
}

export interface CapsComparison {
  rows: CapsRow[];
  verdict: CapsVerdict;
  /** Rows that block the offer. */
  differs: CapsRow[];
  /** Set when a text failed to compile; the verdict is then `differs`. */
  error?: string;
}

type SimMod = SimKeyInput["modifiers"][number];
const MOD_MAP: Record<string, SimMod> = {
  SHIFT: "shift", CTRL: "ctrl", ALT: "alt", LCTRL: "lctrl", RCTRL: "rctrl", LALT: "lalt", RALT: "ralt",
};

/** Keys that test CAPS/NCAPS, and the planes (non-caps, non-shift modifiers) each key is used on. */
function scanKeys(ir: KeyboardIR, into: { caps: Set<string>; planes: Map<string, Set<string>> }): void {
  for (const g of ir.groups) {
    for (const rule of g.rules) {
      for (const el of rule.context) {
        if (el.kind !== "vkey") continue;
        const planeMods = el.modifiers
          .filter((m) => !isCapsModifier(m) && m !== "SHIFT")
          .map((m) => m.toUpperCase())
          .sort();
        let set = into.planes.get(el.name);
        if (set === undefined) into.planes.set(el.name, (set = new Set()));
        set.add(planeMods.join("+"));
        if (el.modifiers.some(isCapsModifier)) into.caps.add(el.name);
      }
    }
  }
}

function planeInput(plane: string): SimMod[] | null {
  if (plane === "") return [];
  const out: SimMod[] = [];
  for (const m of plane.split("+")) {
    const mapped = MOD_MAP[m];
    if (mapped === undefined) return null;
    out.push(mapped);
  }
  return out;
}

function deadkeyId(el: { kind: string }): string | undefined {
  const e = el as { kind: string; id?: number; name?: string };
  if (e.kind === "deadkey") return `dk:${e.id}`;
  if (e.kind === "namedDeadkey") return `dk:${e.name}`;
  return undefined;
}

function ruleKeys(rule: IRRule): string[] {
  return rule.context.flatMap((el) => (el.kind === "vkey" ? [el.name] : []));
}

/** deadkey -> the single key press that produces it (first simple `+ [key] > ... dk` rule), when one exists. */
function deadkeyTriggers(ir: KeyboardIR): Map<string, SimKeyInput> {
  const storeChars = buildStoreCharIndex(ir);
  const out = new Map<string, SimKeyInput>();
  for (const g of ir.groups) {
    for (const rule of g.rules) {
      const split = splitRuleAtPlus(rule);
      if (split === undefined || split.before.length > 0) continue;
      for (const o of rule.output) {
        const id = deadkeyId(o);
        if (id === undefined || out.has(id)) continue;
        const r = resolveKeyPart(split.keyPart, storeChars);
        if ("key" in r) out.set(id, r.key);
      }
    }
  }
  return out;
}

/** Deadkeys that appear in the context of a rule whose key is in `keys`. */
function deadkeysReaching(ir: KeyboardIR, keys: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const g of ir.groups) {
    for (const rule of g.rules) {
      if (!ruleKeys(rule).some((k) => keys.has(k))) continue;
      for (const el of rule.context) {
        const id = deadkeyId(el);
        if (id !== undefined) out.add(id);
      }
    }
  }
  return out;
}

function counterpartOf(s: string, bcp47: string | undefined): string | null {
  return caseCounterpart(s, bcp47)?.counterpart ?? null;
}

function rowVerdict(before: CapsOutputs, after: CapsOutputs, bcp47: string | undefined): CapsVerdict {
  if (
    before.none === after.none && before.shift === after.shift &&
    before.caps === after.caps && before.shiftCaps === after.shiftCaps
  ) {
    return "identical";
  }
  if (before.none !== after.none || before.shift !== after.shift) return "differs";
  const capsOk = before.caps === after.caps || after.caps === counterpartOf(after.none, bcp47);
  const shiftCapsOk = before.shiftCaps === after.shiftCaps || after.shiftCaps === counterpartOf(after.shift, bcp47);
  return capsOk && shiftCapsOk ? "gains-uppercase" : "differs";
}

type Compiled = Parameters<typeof simulate>[0];

function press(compiled: Compiled, prefix: readonly SimKeyInput[], vkey: string, mods: SimMod[], caps: boolean): string {
  return simulate(compiled, [...prefix, { vkey, modifiers: mods, ...(caps ? { caps: true } : {}) }]).finalOutput;
}

function outputs(compiled: Compiled, prefix: readonly SimKeyInput[], vkey: string, plane: SimMod[]): CapsOutputs {
  const shifted: SimMod[] = [...plane, "shift"];
  return {
    none: press(compiled, prefix, vkey, plane, false),
    shift: press(compiled, prefix, vkey, shifted, false),
    caps: press(compiled, prefix, vkey, plane, true),
    shiftCaps: press(compiled, prefix, vkey, shifted, true),
  };
}

async function compileIr(ir: KeyboardIR): Promise<Compiled | undefined> {
  const result = await compile(buildToleranceCompileVfs(ir), ir.header.keyboardId);
  return hasSimulatableJs(result) ? result : undefined;
}

export async function compareCapsBehaviour(
  beforeKmn: string,
  afterKmn: string,
  keys: readonly string[],
  opts: { bcp47?: string } = {},
): Promise<CapsComparison> {
  const fail = (error: string): CapsComparison => ({ rows: [], verdict: "differs", differs: [], error });
  const beforeIr = parse(beforeKmn, "caps_compare").ir;
  const afterIr = parse(afterKmn, "caps_compare").ir;
  const beforeC = await compileIr(beforeIr);
  if (beforeC === undefined) return fail("the keyboard before the change failed to compile");
  const afterC = await compileIr(afterIr);
  if (afterC === undefined) return fail("the keyboard after the change failed to compile");

  // A key that is not in the set and whose rules never test caps is untouched by the change.
  const scan = { caps: new Set<string>(), planes: new Map<string, Set<string>>() };
  scanKeys(beforeIr, scan);
  scanKeys(afterIr, scan);
  const toCheck = [...new Set([...keys, ...scan.caps])].sort();

  const triggers = deadkeyTriggers(beforeIr);
  const reaching = deadkeysReaching(beforeIr, new Set(toCheck));
  const dkVariants: { prefix: SimKeyInput[]; dk?: string }[] = [{ prefix: [] }];
  for (const dk of reaching) {
    const trig = triggers.get(dk);
    if (trig !== undefined) dkVariants.push({ prefix: [trig], dk });
  }

  const rows: CapsRow[] = [];
  for (const vkey of toCheck) {
    const planes = new Set<string>(["", ...(scan.planes.get(vkey) ?? [])]);
    for (const plane of [...planes].sort()) {
      const mods = planeInput(plane);
      if (mods === null) continue;
      for (const v of dkVariants) {
        let before: CapsOutputs;
        let after: CapsOutputs;
        try {
          before = outputs(beforeC, v.prefix, vkey, mods);
          after = outputs(afterC, v.prefix, vkey, mods);
        } catch {
          continue; // a key the desktop simulator cannot press
        }
        rows.push({
          vkey,
          plane: plane === "" ? "base" : plane.toLowerCase(),
          ...(v.dk !== undefined ? { afterDeadkey: v.dk } : {}),
          before,
          after,
          verdict: rowVerdict(before, after, opts.bcp47),
        });
      }
    }
  }

  const differs = rows.filter((r) => r.verdict === "differs");
  const verdict: CapsVerdict =
    differs.length > 0 ? "differs" : rows.some((r) => r.verdict === "gains-uppercase") ? "gains-uppercase" : "identical";
  return { rows, verdict, differs };
}
