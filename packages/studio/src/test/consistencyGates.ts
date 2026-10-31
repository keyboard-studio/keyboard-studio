// checkConsistencyGates -- the G1-G8 consistency gates (spec 106 FR-030,
// contracts/consistency-gates.md). One pure checker shared by the decision-point
// fixtures and the walk harness: it reads a projected VFS plus the compile
// diagnostics and the decisions the VFS was projected from, and reports each
// gate as applicable / pass / detail.
//
// Pure apart from the context-tolerance analysis (G2), which compiles and
// simulates, so the checker is async.

import type {
  CompilerDiagnostic,
  IRRule,
  KeyboardIR,
  OutputElement,
  StoreItem,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { parseKmn, confirmedCaseCounterpart, normalizationFormForOutputForm } from "@keyboard-studio/engine";
import { computeContextTolerance } from "@keyboard-studio/engine/context-tolerance";
import { lintContextTolerance } from "@keymanapp/keyboard-lint";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import type { MarksTreatmentValue } from "../survey/marks/marksValue.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { findTouchLayoutPath } from "../lib/findTouchLayoutPath.ts";
import { DECISION_POINTS, type DecisionPoint } from "./decisionPointBases.ts";

export type GateId = "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8" | "G8-start";

export interface GateResult {
  gate: GateId;
  /** False when the gate does not apply at this point (or to this input). */
  applicable: boolean;
  pass: boolean;
  detail: string[];
}

export interface GateInput {
  /** The projected package (source/<id>.kmn et al). */
  vfs: VirtualFS;
  keyboardId: string;
  compileDiagnostics: readonly CompilerDiagnostic[];
  /** The decisions the VFS was projected from, already cut at `point`. */
  decisions: DecisionSet;
  point: DecisionPoint;
  /**
   * The starting keyboard's IR. Rules and stores that appear in it unchanged
   * are "starting" content: G4 reports them without failing, and G8 splits its
   * verdict into generated (enforced) and starting (known gap) stores.
   */
  startIr?: KeyboardIR;
  /** A second projection of the same inputs, for G7. */
  repeatVfs?: VirtualFS;
  /** G6 reads the touch layout; fixtures do not reproduce the touch step, so it is opt-in. */
  includeTouch?: boolean;
}

// Both spellings: the raw kmcmplib code and the curated validator name.
const UNREACHABLE_CODES = new Set(["KM_HINT_KMCMP_3154094", "KM_HINT_UNREACHABLE_RULE"]);
const NOT_TOLERANT = "KM_WARN_CONTEXT_NOT_TOLERANT";
const GUARD_GROUP = "generated_marks_guard";

const pointIndex = (p: DecisionPoint): number => DECISION_POINTS.indexOf(p);
const atOrAfter = (p: DecisionPoint, from: DecisionPoint): boolean => pointIndex(p) >= pointIndex(from);

function notApplicable(gate: GateId, why: string): GateResult {
  return { gate, applicable: false, pass: true, detail: [why] };
}

function result(gate: GateId, problems: string[]): GateResult {
  return { gate, applicable: true, pass: problems.length === 0, detail: problems };
}

// ---------------------------------------------------------------------------
// Decision readers
// ---------------------------------------------------------------------------

function marksValue(decisions: DecisionSet): MarksTreatmentValue | undefined {
  return decisions["marks-treatment"]?.value as MarksTreatmentValue | undefined;
}

function confirmedChars(decisions: DecisionSet): string[] {
  const v = decisions["character-inventory"]?.value as { chars?: string[] } | undefined;
  return v?.chars ?? [];
}

// ---------------------------------------------------------------------------
// IR helpers
// ---------------------------------------------------------------------------

function parseProjected(vfs: VirtualFS, keyboardId: string): KeyboardIR | undefined {
  const text = readVfsText(vfs, `source/${keyboardId}.kmn`);
  return text === undefined ? undefined : parseKmn(text, keyboardId).ir;
}

const ruleKey = (r: IRRule): string => JSON.stringify([r.context, r.output, r.matchKind ?? null]);
const storeKey = (name: string, items: readonly StoreItem[]): string => JSON.stringify([name, items]);

/** Fingerprints of the rules and stores the starting keyboard already had. */
function startFingerprints(startIr: KeyboardIR | undefined): {
  rules: Set<string>;
  stores: Set<string>;
  /** Per same-named starting store, the items it already held (a carve may have trimmed the store since). */
  storeItems: Map<string, StoreItem[]>;
} {
  const storeItems = new Map<string, StoreItem[]>();
  for (const s of startIr?.stores ?? []) storeItems.set(s.name, [...s.items]);
  const rules = new Set<string>();
  const stores = new Set<string>();
  for (const g of startIr?.groups ?? []) for (const r of g.rules) rules.add(ruleKey(r));
  for (const s of startIr?.stores ?? []) stores.add(storeKey(s.name, s.items));
  return { rules, stores, storeItems };
}

/** The literal text each maximal run of `char` output elements spells. */
function outputRuns(output: readonly OutputElement[]): string[] {
  const runs: string[] = [];
  let cur = "";
  for (const el of output) {
    if (el.kind === "char") {
      cur += el.value;
    } else if (cur !== "") {
      runs.push(cur);
      cur = "";
    }
  }
  if (cur !== "") runs.push(cur);
  return runs;
}

const show = (s: string): string =>
  [...s].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ");

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

function g1(input: GateInput): GateResult {
  if (!atOrAfter(input.point, "assignments")) return notApplicable("G1", "applies at assignments and later");
  const hits = input.compileDiagnostics.filter((d) => UNREACHABLE_CODES.has(d.code));
  if (hits.length === 0) return result("G1", []);
  const lines = (readVfsText(input.vfs, `source/${input.keyboardId}.kmn`) ?? "").split(/\r?\n/);
  const where = [...new Set(hits.map((d) => d.location?.line))]
    .map((n) => (n === undefined ? "?" : `${n}: ${lines[n - 1]?.trim() ?? ""}`));
  return result("G1", [`${hits.length} unreachable-rule hint(s)`, ...where]);
}

async function g2(input: GateInput, ir: KeyboardIR | undefined): Promise<GateResult> {
  if (input.point !== "tolerance") return notApplicable("G2", "applies at tolerance");
  if (ir === undefined) return result("G2", ["projected .kmn missing"]);
  let findings;
  try {
    findings = lintContextTolerance(ir, await computeContextTolerance(ir)).filter((f) => f.code === NOT_TOLERANT);
  } catch (err) {
    // The analysis is part of the gate: a keyboard it cannot analyse is not tolerant.
    return result("G2", [`context-tolerance analysis threw: ${err instanceof Error ? err.message : String(err)}`]);
  }
  return result("G2", findings.length === 0 ? [] : [`${findings.length} context-not-tolerant warning(s)`]);
}

function g3(input: GateInput, ir: KeyboardIR | undefined): GateResult {
  const marks = marksValue(input.decisions);
  if (marks?.completion === undefined || marks.completion === null) {
    return notApplicable("G3", "no completed marks-treatment decision");
  }
  if (ir === undefined) return result("G3", ["projected .kmn missing"]);
  // Every mark with a recorded attachment row blocks the contexts outside its
  // allowed set (digits, punctuation, buffer start), so any mark at all needs
  // the guard, not only a mark with an unticked base.
  const markRows = Object.keys(marks.answers).filter((k) => k.startsWith("marks.marks_attachment."));
  const { blockedCombinations, markUnits } = marks.completion.worklist;
  const needed = blockedCombinations.length > 0 || markUnits.length > 0 || markRows.length > 0;
  const present = ir.groups.some((g) => g.name === GUARD_GROUP);
  if (needed === present) return result("G3", []);
  return result("G3", [
    needed
      ? `the marks decision blocks contexts but the projected keyboard has no ${GUARD_GROUP} group`
      : `${GUARD_GROUP} is present but the marks decision blocks nothing`,
  ]);
}

function g4(input: GateInput, ir: KeyboardIR | undefined): GateResult {
  if (!atOrAfter(input.point, "assignments")) return notApplicable("G4", "applies at assignments and later");
  if (ir === undefined) return result("G4", ["projected .kmn missing"]);
  const outputForm = marksValue(input.decisions)?.completion?.outputForm;
  const form = normalizationFormForOutputForm(outputForm);
  const start = startFingerprints(input.startIr);
  const problems: string[] = [];
  const keptStarting: string[] = [];
  const check = (where: string, text: string, starting: boolean): void => {
    if (text === text.normalize(form)) return;
    (starting ? keptStarting : problems).push(`${where}: ${show(text)} is not ${form}`);
  };
  for (const g of ir.groups) {
    for (const r of g.rules) {
      const starting = start.rules.has(ruleKey(r));
      for (const run of outputRuns(r.output)) check(`${g.name} rule ${r.nodeId}`, run, starting);
    }
  }
  for (const s of ir.stores) {
    if (s.isSystem) continue;
    const wholeStore = start.stores.has(storeKey(s.name, s.items));
    // Per item: a carve trims a starting store without making what is left generated.
    const startHeld = new Set((start.storeItems.get(s.name) ?? []).map((i) => JSON.stringify(i)));
    for (const item of s.items) {
      if (item.kind === "char") check(`store ${s.name}`, item.value, wholeStore || startHeld.has(JSON.stringify(item)));
    }
  }
  const out = result("G4", problems);
  if (keptStarting.length > 0) out.detail.push(`${keptStarting.length} starting item(s) kept by carve, not failed`);
  return out;
}

/** Expand `[K_A]..[K_Z]` and `[K_0]..[K_9]` ranges (the only ones CasedKeys uses) into key names. */
function casedKeyNames(items: readonly StoreItem[]): Set<string> {
  const names = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.kind !== "vkey") continue;
    const next = items[i + 1];
    const end = items[i + 2];
    if (next?.kind === "raw" && next.text === ".." && end?.kind === "vkey") {
      const a = it.name.slice(2);
      const b = end.name.slice(2);
      if (a.length === 1 && b.length === 1) {
        for (let c = a.charCodeAt(0); c <= b.charCodeAt(0); c++) names.add(`K_${String.fromCharCode(c)}`);
      }
      i += 2;
    } else {
      names.add(it.name);
    }
  }
  return names;
}

