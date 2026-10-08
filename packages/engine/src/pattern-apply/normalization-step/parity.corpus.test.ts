// Spike parity for the context normalization step (spec 086, SC-001..SC-004).
//
// For each of the seven spike keyboards in the sibling `../keyboards` checkout
// this compiles the baseline and the stepped build, then checks:
//   SC-001  typed output is byte-identical over every one- and two-key
//           sequence of the full key set (47 keys x 4 modifier states = 35,532)
//   SC-002  pasted alternates behave exactly like the produced form, including
//           backspace deleting the whole letter
//   SC-003  the added rule count is within the spike's bound
//   SC-004  compile diagnostics are equal before and after
//
// Skipped with a [WARN] when `../keyboards` is absent locally (same convention as
// carveViaSplice.corpus.test.ts), but when CI is set a missing corpus is a hard
// failure: this suite is the only proof of SC-001..SC-004, so a skip there would
// be a silent green. Run locally with:
//
//   pnpm --filter @keyboard-studio/engine exec vitest run normalization-step/parity.corpus

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createVirtualFS, type CompileResult, type KeyboardIR, type SimKeyInput } from "@keyboard-studio/contracts";
import { emit } from "../../codec/emit.js";
import { parse } from "../../codec/parse.js";
import { compile } from "../../compiler/index.js";
import { stripDanglingAssetStores } from "../../compiler/stripDanglingAssetStores.js";
import { simulate } from "../../simulator/node.js";
import { stripAssetStoresForCompile } from "../../validator/context-tolerance.js";
import {
  NORMALIZATION_GROUP,
  NORMALIZATION_STORE_PREFIX,
  applyNormalizationStep,
  proposeNormalizationStep,
} from "./index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RELEASE_ROOT = resolve(__dir, "../../../../../../keyboards/release");
const available = existsSync(RELEASE_ROOT);
const ciRequiresCorpus = Boolean(process.env.CI);
if (!available && !ciRequiresCorpus) {
  console.warn("[WARN] ../keyboards not found; skipping normalization-step parity corpus test (set CI to make this fatal)");
}

describe("normalization step parity: corpus presence", () => {
  it.skipIf(!ciRequiresCorpus)("the sibling ../keyboards corpus exists when CI is set (SC-001..SC-004 are otherwise unproven)", () => {
    expect(available, `CI is set but ${RELEASE_ROOT} is missing; the parity corpus suite would silently skip`).toBe(true);
  });
});

/** SC-003: added rule bounds (the spike's counts, except fv_northern_tutchone). */
const RULE_BOUND: Record<string, number> = {
  el_dinka: 1,
  // The spike's 1 came from a two-key simulated repertoire. This keyboard really types
  // 3-key clusters (e.g. A + U+0308 + U+0300 via two prefix keys), which the static
  // repertoire correctly includes, so SC-003 restates its bound to 19 (research R10).
  // Restated again to 22 when pass-through shapes stopped matching unmapped mark
  // combinations (FR-003), which splits some wildcard rules (research R10).
  fv_northern_tutchone: 22,
  fv_tlingit: 6,
  sil_yoruba8: 9,
  // Raised from 12: three-key clusters (depth 3) are now in the static repertoire, so the
  // pass-through rules cover them too. Restated to 90 once depth-3 stacking landed
  // together with the FR-001 fallback letters and the FR-003 strict coverage: the
  // three compound on this open-matrix keyboard (133 bases x 9 marks, 14,653 maps),
  // and 67 distinct two-mark tails set a floor the pass-through shapes cannot go
  // under. Measured on the merged generator: CI run 37520753270 and locally.
  el_pan_sahelian: 90,
  sil_cameroon_qwerty: 23,
  sil_tchad: 49,
};

function kmnPathOf(id: string): string {
  for (const shard of readdirSync(RELEASE_ROOT)) {
    const p = join(RELEASE_ROOT, shard, id, "source", `${id}.kmn`);
    if (existsSync(p)) return p;
  }
  throw new Error(`keyboard ${id} not found under ${RELEASE_ROOT}`);
}

