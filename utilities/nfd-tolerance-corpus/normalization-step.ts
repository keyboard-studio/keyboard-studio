// Verification of the spec 086 context normalization step, once per keyboard
// version. See specs/086-context-normalization-group/contracts/harness-verification-record.md.
//
// The step itself is derived statically by the engine; this module only
// SIMULATES it: compile the baseline and the stepped build, compare typed
// output over every single key and every pair whose second key some rule binds,
// probe each pasted alternate, and compare compile diagnostics. The outcome is
// a committed, freshness-checked record.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  createVirtualFS,
  type CompileResult,
  type KeyboardIR,
  type NormalizationMap,
  type NormalizationStep,
  type NormalizationStepResult,
  type SimKeyInput,
} from "@keyboard-studio/contracts";

import { emit } from "../../packages/engine/src/codec/emit.js";
import { compile } from "../../packages/engine/src/compiler/index.js";
import { stripDanglingAssetStores } from "../../packages/engine/src/compiler/stripDanglingAssetStores.js";
import {
  applyNormalizationStep,
  NORMALIZATION_GROUP,
  NORMALIZATION_STEP_GENERATOR_VERSION,
  NORMALIZATION_STORE_PREFIX,
  proposeNormalizationStep,
} from "../../packages/engine/src/pattern-apply/normalization-step/index.js";
import { simulate } from "../../packages/engine/src/simulator/node.js";
import {
  buildStoreCharIndex,
  resolveContextCandidates,
  splitRuleAtPlus,
  stripAssetStoresForCompile,
} from "../../packages/engine/src/validator/context-tolerance.js";

import { errorDiagnosticCount, prepare, simulable, type KmnInput } from "./analyze.js";
import { codepoints, resolveAllKeys } from "./probes.js";

export const RECORD_FORMAT = "context-normalization-verification/1";

export type Outcome = "verified" | "regressed" | "refused" | "harness-error";

/** One keyboard's entry in the committed record. */
export interface KeyboardRecord {
  sourceHash: string;
  outcome: Outcome;
  /** Refusal reason (`refused`) or a human-readable cause (`regressed`, `harness-error`). */
  reason?: string;
  detail?: string;
  ruleCount?: number;
  typed?: { sequences: number; differ: number };
  /** `exact`: same as the baseline's produced form; `nfcEqual`: equal up to NFC or to an ambiguous sibling. */
  pasted?: { probes: number; exact: number; nfcEqual: number; fail: number };
  compileDiagnostics?: { before: number; after: number };
}

export interface RecordManifest {
  format: typeof RECORD_FORMAT;
  corpusCommit: string;
  generatorVersion: string;
  generatedAt: string;
}

export interface VerificationRecord {
  manifest: RecordManifest;
  keyboards: Record<string, KeyboardRecord>;
}

export const GENERATOR_VERSION: string = NORMALIZATION_STEP_GENERATOR_VERSION;

// ---------------------------------------------------------------------------
// Record serialization and freshness
// ---------------------------------------------------------------------------

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) out[key] = sortKeys(child);
    }
    return out;
  }
  return value;
}

/** Deterministic text: every object's keys sorted, two-space indent, trailing newline. */
export function serializeRecord(record: VerificationRecord): string {
  return `${JSON.stringify(sortKeys(record), null, 2)}\n`;
}

export function parseRecord(text: string): VerificationRecord {
  const parsed = JSON.parse(text) as VerificationRecord;
  if (parsed.manifest?.format !== RECORD_FORMAT) {
    throw new Error(`not a ${RECORD_FORMAT} record`);
  }
  return parsed;
}

/** A record is fresh when its source hash and the generator version both match. */
export function isFresh(
  record: VerificationRecord | undefined,
  id: string,
  sourceHash: string,
  generatorVersion: string = GENERATOR_VERSION,
): boolean {
  const entry = record?.keyboards[id];
  return (
    record !== undefined &&
    entry !== undefined &&
    entry.sourceHash === sourceHash &&
    record.manifest.generatorVersion === generatorVersion
  );
}

/** Ids whose record is missing or stale, given each keyboard's current source hash. */
export function staleKeyboards(
  record: VerificationRecord | undefined,
  hashes: ReadonlyMap<string, string>,
  generatorVersion: string = GENERATOR_VERSION,
): string[] {
  const stale: string[] = [];
  for (const [id, hash] of hashes) {
    if (!isFresh(record, id, hash, generatorVersion)) stale.push(id);
  }
  return stale;
}

/** The comparison `--check` makes: manifest minus `generatedAt`, plus every keyboard. */
export function comparableForm(record: VerificationRecord): string {
  const { generatedAt: _ignored, ...manifest } = record.manifest;
  return serializeRecord({ manifest: manifest as RecordManifest, keyboards: record.keyboards });
}