function g5(input: GateInput, ir: KeyboardIR | undefined): GateResult {
  if (!atOrAfter(input.point, "caps")) return notApplicable("G5", "applies at caps and later");
  if (ir === undefined) return result("G5", ["projected .kmn missing"]);
  const alphabet = new Set(confirmedChars(input.decisions));
  const cased = [...alphabet].some((c) => confirmedCaseCounterpart(c, alphabet) !== null);
  const store = ir.stores.find((s) => s.isSystem && s.name.toLowerCase() === "casedkeys");
  if (!cased) {
    return result("G5", store === undefined ? [] : ["&CasedKeys is present but the alphabet has no case pair"]);
  }
  if (store === undefined) return result("G5", ["the alphabet is cased but &CasedKeys is absent"]);

  // Every assigned key, on every modifier plane, whose plain and SHIFT outputs
  // form a case pair (FR-052: the layout-family list is the floor, not the ceiling).
  const planeKey = (name: string, mods: readonly string[]): string => `${name}|${[...mods].sort().join("+")}`;
  const byPlane = new Map<string, string>();
  for (const g of ir.groups) {
    for (const r of g.rules) {
      const [only, ...rest] = r.context;
      if (only?.kind !== "vkey" || rest.length > 0) continue;
      if (r.output.length === 0 || r.output.some((e) => e.kind !== "char")) continue;
      const key = planeKey(only.name, only.modifiers);
      if (!byPlane.has(key)) byPlane.set(key, outputRuns(r.output)[0]!);
    }
  }
  const covered = casedKeyNames(store.items);
  const missing: string[] = [];
  for (const [k, lower] of byPlane) {
    const [name, plane] = k.split("|") as [string, string];
    const mods = plane === "" ? [] : plane.split("+");
    if (mods.includes("SHIFT")) continue;
    const upper = byPlane.get(planeKey(name, [...mods, "SHIFT"]));
    if (upper === undefined) continue;
    const pair = confirmedCaseCounterpart(lower, alphabet, undefined, "toUpper");
    if (pair?.counterpart === upper && !covered.has(name)) {
      missing.push(`${name}${plane === "" ? "" : ` ${plane}`} (${lower}/${upper})`);
    }
  }
  return result("G5", missing.length === 0 ? [] : [`&CasedKeys misses cased key(s): ${missing.join(", ")}`]);
}