const VKEYS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => `K_${c}`),
  ..."0123456789".split("").map((c) => `K_${c}`),
  "K_BKQUOTE", "K_HYPHEN", "K_EQUAL", "K_LBRKT", "K_RBRKT", "K_BKSLASH",
  "K_COLON", "K_QUOTE", "K_COMMA", "K_PERIOD", "K_SLASH",
];
const MODIFIER_STATES: SimKeyInput["modifiers"][] = [[], ["shift"], ["ralt"], ["shift", "ralt"]];
const ALL_KEYS: SimKeyInput[] = VKEYS.flatMap((vkey) => MODIFIER_STATES.map((modifiers) => ({ vkey, modifiers })));

const PROBE_KEYS: SimKeyInput[] = [
  { vkey: "K_BKSP", modifiers: [] },
  { vkey: "K_SPACE", modifiers: [] },
  ...["K_A", "K_E", "K_O", "K_1"].map((vkey) => ({ vkey, modifiers: [] as SimKeyInput["modifiers"] })),
  { vkey: "K_A", modifiers: ["shift"] },
];

/**
 * Both builds compile from the author's own source text. Re-emitting the whole
 * IR is not usable here: position-faithful emit hoists global opaque stores
 * (`outs()` expansions, as in el_dinka) above the stores they reference, which
 * kmcmplib rejects, and that would mask what this test measures. The step is
 * therefore injected textually: redirect `begin`, then append the generated
 * stores and group exactly as `emit` renders them.
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
  return `${redirected.trimEnd()}\n\n${stores.join("\n")}\n\n${emitted.slice(groupAt).join("\n")}\n`;
}

function compileText(id: string, kmn: string): Promise<CompileResult> {
  return compile(createVirtualFS([{ path: `source/${id}.kmn`, content: kmn, isBinary: false }]), id);
}

/**
 * Stripping header asset stores deletes lines before `begin`, so every parsed
 * `sourceLine` is short by that many. The codec's position-faithful emit reads
 * them, so shift them back (as utilities/nfd-tolerance-corpus does).
 */
function parseRebased(raw: string, id: string): { ir: KeyboardIR; text: string } {
  const stripped = stripDanglingAssetStores(raw, createVirtualFS([])).kmn;
  // Some keyboards declare `store(&LAYOUTFILE)` and friends inside a group, where the
  // header-only strip does not reach. Blank them to a comment, keeping line numbers.
  const kmn = stripped.replace(/^[ \t]*store\(&(?:LAYOUTFILE|VISUALKEYBOARD|BITMAP|KMW_HELPFILE|KMW_EMBEDJS)\).*$/gim, "c");
  const lines = (t: string): number => t.split(/\r?\n/).length;
  const offset = lines(raw) - lines(kmn);
  const ir = parse(kmn, id).ir;
  if (offset === 0) return { ir, text: kmn };
  const shift = <T extends { sourceLine?: number }>(n: T): T =>
    n.sourceLine === undefined ? n : { ...n, sourceLine: n.sourceLine + offset };
  return {
    text: kmn,
    ir: {
      ...ir,
      stores: ir.stores.map(shift),
      comments: ir.comments.map(shift),
      raw: ir.raw.map(shift),
      groups: ir.groups.map((g) => ({ ...shift(g), rules: g.rules.map(shift) })),
    },
  };
}

const hasJs = (c: CompileResult): boolean => c.artifacts.some((a) => a.filename.endsWith(".js"));

function diagnosticsOf(r: CompileResult): string[] {
  return r.diagnostics
    .filter((d) => d.severity === "error" || d.severity === "fatal")
    .map((d) => `${d.severity}:${d.message}`)
    .sort();
}

const run = (c: CompileResult, keys: SimKeyInput[], text = ""): string => simulate(c, keys, { text }).finalOutput;

