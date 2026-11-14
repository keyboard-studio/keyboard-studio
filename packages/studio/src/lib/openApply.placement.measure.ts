// openApply.placement.measure -- T084 (spec 111 phase 15): across the 20 corpus
// sample keyboards, does each tool kind place its change precisely when applied
// on Open, or does it need the author's consent to a reformat?
//
// "Precise" is `applied` from `applyOpenChange` with NO consent given (the
// splice placed the change). `needs-consent` means the splice could not place
// it and the author would be asked. Not a gate: it asserts nothing about the
// numbers and is not part of the suite. Run it with the measure config:
//
//   pnpm --filter @keyboard-studio/studio exec vitest run --config vitest.measure.config.ts src/lib/openApply.placement.measure.ts
//
// The studio test setup silences the console, so the result is written as JSON
// to the file named by PLACEMENT_OUT (default: ./placement-measure.json).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { createVirtualFS, ruleContextElements } from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs, parseKmn, parseKps } from "@keyboard-studio/engine";
import type { FetchFn } from "@keyboard-studio/engine";
import type { OverBroadGuard } from "@keyboard-studio/engine/kmAssist";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { useOpenAssignStore } from "../stores/openAssignStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useGuardIntentStore } from "../stores/guardIntentStore.ts";
import { recordMarksTreatmentValue, type MarksTreatmentValue } from "../survey/marks/marksValue.ts";
import { narrowOverBroadGuardOnOpen } from "../components/rules/narrowGuard.ts";
import { applyOpenChange, type OpenApplyResult, type OpenChange } from "./openApply.ts";
import { readVfsText } from "./vfsText.ts";
import { emitRule } from "@keyboard-studio/engine";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { OPEN_SAMPLE_KEYBOARD_IDS, sampleKeyboardRelativePath } from "../test/openSampleKeyboards.ts";

vi.mock("./services.ts", async () => {
  const { makePattern } = await import("@keyboard-studio/contracts");
  const swap = makePattern({
    id: "simple_swap",
    title: "simple_swap",
    description: "simple_swap",
    category: "desktop",
    appliesTo: [],
    questions: [{ id: "kmnRules", prompt: "kmnRules", answerType: "text" as const }],
    kmnFragment: "{{kmnRules}}\n",
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "",
    reviewDate: "2026-10-29",
  });
  return {
    getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
    getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
    getPatternByIdSync: (id: string) => (id === "simple_swap" ? swap : undefined),
  };
});

// Capture why a run asked for consent: the projection's reformat warnings, or
// (no warning) the post-splice check in openApply/core.ts that found the rules
// were not placed as the change meant.
const captured = vi.hoisted(() => ({ last: null as null | { reformatRequired?: string[]; warnings: string[]; text?: string; intended?: unknown } }));
vi.mock("./projectWorkingCopyVfs.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("./projectWorkingCopyVfs.ts")>();
  return {
    ...real,
    projectWorkingCopyVfs: (input: Parameters<typeof real.projectWorkingCopyVfs>[0]) => {
      const result = real.projectWorkingCopyVfs(input);
      const kmnPath = `source/${input.keyboardId}.kmn`;
      captured.last = {
        ...(result.reformatRequired !== undefined ? { reformatRequired: result.reformatRequired } : {}),
        warnings: result.warnings,
        text: readVfsText(input.vfs, kmnPath) ?? "",
        intended: result.intendedKmnIr?.[kmnPath],
      };
      return result;
    },
  };
});

const HERE = dirname(fileURLToPath(import.meta.url));
const KEYBOARDS_ROOT = resolve(HERE, "../../../../../keyboards");
const RELEASE = join(KEYBOARDS_ROOT, "release");
const PROXY = "http://corpus.invalid";
const folderOf = (id: string): string => join(RELEASE, sampleKeyboardRelativePath(id));