type TouchLayoutJson = Record<string, { layer?: { id: string; row?: { key?: { text?: string }[] }[] }[] }>;

function g6(input: GateInput): GateResult {
  if (input.includeTouch !== true) return notApplicable("G6", "walk-only: the fixtures do not reproduce the touch step");
  if (!atOrAfter(input.point, "assignments")) return notApplicable("G6", "applies at assignments and later");
  const path = findTouchLayoutPath(input.vfs);
  const text = path === undefined ? undefined : readVfsText(input.vfs, path);
  if (text === undefined) return notApplicable("G6", "no touch layout in the projected package");

  const alphabet = new Set(confirmedChars(input.decisions));
  // An uppercase letter with its lowercase partner in the alphabet lives on the
  // shift layer; the default layer owes the lowercase one.
  const owed = [...alphabet].filter((c) => {
    if (!/^\p{L}$/u.test(c)) return false;
    const pair = confirmedCaseCounterpart(c, alphabet);
    return !(pair !== null && pair.direction === "toLower");
  });
  const layout = JSON.parse(text) as TouchLayoutJson;
  const problems: string[] = [];
  for (const [platform, def] of Object.entries(layout)) {
    const layer = def.layer?.find((l) => l.id === "default");
    if (layer === undefined) continue;
    const present = new Set(
      (layer.row ?? []).flatMap((r) => (r.key ?? []).map((k) => (k.text ?? "").normalize("NFC"))),
    );
    const missing = owed.filter((c) => !present.has(c.normalize("NFC")));
    if (missing.length > 0) problems.push(`${platform} default layer lacks: ${missing.join(" ")}`);
  }
  return result("G6", problems);
}