/**
 * Merge new results over a previous record. Previous entries not re-simulated
 * are carried forward as the same objects, so they serialize byte-for-byte.
 * `generatedAt` only moves when something actually changed.
 */
export function mergeRecords(
  previous: VerificationRecord | undefined,
  fresh: Record<string, KeyboardRecord>,
  corpusCommit: string,
  now: () => string = () => new Date().toISOString(),
): VerificationRecord {
  const keyboards: Record<string, KeyboardRecord> = { ...(previous?.keyboards ?? {}), ...fresh };
  const candidate: VerificationRecord = {
    manifest: { format: RECORD_FORMAT, corpusCommit, generatorVersion: GENERATOR_VERSION, generatedAt: "" },
    keyboards,
  };
  if (previous !== undefined) {
    candidate.manifest.generatedAt = previous.manifest.generatedAt;
    if (comparableForm(candidate) === comparableForm(previous)) return previous;
  }
  candidate.manifest.generatedAt = now();
  return candidate;
}

// ---------------------------------------------------------------------------
// Source hash
// ---------------------------------------------------------------------------

/** sha256 over the `.kmn` bytes plus the touch layout's bytes when the keyboard declares one. */
export function sourceHashOf(kmn: Buffer | string, touchLayout?: Buffer | string): string {
  const hash = createHash("sha256");
  hash.update(kmn);
  if (touchLayout !== undefined) {
    hash.update("\0touch-layout\0");
    hash.update(touchLayout);
  }
  return hash.digest("hex");
}

/** Line endings differ between a checkout with and without autocrlf; the hash must not. */
function lfOnly(bytes: Buffer): Buffer {
  return Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"), "utf8");
}

/** Hash a corpus keyboard's source from disk (`.kmn` plus a declared touch layout), line-ending independent. */
export function hashKeyboardOnDisk(kmnAbsolutePath: string): string {
  const kmn = lfOnly(readFileSync(kmnAbsolutePath));
  const declared = /store\(&LAYOUTFILE\)\s*'([^']+)'/i.exec(kmn.toString("utf8"));
  if (declared?.[1] !== undefined) {
    const touchPath = join(dirname(kmnAbsolutePath), declared[1]);
    if (existsSync(touchPath)) return sourceHashOf(kmn, lfOnly(readFileSync(touchPath)));
  }
  return sourceHashOf(kmn);
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

const VKEYS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("").map((c) => `K_${c}`),
  "K_BKQUOTE", "K_HYPHEN", "K_EQUAL", "K_LBRKT", "K_RBRKT", "K_BKSLASH",
  "K_COLON", "K_QUOTE", "K_COMMA", "K_PERIOD", "K_SLASH",
];
const MODIFIER_STATES: SimKeyInput["modifiers"][] = [[], ["shift"], ["ralt"], ["shift", "ralt"]];

/** 47 keys x {none, shift, ralt, shift+ralt}. */
export const ALL_KEYS: readonly SimKeyInput[] = VKEYS.flatMap((vkey) =>
  MODIFIER_STATES.map((modifiers) => ({ vkey, modifiers })),
);

const BACKSPACE: SimKeyInput = { vkey: "K_BKSP", modifiers: [] };
const CONTROL_KEY: SimKeyInput = { vkey: "K_ENTER", modifiers: [] };

function keyId(key: SimKeyInput): string {
  return `${key.vkey}[${[...key.modifiers].sort().join("+")}]`;
}

const GRID_IDS = new Set(ALL_KEYS.map(keyId));

/** Every grid key some rule's key part can stand for: the second keys worth pairing. */
export function boundKeys(ir: KeyboardIR): SimKeyInput[] {
  const storeChars = buildStoreCharIndex(ir);
  const found = new Map<string, SimKeyInput>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const split = splitRuleAtPlus(rule);
      if (split === undefined) continue;
      for (const key of resolveAllKeys(split.keyPart, storeChars)) {
        const id = keyId({ vkey: key.vkey, modifiers: key.modifiers });
        if (GRID_IDS.has(id)) found.set(id, { vkey: key.vkey, modifiers: key.modifiers });
      }
    }
  }
  return ALL_KEYS.filter((k) => found.has(keyId(k)));
}

/** The baseline's rules, indexed by the characters their preceding context can end in. */
export type ActingIndex = Map<string, Map<string, SimKeyInput>>;

/** Index once per keyboard: which keys act on a context ending in each character. */
export function buildActingIndex(ir: KeyboardIR): ActingIndex {
  const storeChars = buildStoreCharIndex(ir);
  const index: ActingIndex = new Map();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const split = splitRuleAtPlus(rule);
      if (split === undefined || split.before.length === 0) continue;
      const candidates = resolveContextCandidates(split.before[split.before.length - 1]!, storeChars);
      if ("reason" in candidates) continue;
      const keys = resolveAllKeys(split.keyPart, storeChars);
      if (keys.length === 0) continue;
      for (const char of candidates.chars) {
        let bucket = index.get(char);
        if (bucket === undefined) index.set(char, (bucket = new Map()));
        for (const key of keys) bucket.set(keyId(key), key);
      }
    }
  }
  return index;
}

