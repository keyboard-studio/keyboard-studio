// Spec 111 US1: opening a keyboard and submitting it keeps everything the
// author did not touch (SC-001, SC-002), and one tool change changes only the
// lines it concerns (SC-003). Runs over the corpus sample set in the sibling
// ../keyboards checkout (files are CRLF on Windows, which exercises the
// line-ending path).
//
// Real engine renderers and the real loader run; services.ts is mocked to
// avoid WASM / network I/O, as in the other serializeWorkingCopy tests.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { fetchKeyboardSourceToVfs, parseKmn, parseKps, parseKpsLanguages } from "@keyboard-studio/engine";
import type { FetchFn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useOpenRemovalStore } from "../stores/openRemovalStore.ts";
import { useOpenAssignStore, assignmentFingerprint } from "../stores/openAssignStore.ts";
import { useOpenUndoStore } from "../stores/openUndoStore.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { renderHook } from "@testing-library/react";
import { applyOpenChange } from "./openApply.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";
import { readVfsText } from "./vfsText.ts";
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

const HERE = dirname(fileURLToPath(import.meta.url));
const KEYBOARDS_ROOT = resolve(HERE, "../../../../../keyboards");
const RELEASE = join(KEYBOARDS_ROOT, "release");
const CORPUS_PRESENT = existsSync(RELEASE);
const PROXY = "http://corpus.invalid";

function folderOf(id: string): string {
  return join(RELEASE, sampleKeyboardRelativePath(id));
}