const corpusFetch: FetchFn = async (url) => {
  const file = join(KEYBOARDS_ROOT, url.slice(PROXY.length + 1));
  if (!existsSync(file)) {
    return { ok: false, status: 404, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
  }
  const bytes = readFileSync(file);
  return {
    ok: true,
    status: 200,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
};

async function openKeyboard(id: string): Promise<string> {
  const kpsText = readFileSync(join(folderOf(id), "source", `${id}.kps`), "utf8");
  const meta = parseKps(kpsText);
  const kb: StartKeyboard = {
    id,
    path: `release/${sampleKeyboardRelativePath(id)}`,
    script: meta.script,
    targets: meta.targets,
    displayName: meta.displayName,
    version: meta.version,
    languages: meta.languages,
  };
  const vfs = createVirtualFS();
  await fetchKeyboardSourceToVfs(kb, vfs, { proxyBase: PROXY, fetchImpl: corpusFetch, keepKps: true });
  const kmnText = readVfsText(vfs, `source/${id}.kmn`)!;
  useOpenRemovalStore.getState().clear();
  useOpenUndoStore.getState().clear();
  useOpenAssignStore.getState().clear();
  useGuardIntentStore.getState().resetForTest();
  useDecisionStore.getState().reset();
  const wc = useWorkingCopyStore.getState();
  wc.reset();
  wc.instantiateFromExisting(kb, { vfs, ir: parseKmn(kmnText, id).ir });
  wc.setFallbackPolicy("pass-through");
  wc.setAttribution({ authorName: "Corpus", copyrightHolder: "Corpus" });
  return kmnText;
}

type Cell = "precise" | "consent" | "failed" | "n/a";
interface Row { id: string; remove: Cell; assign: Cell; narrow: Cell; marks: Cell; code: Cell; notes: string[] }

const cellOf = (r: OpenApplyResult | null): Cell => {
  if (r === null) return "n/a";
  if (r.status === "applied" || r.status === "unchanged") return "precise";
  return r.status === "needs-consent" ? "consent" : "failed";
};

const KEYS = ["K_Q", "K_W", "K_E", "K_R", "K_T", "K_Y", "K_U", "K_I", "K_O", "K_P", "K_A", "K_S", "K_D", "K_F", "K_G",
  "K_H", "K_J", "K_K", "K_L", "K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M", "K_COMMA", "K_PERIOD", "K_SLASH"];

function firstMismatch(c: { text?: string; intended?: unknown } | null, id: string): string {
  if (c === null || c.text === undefined || c.intended === undefined) return "(no capture)";
  const want = c.intended as KeyboardIR;
  const got = parseKmn(c.text, id).ir;
  if (want.groups.length !== got.groups.length) return `group count ${want.groups.length} vs ${got.groups.length}`;
  for (let gi = 0; gi < want.groups.length; gi++) {
    const w = want.groups[gi]!;
    const g = got.groups[gi]!;
    const wt = w.rules.map((r) => emitRule(r, w.usingKeys));
    const gt = g.rules.map((r) => emitRule(r, g.usingKeys));
    if (wt.length !== gt.length) return `group ${w.name}: ${wt.length} rules vs ${gt.length} after the splice`;
    for (let i = 0; i < wt.length; i++) if (wt[i] !== gt[i]) return `group ${w.name} rule ${i}: wanted [${wt[i]}] got [${gt[i]}]`;
  }
  return "(no difference found)";
}

describe.skipIf(!existsSync(RELEASE))("T084 placement measurement", () => {
  it("measures each tool kind over the sample keyboards", async () => {
    const rows: Row[] = [];
    for (const id of OPEN_SAMPLE_KEYBOARD_IDS) {
      if (!existsSync(folderOf(id))) continue;
      const row: Row = { id, remove: "n/a", assign: "n/a", narrow: "n/a", marks: "n/a", code: "n/a", notes: [] };
      const kmnPath = `source/${id}.kmn`;
      const text = await openKeyboard(id);
      const lines = text.split(/\n/);

      // Remove one character: a single-key rule typing one character on its own line.
      const ir0 = useWorkingCopyStore.getState().startIr!;
      let pick: { nodeId: string; ch: string } | undefined;
      for (const g of ir0.groups) {
        if (g.readonly || pick !== undefined) continue;
        for (const r of g.rules) {
          if (r.sourceLine === undefined || r.output.length !== 1) continue;
          const o = r.output[0]!;
          if (o.kind !== "char" || [...o.value].length !== 1) continue;
          const els = ruleContextElements(r);
          if (els.length !== 1 || els[0]!.kind !== "vkey") continue;
          pick = { nodeId: r.nodeId, ch: o.value.normalize("NFC") };
          break;
        }
      }
      if (pick !== undefined) {
        row.remove = cellOf(applyOpenChange({ kind: "remove", itemIds: [pick.nodeId], chars: [pick.ch] }));
        await openKeyboard(id);
      } else row.notes.push("remove: no single-key character rule");

      // Assign one character to the first (modifiers, key) no rule answers.
      const answered = new Set<string>();
      for (const g of ir0.groups) {
        for (const r of g.rules) {
          for (const c of JSON.stringify(ruleContextElements(r)).matchAll(/"kind":"vkey","name":"(K_[A-Z0-9_]+)"(?:,"modifiers":\[([^\]]*)\])?/g)) {
            const mods = (c[2] ?? "").replace(/"/g, "").split(",").filter((m) => m !== "" && !/^N?CAPS$/.test(m)).sort();
            answered.add(`${mods.join(" ")}|${c[1]}`);
          }
        }
      }
      const hasMain = ir0.groups.some((g) => !g.readonly && g.name.toLowerCase() === "main" && g.usingKeys);
      let vkey: string | undefined;
      let mods = "";
      for (const m of ["", "SHIFT", "RALT", "RALT SHIFT", "ALT", "CTRL", "CTRL ALT", "SHIFT ALT"]) {
        const k = KEYS.find((x) => !answered.has(`${m.split(" ").filter(Boolean).sort().join(" ")}|${x}`));
        if (k !== undefined) {
          vkey = k;
          mods = m;
          break;
        }
      }
      if (hasMain && vkey !== undefined) {
        const change: OpenChange = {
          kind: "assign",
          add: [{
            scope: "individual", target: "\uA7B5", modality: "physical", source: "user",
            mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: `+ [${mods === "" ? "" : `${mods} `}${vkey}] > U+A7B5` } }],
          }],
          remove: [],
        };
        row.assign = cellOf(applyOpenChange(change));
        await openKeyboard(id);
      } else row.notes.push(hasMain ? "assign: no free key" : "assign: no group(main) using keys");

      // A Narrow exception: needs a guard-shaped rule (any(store) + key > context).
      let guard: OverBroadGuard | undefined;
      for (const g of ir0.groups) {
        if (guard !== undefined) break;
        for (const r of g.rules) {
          const els = ruleContextElements(r);
          const anyEl = els.find((c) => c.kind === "any");
          const key = els.find((c) => c.kind === "vkey");
          if (anyEl === undefined || key === undefined || anyEl.kind !== "any") continue;
          const store = ir0.stores.find((s) => s.name === anyEl.storeRef);
          const first = store?.items.find((it) => it.kind === "char" && /\S/.test(it.value));
          if (first === undefined || first.kind !== "char") continue;
          guard = { markKey: key.kind === "vkey" ? key.name : "", markChar: "́", blockedChar: first.value, guardRuleId: r.nodeId, question: `q-${id}` };
          break;
        }
      }
      if (guard !== undefined) {
        const g = guard;
        let seen: OpenApplyResult | null = null;
        await narrowOverBroadGuardOnOpen(g, async (c) => (seen = applyOpenChange(c)));
        row.narrow = cellOf(seen);
        if (seen === null) row.notes.push("narrow: the synthetic guard rule could not be planned");
        else if (row.narrow === "failed") row.notes.push(`narrow: ${JSON.stringify(seen)}`);
        else if (row.narrow === "consent") {
          const c = captured.last;
          row.notes.push(
            c !== null && c.reformatRequired !== undefined
              ? `narrow consent: the splice could not place the edit (${c.warnings.filter((w) => w.startsWith("[open]")).join(" | ")})`
              : "narrow consent: the splice placed an edit but the post-splice check (intendedMatchesText) found the rules not as intended: " + firstMismatch(c, id),
          );
        }
        await openKeyboard(id);
      } else row.notes.push("narrow: no guard-shaped rule");

      // Marks guards: only for a keyboard that has combining marks in its text.
      const mark = /U\+03[0-6][0-9A-F]/i.exec(text)?.[0];
      if (mark !== undefined) {
        const cp = Number.parseInt(mark.slice(2), 16);
        const value: MarksTreatmentValue = {
          answers: {},
          completion: {
            worklist: {
              ownLetterUnits: ["a"],
              markUnits: [{ mark: String.fromCodePoint(cp), inputOrder: "postfix" }],
              blockedCombinations: [],
            },
            outputForm: "base-plus-mark",
          } as unknown as MarksTreatmentValue["completion"],
          contextTolerance: null,
        };
        recordMarksTreatmentValue(value);
        row.marks = cellOf(applyOpenChange({ kind: "marks" }));
        await openKeyboard(id);
      } else row.notes.push("marks: no combining mark in the keyboard");

      // A code-view edit of one rule: the first rule's own line gets a trailing comment.
      let edit: number | undefined;
      for (const g of ir0.groups) {
        if (g.readonly || edit !== undefined) continue;
        for (const r of g.rules) {
          const l = r.sourceLine === undefined ? undefined : lines[r.sourceLine - 1];
          if (l !== undefined && !/\\\s*\r?$/.test(l) && !/\bc\s/.test(l)) {
            edit = r.sourceLine! - 1;
            break;
          }
        }
      }
      if (edit !== undefined) {
        const edited = lines.map((l, i) => (i === edit ? l.replace(/(\r?)$/, "   c edited$1") : l)).join("\n");
        row.code = cellOf(applyOpenChange({ kind: "files", files: { [kmnPath]: edited }, label: "Edit" }));
        if (row.code === "precise") {
          // The text is the author's own: the whole file is that text and nothing else.
          const now = readVfsText(useWorkingCopyStore.getState().startVfs!, kmnPath);
          if (now !== edited) row.code = "failed";
        }
      } else row.notes.push("code: no rule line without a comment or continuation");
      rows.push(row);
    }
    const tally = (k: "remove" | "assign" | "narrow" | "marks" | "code") => {
      const c = { precise: 0, consent: 0, failed: 0, "n/a": 0 };
      for (const r of rows) c[r[k]] += 1;
      return c;
    };
    writeFileSync(
      process.env["PLACEMENT_OUT"] ?? "placement-measure.json",
      JSON.stringify({ keyboards: rows.length, remove: tally("remove"), assign: tally("assign"), narrow: tally("narrow"), marks: tally("marks"), code: tally("code"), rows }, null, 1),
    );
    expect(rows.length).toBeGreaterThan(0);
  }, 900_000);
});