/**
 * Keys that act on cluster `c` in the baseline: the key part of every rule
 * whose preceding context ends in `c` (or in its last code point), plus
 * backspace and one control key.
 */
export function actingKeys(index: ActingIndex, cluster: string): SimKeyInput[] {
  const found = new Map<string, SimKeyInput>();
  const last = [...cluster].at(-1);
  for (const char of new Set([cluster, last])) {
    if (char === undefined) continue;
    for (const [id, key] of index.get(char) ?? []) found.set(id, key);
  }
  for (const key of [BACKSPACE, CONTROL_KEY]) found.set(keyId(key), key);
  return [...found.values()];
}

function run(compiled: CompileResult, keys: SimKeyInput[], text = ""): string {
  try {
    return simulate(compiled, keys, { text }).finalOutput;
  } catch (err) {
    return `!error:${err instanceof Error ? err.message : String(err)}`;
  }
}

function diagnosticsOf(result: CompileResult): string[] {
  return result.diagnostics
    .filter((d) => d.severity === "error" || d.severity === "fatal")
    .map((d) => `${d.severity}:${d.message}`)
    .sort();
}

function compileText(id: string, kmn: string): Promise<CompileResult> {
  return compile(createVirtualFS([{ path: `source/${id}.kmn`, content: kmn, isBinary: false }]), id);
}

/**
 * Inject the step into the author's own source text: redirect `begin`, then
 * append the generated stores and group. Used only when re-emitting the whole
 * IR yields an unsimulable build (the codec hoists global opaque stores above
 * the stores they reference, which kmcmplib rejects).
 */
function injectStep(sourceText: string, steppedIr: KeyboardIR): string {
  const emitted = emit(steppedIr).split("\n");
  const groupAt = emitted.findIndex((l) => l.startsWith(`group(${NORMALIZATION_GROUP})`));
  if (groupAt < 0) throw new Error("emitted source has no generated group");
  const groupText = emitted.slice(groupAt);
  const stores = [...new Set(emitted.filter((l) => l.startsWith(`store(${NORMALIZATION_STORE_PREFIX}`)))].filter(
    (l) => !groupText.includes(l),
  );
  const begin = /^(\s*begin\s+\w+\s*>\s*use\()([^)]*)(\))/im;
  if (!begin.test(sourceText)) throw new Error("source has no begin statement");
  const redirected = sourceText.replace(begin, (_m, a: string, _b: string, c: string) => `${a}${NORMALIZATION_GROUP}${c}`);
  return `${redirected.trimEnd()}\n\n${stores.join("\n")}\n\n${groupText.join("\n")}\n`;
}

/**
 * Per-keyboard wall-clock cap. A faithful run of even the largest corpus
 * keyboard's full 35,532-sequence grid takes about 90 s; a keyboard past this
 * cap is recorded `harness-error` rather than stalling a whole corpus run.
 */
export const DEFAULT_VERIFY_BUDGET_MS = 10 * 60 * 1000;

/** Collaborators the verification calls, injectable so tests can force each outcome. */
export interface VerifyDeps {
  propose: (ir: KeyboardIR) => Promise<NormalizationStepResult>;
  apply: (ir: KeyboardIR, step: NormalizationStep) => KeyboardIR;
  compileText: (id: string, kmn: string) => Promise<CompileResult>;
}

export const DEFAULT_DEPS: VerifyDeps = {
  // A generous budget: the corpus run must not turn a slow machine into a
  // spurious refusal (time-bound refusals are not cacheable, the record is).
  propose: (ir) => proposeNormalizationStep(ir, { budgetMs: 300_000 }),
  apply: applyNormalizationStep,
  compileText,
};

/** In-group asset stores the header-only strip cannot reach: blank them, keeping line numbers. */
function blankInGroupAssetStores(text: string): string {
  return text.replace(/^[ \t]*store\(&(?:LAYOUTFILE|VISUALKEYBOARD|BITMAP|KMW_HELPFILE|KMW_EMBEDJS)\).*$/gim, "c");
}

/** Typed check: every single key, then every (k1, k2) with k2 bound by some rule. */
function typedCheck(
  base: CompileResult,
  stepped: CompileResult,
  secondKeys: readonly SimKeyInput[],
  checkBudget: () => void,
): { sequences: number; differ: number } {
  let sequences = 0;
  let differ = 0;
  for (const k1 of ALL_KEYS) {
    checkBudget();
    sequences += 1;
    if (run(base, [k1]) !== run(stepped, [k1])) differ += 1;
    for (const k2 of secondKeys) {
      sequences += 1;
      if (run(base, [k1, k2]) !== run(stepped, [k1, k2])) differ += 1;
    }
  }
  return { sequences, differ };
}