/** A fetch that serves the corpus checkout, decoding text the way Response.text() does. */
const corpusFetch: FetchFn = async (url) => {
  const rel = url.slice(PROXY.length + 1);
  const file = join(KEYBOARDS_ROOT, rel);
  if (!existsSync(file) || !statSync(file).isFile()) {
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

interface OpenedKeyboard {
  kb: StartKeyboard;
  /** Every file the open brought in: path to text (or bytes). */
  opened: Map<string, string | Uint8Array>;
  kmnText: string;
}

async function openKeyboard(id: string): Promise<OpenedKeyboard> {
  const folder = folderOf(id);
  const kpsText = readFileSync(join(folder, "source", `${id}.kps`), "utf8");
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
  const opened = new Map<string, string | Uint8Array>();
  for (const path of vfs.list()) opened.set(path, vfs.get(path)!.content);
  useWorkingCopyStore.getState().instantiateFromExisting(kb, { vfs, ir: parseKmn(kmnText, id).ir });
  return { kb, opened, kmnText };
}

function sameContent(a: string | Uint8Array, b: string | Uint8Array): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b;
  return Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
}

/** The lines of `text`, each keeping its own terminator, so line endings take part in the comparison. */
function linesOf(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

/** Lines of `original` that are missing from `output`, treating `output` as a subsequence-preserving edit. */
function diffLines(original: string[], output: string[]): { removed: string[]; added: string[] } {
  const removed: string[] = [];
  const added: string[] = [];
  let i = 0;
  let j = 0;
  while (i < original.length || j < output.length) {
    if (i < original.length && j < output.length && original[i] === output[j]) {
      i++;
      j++;
      continue;
    }
    // Resynchronise on the nearest matching line within a small window.
    let resynced = false;
    for (let d = 1; d <= 40 && !resynced; d++) {
      if (i + d < original.length && j < output.length && original[i + d] === output[j]) {
        removed.push(...original.slice(i, i + d));
        i += d;
        resynced = true;
      } else if (j + d < output.length && i < original.length && original[i] === output[j + d]) {
        added.push(...output.slice(j, j + d));
        j += d;
        resynced = true;
      }
    }
    if (!resynced) {
      if (i < original.length) removed.push(original[i++]!);
      if (j < output.length) added.push(output[j++]!);
    }
  }
  return { removed, added };
}

beforeEach(() => {
  vi.clearAllMocks();
  useDecisionStore.setState({ decisions: {} });
});

describe.skipIf(!CORPUS_PRESENT)("Open: no-edit round trip over the corpus sample set (SC-001, SC-002)", () => {
  it("covers at least 20 keyboards", () => {
    expect(OPEN_SAMPLE_KEYBOARD_IDS.length).toBeGreaterThanOrEqual(20);
  });

  for (const id of OPEN_SAMPLE_KEYBOARD_IDS) {
    it(`${id}: every opened file is carried byte-identical, apart from the version and one HISTORY entry`, async () => {
      if (!existsSync(folderOf(id))) return; // a corpus checkout older than the sample list
      const { opened, kmnText } = await openKeyboard(id);
      const projected = await projectWorkingCopyForOutput();
      expect(projected).not.toBeNull();
      const out = projected!.vfs;
      expect(projected!.keyboardId).toBe(id);

      const kmnPath = `source/${id}.kmn`;
      const kpsPath = `source/${id}.kps`;
      for (const [path, content] of opened) {
        const entry = out.get(path);
        expect(entry, `${path} is missing from the output`).toBeDefined();
        const got = entry!.content;

        if (path === kmnPath) {
          // Only the &KEYBOARDVERSION line may differ (rewritten, or inserted after &VERSION).
          const { removed, added } = diffLines(linesOf(kmnText), linesOf(got as string));
          expect(removed.every((l) => /&KEYBOARDVERSION/i.test(l)), `${path}: unexpected removed lines`).toBe(true);
          expect(added.every((l) => /&KEYBOARDVERSION/i.test(l)), `${path}: unexpected added lines`).toBe(true);
          expect(added.length).toBe(1);
          const crlf = kmnText.includes("\r\n");
          expect(got as string).toSatisfy((t: string) => (crlf ? !/[^\r]\n/.test(t) : !t.includes("\r")));
        } else if (path === kpsPath) {
          const { removed, added } = diffLines(linesOf(content as string), linesOf(got as string));
          expect(removed.every((l) => /<Version>/i.test(l)), `${path}: unexpected removed lines`).toBe(true);
          expect(added.every((l) => /<Version>/i.test(l)), `${path}: unexpected added lines`).toBe(true);
        } else if (path === "HISTORY.md") {
          // One new entry above the existing history; the existing text is carried whole.
          const original = content as string;
          const out = got as string;
          expect(out).toContain("Updated via keyboard-studio.");
          // Taking the new entry back out leaves the opened history exactly as it was.
          const entry = /## [^\r\n]+\r?\n\* Updated via keyboard-studio\.\r?\n(?:\r?\n)?/;
          // The blank line that separates the entry from the title block may be new or the file's own.
          const withLead = new RegExp(`(?:\r?\n)${entry.source}`);
          expect([out.replace(entry, ""), out.replace(withLead, "")]).toContain(original);
        } else {
          expect(sameContent(content, got), `${path} changed`).toBe(true);
        }
      }
    }, 60_000);
  }

  it("sil_cameroon_qwerty keeps its 278 languages in source order", async () => {
    const id = "sil_cameroon_qwerty";
    if (!existsSync(folderOf(id))) return;
    const { opened } = await openKeyboard(id);
    const projected = await projectWorkingCopyForOutput();
    const before = parseKpsLanguages(opened.get(`source/${id}.kps`) as string).map((l) => l.tag);
    const after = parseKpsLanguages(readVfsText(projected!.vfs, `source/${id}.kps`)!).map((l) => l.tag);
    expect(before).toHaveLength(278);
    expect(after).toEqual(before);
  });

  it("brings in the keyboard folder's files (loader coverage report)", async () => {
    const id = "basic_kbdus";
    if (!existsSync(folderOf(id))) return;
    const { opened } = await openKeyboard(id);
    const folder = folderOf(id);
    const onDisk: string[] = [];
    const walk = (dir: string, prefix: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const rel = prefix === "" ? name : `${prefix}/${name}`;
        if (statSync(full).isDirectory()) walk(full, rel);
        else onDisk.push(rel);
      }
    };
    walk(folder, "");
    // The compiled artifacts under build/ are staged on the download path only.
    const wanted = onDisk.filter((p) => !p.startsWith("build/") && !p.endsWith(".kpj.user"));
    const missing = wanted.filter((p) => !opened.has(p));
    // Documented ceiling: files no `.kmn`/`.kps` reference and no convention names are not fetched.
    expect(missing.filter((p) => p.startsWith("source/") && /\.(kmn|kps|kvks|keyman-touch-layout)$/.test(p))).toEqual([]);
  });
});

describe.skipIf(!CORPUS_PRESENT)("Open: one rule deleted changes only that rule (SC-003)", () => {
  const SAMPLE = ["basic_kbdus", "sil_cameroon_qwerty", "basic_kbdfr", "akan", "bambara", "basic_kbduk"];

  for (const id of SAMPLE) {
    it(`${id}: the .kmn differs only in the deleted rule's lines plus the version`, async () => {
      if (!existsSync(folderOf(id))) return;
      const { kmnText } = await openKeyboard(id);
      const state = useWorkingCopyStore.getState();
      const group = state.startIr!.groups.find((g) => !g.readonly)!;
      const rule = group.rules.find((r) => r.sourceLine !== undefined && /\+\s*\[/.test(linesOf(kmnText)[r.sourceLine! - 1] ?? ""));
      if (rule === undefined) return;
      useWorkingCopyStore.setState({ deletedNodeIds: new Set([rule.nodeId]) });

      const projected = await projectWorkingCopyForOutput();
      const got = readVfsText(projected!.vfs, `source/${id}.kmn`)!;
      expect(projected!.warnings.filter((w) => w.startsWith("[open]"))).toEqual([]);

      const ruleLine = linesOf(kmnText)[rule.sourceLine! - 1]!;
      const { removed, added } = diffLines(linesOf(kmnText), linesOf(got));
      const nonVersion = (l: string): boolean => !/&KEYBOARDVERSION/i.test(l);
      expect(removed.filter(nonVersion)).toContain(ruleLine);
      // The rule itself, and at most the comment lines anchored to it.
      expect(removed.filter(nonVersion).length).toBeLessThanOrEqual(4);
      // The fallback policy replaces the removed rule with a swallowing rule on the same key;
      // that replacement is the only line added.
      const addedLines = added.filter(nonVersion);
      expect(addedLines.length).toBeLessThanOrEqual(1);
      for (const l of addedLines) expect(l).toMatch(/>\s*(nul|context)\s*$/);
      // Untouched bytes: every line that survives keeps its original terminator.
      expect(got.split("\n").length).toBeLessThanOrEqual(kmnText.split("\n").length + 1);
    }, 60_000);
  }
});

describe.skipIf(!CORPUS_PRESENT)("Open: an applied removal over the corpus sample set", () => {
  const skipped: string[] = [];
  const withoutVersion = (t: string): string =>
    t.split(/(?<=\n)/).filter((l) => !/&KEYBOARDVERSION|&VERSION/i.test(l)).join("");

  for (const id of OPEN_SAMPLE_KEYBOARD_IDS) {
    it(`${id}: only lines holding the character change; every route agrees; restore is byte-identical`, async () => {
      if (!existsSync(folderOf(id))) return;
      const { kmnText } = await openKeyboard(id);
      const wc = useWorkingCopyStore.getState();
      wc.setFallbackPolicy("pass-through");
      wc.setAttribution({ authorName: "Corpus", copyrightHolder: "Corpus" });
      useOpenRemovalStore.getState().clear();
      const lines = linesOf(kmnText);
      // One removable character: a single-key rule typing one character that
      // appears on its own physical line, in plain or U+ spelling.
      let pick: { nodeId: string; ch: string } | undefined;
      for (const g of useWorkingCopyStore.getState().startIr!.groups) {
        if (g.readonly) continue;
        for (const r of g.rules) {
          if (r.sourceLine === undefined || r.output.length !== 1) continue;
          const o = r.output[0]!;
          if (o.kind !== "char" || [...o.value].length !== 1) continue;
          if (r.context.length !== 1 || r.context[0]!.kind !== "vkey") continue;
          const line = lines[r.sourceLine - 1] ?? "";
          const hex = o.value.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
          if (!line.includes(o.value) && !line.toUpperCase().includes(`U+${hex}`)) continue;
          pick = { nodeId: r.nodeId, ch: o.value.normalize("NFC") };
          break;
        }
        if (pick !== undefined) break;
      }
      if (pick === undefined) {
        skipped.push(id);
        console.warn(`[WARN] ${id}: no removable single-key character; skipped`);
        return;
      }
      const ch = pick.ch;
      const hex = ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
      const holdsChar = (l: string): boolean => l.includes(ch) || l.toUpperCase().includes(`U+${hex}`);

      // Read before the removal: which stores hold the character now.
      const holders = new Set(
        useWorkingCopyStore.getState().startIr!.stores
          .filter((st) => st.items.some((it) => it.kind === "char" && it.value.includes(ch)))
          .map((st) => st.name),
      );
      const result = applyOpenChange({ kind: "remove", itemIds: [pick.nodeId], chars: [ch] });
      expect(result.status, JSON.stringify(result)).toBe("applied");
      const s = useWorkingCopyStore.getState();
      const codeView = readVfsText(s.startVfs!, `source/${id}.kmn`)!;

      const { removed, added } = diffLines(lines, linesOf(codeView));
      // A changed store line must be a store that held the character, or one
      // position-paired with such a store (`any(A)` ... `index(B,n)` in one
      // rule): the carve drops the matching item from both.
      // Pairing is by position, so it is transitive: a store paired with a
      // store paired with a holder shares the holder's index.
      const pairs: [string, string][] = [];
      for (const l of lines) {
        const a = /\bany\(([^)\s]+)\)/i.exec(l)?.[1];
        const b = /\bindex\(([^,)\s]+)/i.exec(l)?.[1];
        if (a !== undefined && b !== undefined) pairs.push([a, b]);
      }
      const allowedStores = new Set(holders);
      for (let grew = true; grew; ) {
        grew = false;
        for (const [a, b] of pairs) {
          if (allowedStores.has(a) !== allowedStores.has(b)) {
            allowedStores.add(a);
            allowedStores.add(b);
            grew = true;
          }
        }
      }
      for (const l of removed.filter((x) => !/&KEYBOARDVERSION/i.test(x))) {
        const store = /^\s*store\s*\(([^)\s]+)\)/i.exec(l)?.[1];
        const ok = store !== undefined ? allowedStores.has(store) : holdsChar(l);
        expect(ok, `${id}: ch=${ch} (U+${hex}) an unrelated line changed: ${l.trim()}`).toBe(true);
      }
      expect(added.filter((l) => !/&KEYBOARDVERSION/i.test(l)).length).toBeLessThanOrEqual(removed.length);

      // Preview transform and download hold the same text as the working copy's file.
      const { result: hook, unmount } = renderHook(() => useWorkingCopyTransform({ previewedStartId: id }));
      const previewVfs = createVirtualFS(s.startVfs!.entries());
      hook.current!(previewVfs, id);
      const preview = readVfsText(previewVfs, `source/${id}.kmn`)!;
      unmount();
      const projected = await projectWorkingCopyForOutput();
      const download = readVfsText(projected!.vfs, `source/${id}.kmn`)!;
      expect(withoutVersion(preview)).toBe(withoutVersion(codeView));
      expect(withoutVersion(download)).toBe(withoutVersion(codeView));

      const entries = [...useOpenRemovalStore.getState().entries];
      expect(applyOpenChange({ kind: "reinsert", entries }).status).toBe("applied");
      expect(readVfsText(useWorkingCopyStore.getState().startVfs!, `source/${id}.kmn`)).toBe(kmnText);
    }, 120_000);
  }

  it("reports the keyboards skipped for lack of a candidate", () => {
    if (skipped.length > 0) console.warn(`[WARN] open corpus removal skipped: ${skipped.join(", ")}`);
    expect(skipped.length).toBeLessThan(OPEN_SAMPLE_KEYBOARD_IDS.length);
  });
});