function g7(input: GateInput): GateResult {
  if (input.repeatVfs === undefined) return notApplicable("G7", "no second projection supplied");
  const a = input.vfs;
  const b = input.repeatVfs;
  // `build/` holds compiled artifacts, staged on the download path only.
  const paths = (v: VirtualFS): string[] => v.list().filter((p) => !p.startsWith("build/")).sort();
  const problems: string[] = [];
  for (const p of new Set([...paths(a), ...paths(b)])) {
    const ea = a.get(p);
    const eb = b.get(p);
    if (ea === undefined || eb === undefined) {
      problems.push(`${p}: present in only one projection`);
      continue;
    }
    const same =
      typeof ea.content === "string" || typeof eb.content === "string"
        ? ea.content === eb.content
        : Buffer.compare(Buffer.from(ea.content), Buffer.from(eb.content)) === 0;
    if (!same) problems.push(`${p}: differs between projections`);
  }
  return result("G7", problems);
}

const isIllegalStoreItem = (item: StoreItem): boolean =>
  item.kind === "raw" && (item.text.trim() === "nul" || item.text.trim() === "beep");

/** G8 for generated stores (enforced) and starting stores (known gap, keymanapp/keyboards#4181). */
function g8(input: GateInput, ir: KeyboardIR | undefined): [GateResult, GateResult] {
  if (ir === undefined) return [result("G8", ["projected .kmn missing"]), result("G8-start", [])];
  const start = startFingerprints(input.startIr);
  const generated: string[] = [];
  const starting: string[] = [];
  for (const s of ir.stores) {
    if (s.isSystem) continue;
    const n = s.items.filter(isIllegalStoreItem).length;
    if (n === 0) continue;
    // Per item: the same-named starting store's nul/beep items are starting, any beyond that count are generated.
    const held = start.stores.has(storeKey(s.name, s.items))
      ? n
      : Math.min(n, (start.storeItems.get(s.name) ?? []).filter(isIllegalStoreItem).length);
    if (held > 0) starting.push(`store ${s.name}: ${held} nul/beep item(s)`);
    if (n - held > 0) generated.push(`store ${s.name}: ${n - held} nul/beep item(s)`);
  }
  return [result("G8", generated), result("G8-start", starting)];
}

export async function checkConsistencyGates(input: GateInput): Promise<GateResult[]> {
  const ir = parseProjected(input.vfs, input.keyboardId);
  const [r8, r8s] = g8(input, ir);
  return [
    g1(input),
    await g2(input, ir),
    g3(input, ir),
    g4(input, ir),
    g5(input, ir),
    g6(input),
    g7(input),
    r8,
    r8s,
  ];
}