/** Pasted check: each alternate, seeded in the stepped build, must act like its produced cluster did. */
function pastedCheck(
  ir: KeyboardIR,
  base: CompileResult,
  stepped: CompileResult,
  maps: readonly NormalizationMap[],
  checkBudget: () => void,
): { counts: { probes: number; exact: number; nfcEqual: number; fail: number }; samples: string[] } {
  const counts = { probes: 0, exact: 0, nfcEqual: 0, fail: 0 };
  const samples: string[] = [];
  const index = buildActingIndex(ir);
  for (const map of maps) {
    checkBudget();
    for (const key of actingKeys(index, map.to)) {
      counts.probes += 1;
      const got = run(stepped, [key], map.from);
      const want = run(base, [key], map.to);
      if (got === want) {
        counts.exact += 1;
        continue;
      }
      const siblings = (map.ambiguous ?? []).map((to) => run(base, [key], to));
      if (got.normalize("NFC") === want.normalize("NFC") || siblings.includes(got)) counts.nfcEqual += 1;
      else {
        counts.fail += 1;
        if (samples.length < 3) {
          samples.push(`${codepoints(map.from)} + ${key.vkey}: got ${codepoints(got)}, wanted ${codepoints(want)}`);
        }
      }
    }
  }
  return { counts, samples };
}

/** Verify one keyboard end to end. Never throws: a failure becomes `harness-error`. */
export async function verifyKeyboard(
  input: KmnInput,
  sourceHash: string,
  deps: VerifyDeps = DEFAULT_DEPS,
  budgetMs: number = DEFAULT_VERIFY_BUDGET_MS,
): Promise<KeyboardRecord> {
  const deadline = Date.now() + budgetMs;
  const checkBudget = (): void => {
    if (Date.now() > deadline) {
      throw new Error(`verification exceeded its ${Math.round(budgetMs / 60000)}-minute budget`);
    }
  };
  try {
    const blanked = blankInGroupAssetStores(input.text);
    const { ir } = prepare(blanked, input.id);

    const proposal = await deps.propose(ir);
    if (proposal.kind === "refused") {
      return { sourceHash, outcome: "refused", reason: proposal.reason };
    }
    const { step, maps } = proposal;
    const stepped = deps.apply(ir, step);

    const emitBuild = (k: KeyboardIR): Promise<CompileResult> =>
      deps.compileText(input.id, emit(stripAssetStoresForCompile(k)));
    let baseBuild = await emitBuild(ir);
    let stepBuild = await emitBuild(stepped);
    if (!simulable(baseBuild, { allowCompileErrors: true }) || !simulable(stepBuild, { allowCompileErrors: true })) {
      const baseText = stripDanglingAssetStores(blanked, createVirtualFS([])).kmn;
      baseBuild = await deps.compileText(input.id, baseText);
      stepBuild = await deps.compileText(input.id, injectStep(baseText, stepped));
    }
    const compileDiagnostics = { before: errorDiagnosticCount(baseBuild), after: errorDiagnosticCount(stepBuild) };
    const base: KeyboardRecord = { sourceHash, outcome: "harness-error", ruleCount: step.ruleCount, compileDiagnostics };
    if (!simulable(baseBuild, { allowCompileErrors: true }) || !simulable(stepBuild, { allowCompileErrors: true })) {
      return { ...base, detail: "a build emitted no KeymanWeb JS" };
    }

    const typed = typedCheck(baseBuild, stepBuild, boundKeys(ir), checkBudget);
    const { counts: pasted, samples } = pastedCheck(ir, baseBuild, stepBuild, maps, checkBudget);
    const sameDiagnostics = diagnosticsOf(baseBuild).join("\n") === diagnosticsOf(stepBuild).join("\n");

    const problems: string[] = [];
    if (typed.differ > 0) problems.push(`${typed.differ} typed sequence(s) differ`);
    if (!sameDiagnostics) problems.push("compile diagnostics differ");
    if (pasted.fail > 0) {
      problems.push(
        `${pasted.fail} pasted probe(s) fail${typed.differ === 0 && sameDiagnostics ? " (typed output identical)" : ""}`,
      );
    }
    const checked = { ...base, typed, pasted };
    return problems.length === 0
      ? { ...checked, outcome: "verified" }
      : {
          ...checked,
          outcome: "regressed",
          reason: problems.join("; "),
          ...(samples.length > 0 ? { detail: `first failing pasted probes: ${samples.join(" | ")}` } : {}),
        };
  } catch (err) {
    return { sourceHash, outcome: "harness-error", detail: err instanceof Error ? err.message : String(err) };
  }
}