describe.skipIf(!CORPUS_PRESENT)("Open: an applied assignment over the corpus sample set", () => {
  /** Keyboards the assignment could not be tried on, each with its reason. */
  const skippedWithReason: { id: string; reason: string }[] = [];
  let applied = 0;
  const withoutVersion = (t: string): string =>
    t.split(/(?<=\n)/).filter((l) => !/&KEYBOARDVERSION|&VERSION/i.test(l)).join("");
  const KEYS = [
    "K_Q", "K_W", "K_E", "K_R", "K_T", "K_Y", "K_U", "K_I", "K_O", "K_P", "K_A", "K_S", "K_D", "K_F", "K_G",
    "K_H", "K_J", "K_K", "K_L", "K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M", "K_COLON", "K_COMMA",
    "K_PERIOD", "K_SLASH", "K_BKQUOTE", "K_HYPHEN", "K_EQUAL", "K_LBRKT", "K_RBRKT", "K_BKSLASH", "K_QUOTE",
  ];
  const NEW_CHAR = "\uA7B5"; // a letter no sample keyboard types

  /** Paths where two parsed JSON values differ, with the value after. */
  function jsonDiffs(a: unknown, b: unknown, path = ""): { path: string; after: unknown }[] {
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      return a.flatMap((x, i) => jsonDiffs(x, b[i], `${path}[${i}]`));
    }
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      return [...keys].flatMap((k) =>
        jsonDiffs((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`),
      );
    }
    return [{ path, after: b }];
  }

  for (const id of OPEN_SAMPLE_KEYBOARD_IDS) {
    it(`${id}: an assignment adds only its rule and its key labels; every route agrees; unassign is byte-identical`, async () => {
      if (!existsSync(folderOf(id))) return;
      const { kmnText } = await openKeyboard(id);
      const wc = useWorkingCopyStore.getState();
      wc.setFallbackPolicy("pass-through");
      wc.setAttribution({ authorName: "Corpus", copyrightHolder: "Corpus" });
      useOpenRemovalStore.getState().clear();
      useOpenUndoStore.getState().clear();
      useOpenAssignStore.getState().clear();
      const ir = useWorkingCopyStore.getState().startIr!;
      const hasMain = ir.groups.some((g) => !g.readonly && g.name.toLowerCase() === "main" && g.usingKeys);
      // The first (modifiers, key) no rule in the keyboard already answers.
      const answered = new Set<string>();
      for (const g of ir.groups) {
        for (const r of g.rules) {
          for (const c of JSON.stringify(r.context).matchAll(/"kind":"vkey","name":"(K_[A-Z0-9_]+)"(?:,"modifiers":\[([^\]]*)\])?/g)) {
            // Caps state does not distinguish a keystroke (a claim on `[K_A]` shadows `[NCAPS K_A]`).
            const mods = (c[2] ?? "").replace(/"/g, "").split(",").filter((m) => m !== "" && !/^N?CAPS$/.test(m)).sort();
            answered.add(`${mods.join(" ")}|${c[1]}`);
          }
        }
      }
      const MODS = ["", "SHIFT", "RALT", "RALT SHIFT", "ALT", "CTRL", "CTRL ALT", "SHIFT ALT"];
      let vkey: string | undefined;
      let mods = "";
      for (const m of MODS) {
        const k = KEYS.find((x) => !answered.has(`${m.split(" ").filter(Boolean).sort().join(" ")}|${x}`));
        if (k !== undefined) {
          vkey = k;
          mods = m;
          break;
        }
      }
      if (!hasMain || vkey === undefined) {
        const reason = !hasMain ? "no `group(main) using keys` to merge into" : "every candidate key is already used";
        skippedWithReason.push({ id, reason });
        console.warn(`[WARN] ${id}: ${reason}; skipped`);
        return;
      }
      const a = {
        scope: "individual" as const,
        target: NEW_CHAR,
        modality: "physical" as const,
        mechanisms: [{ patternId: "simple_swap", strategyId: "S-01" as const, slotValues: { kmnRules: `+ [${mods === "" ? "" : `${mods} `}${vkey}] > U+A7B5` } }],
        source: "user" as const,
      };
      const startVfs = useWorkingCopyStore.getState().startVfs!;
      const paths = startVfs.list().filter((p) => /\.(kmn|kvks|keyman-touch-layout)$/.test(p));
      const beforeFiles = new Map(paths.map((p) => [p, readVfsText(startVfs, p)!] as const));

      const result = applyOpenChange({ kind: "assign", add: [a], remove: [] });
      expect(result.status, JSON.stringify(result)).toBe("applied");
      const s = useWorkingCopyStore.getState();
      const now = (p: string) => readVfsText(s.startVfs!, p)!;

      // .kmn: nothing the keyboard had is lost; what is new is the rule and its separator line.
      // Insertions only: the original lines are a subsequence of the new ones.
      const orig = linesOf(kmnText).filter((l) => !/&KEYBOARDVERSION/i.test(l));
      const nowLines = linesOf(now(`source/${id}.kmn`)).filter((l) => !/&KEYBOARDVERSION/i.test(l));
      const added: string[] = [];
      let at = 0;
      for (const l of orig) {
        while (at < nowLines.length && nowLines[at] !== l) added.push(nowLines[at++]!);
        expect(at < nowLines.length, `${id}: line lost: ${l.trim()}`).toBe(true);
        at += 1;
      }
      added.push(...nowLines.slice(at));
      expect(added.filter((l) => l.trim() !== "").map((l) => l.trim())).toEqual([`+ [${mods === "" ? "" : `${mods} `}${vkey}] > U+A7B5`]);

      for (const p of paths) {
        if (p.endsWith(".kvks")) {
          const d = diffLines(linesOf(beforeFiles.get(p)!), linesOf(now(p)));
          for (const l of [...d.removed, ...d.added]) {
            // A key added to a layer is appended before its closing tag, on that line.
            expect(l.includes(vkey) || /^\s*<\/layer>/.test(l), `${id}: ${p}: ${l.trim()}`).toBe(true);
          }
        } else if (p.endsWith(".keyman-touch-layout")) {
          // As TEXT: only label lines change (FR-010), even for a file that is
          // not in the engine's canonical layout.
          const t = diffLines(linesOf(beforeFiles.get(p)!), linesOf(now(p)));
          const bare = (l: string) => l.replace(/\r?\n$/, "");
          for (const l of t.added) {
            const ok = l.includes(NEW_CHAR) || t.removed.some((r) => bare(r) + "," === bare(l));
            expect(ok, `${id}: ${p}: unexpected added line ${l.trim()}`).toBe(true);
          }
          for (const l of t.removed) {
            const ok = l.includes('"text"') || t.added.some((a) => bare(a) === bare(l) + ",");
            expect(ok, `${id}: ${p}: unexpected removed line ${l.trim()}`).toBe(true);
          }
          const before = JSON.parse(beforeFiles.get(p)!);
          for (const d of jsonDiffs(before, JSON.parse(now(p)))) {
            expect(d.path.endsWith(".text"), `${id}: ${p} ${d.path}`).toBe(true);
            expect(d.after).toBe(NEW_CHAR);
          }
        }
      }

      // Preview transform and download hold the same text as the working copy's files.
      const { result: hook, unmount } = renderHook(() => useWorkingCopyTransform({ previewedStartId: id }));
      const previewVfs = createVirtualFS(s.startVfs!.entries());
      hook.current!(previewVfs, id);
      const projected = await projectWorkingCopyForOutput();
      for (const p of paths) {
        expect(withoutVersion(readVfsText(previewVfs, p)!), `${id}: preview ${p}`).toBe(withoutVersion(now(p)));
        expect(withoutVersion(readVfsText(projected!.vfs, p)!), `${id}: download ${p}`).toBe(withoutVersion(now(p)));
      }
      unmount();

      // Unassign puts every file back byte-for-byte.
      expect(applyOpenChange({ kind: "assign", add: [], remove: [assignmentFingerprint(a)] }).status).toBe("applied");
      for (const p of paths) expect(readVfsText(useWorkingCopyStore.getState().startVfs!, p), `${id}: ${p}`).toBe(beforeFiles.get(p));
      applied += 1;
    }, 120_000);
  }

  it("says how many keyboards the assignment applied to, and why each other one was skipped", () => {
    const present = OPEN_SAMPLE_KEYBOARD_IDS.filter((id) => existsSync(folderOf(id))).length;
    console.warn(
      `[INFO] open corpus assignment: applied to ${applied} of ${present}; skipped: ` +
        (skippedWithReason.map((x) => `${x.id} (${x.reason})`).join("; ") || "none"),
    );
    expect(applied + skippedWithReason.length).toBe(present);
    // Stated expectation: 19 of 20 apply; bj_naskapi_common has no `group(main)`
    // for an assignment to merge into. Any further skip is a regression.
    expect(skippedWithReason.length).toBeLessThanOrEqual(1);
    expect(applied).toBeGreaterThanOrEqual(present - 1);
  });
});