describe.skipIf(!available)("normalization step: spike parity on the seven keyboards", () => {
  for (const id of Object.keys(RULE_BOUND)) {
    it(
      `${id}: typed parity, pasted alternates, rule bound, diagnostics`,
      async () => {
        const raw = readFileSync(kmnPathOf(id), "utf8");
        const { ir, text: baseText } = parseRebased(raw, id);

        const proposal = await proposeNormalizationStep(ir);
        if (proposal.kind !== "step") throw new Error(`${id}: refused ${proposal.reason}`);
        const { step, maps } = proposal;
        const steppedIr = applyNormalizationStep(ir, step);

        // SC-003
        const bound = RULE_BOUND[id]!;
        console.info(`[INFO] ${id}: ${step.ruleCount} rules (bound ${bound}), ${maps.length} maps`);
        expect(step.ruleCount).toBeLessThanOrEqual(bound);

        // SC-004: what the product compiles is the emitted IR, so diagnostics
        // are compared on that route.
        const emitBuild = (k: KeyboardIR): Promise<CompileResult> => compileText(id, emit(stripAssetStoresForCompile(k)));
        const baseE = await emitBuild(ir);
        const stepE = await emitBuild(steppedIr);
        const baseDiag = diagnosticsOf(baseE);
        const stepDiag = diagnosticsOf(stepE);
        console.info(`[INFO] ${id}: emitted compile errors ${baseDiag.length} -> ${stepDiag.length}`);
        expect(stepDiag).toEqual(baseDiag);
        if (id === "sil_yoruba8") expect([baseDiag.length, stepDiag.length]).toEqual([9, 9]);

        // Simulate the emitted builds (errors that still emit KeymanWeb JS are
        // simulated anyway). When emit alone makes the keyboard unsimulable (a
        // codec ordering limitation on global opaque stores), simulate the
        // author's own source with the step injected textually instead.
        let base = baseE;
        let stepped = stepE;
        if (!hasJs(baseE) || !hasJs(stepE)) {
          console.info(`[INFO] ${id}: emitted build has no JS; simulating source text with the step injected`);
          base = await compileText(id, baseText);
          stepped = await compileText(id, injectStep(baseText, steppedIr));
          expect(diagnosticsOf(stepped)).toEqual(diagnosticsOf(base));
        }
        expect(hasJs(base)).toBe(true);
        expect(hasJs(stepped)).toBe(true);

        // SC-001: every one- and two-key sequence.
        let sequences = 0;
        const differ: string[] = [];
        for (const k1 of ALL_KEYS) {
          const tag1 = `${k1.vkey}[${k1.modifiers.join("+")}]`;
          sequences += 1;
          if (run(base, [k1]) !== run(stepped, [k1])) differ.push(tag1);
          for (const k2 of ALL_KEYS) {
            sequences += 1;
            if (run(base, [k1, k2]) !== run(stepped, [k1, k2])) {
              differ.push(`${tag1} ${k2.vkey}[${k2.modifiers.join("+")}]`);
            }
          }
        }
        console.info(`[INFO] ${id}: ${sequences} typed sequences, ${differ.length} differ`);
        expect(sequences).toBe(35532);
        expect(differ.slice(0, 5)).toEqual([]);

        // SC-002: a pasted alternate then a key equals the produced form then the key.
        let probes = 0;
        const failed: string[] = [];
        for (const m of maps) {
          const accepted = [m.to, ...(m.ambiguous ?? [])];
          for (const key of PROBE_KEYS) {
            probes += 1;
            const got = run(stepped, [key], m.from);
            if (!accepted.some((to) => run(base, [key], to) === got)) {
              failed.push(`${JSON.stringify(m.from)} + ${key.vkey}`);
            }
          }
        }
        console.info(`[INFO] ${id}: ${probes} pasted-alternate probes, ${failed.length} failed`);
        expect(failed.slice(0, 5)).toEqual([]);
      },
      60 * 60 * 1000,
    );
  }
});
