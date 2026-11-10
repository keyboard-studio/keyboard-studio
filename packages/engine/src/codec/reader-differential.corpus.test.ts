/**
 * Side-by-side comparison of the legacy reader (parse-legacy.ts) and the new
 * reader on the vendored Keyman parser front end (lower.ts), spec 116 T038.
 *
 * For every corpus .kmn (root: env KS_KEYBOARDS, else the sibling `keyboards`
 * checkout; skipped with a [WARN] when absent) and every engine `.kmn` fixture:
 *   1. the IR, compared line by line (each line's stores, groups, rules and
 *      fragments). Comments are excluded until US2 (`ir.comments` and every
 *      `trailingComment`), the known gap;
 *   2. emit() text, for every file whose only differences are none;
 *   3. the node ids minted for each line;
 *   4. the import status, which must never get worse;
 *   5. the lines the grammar rejects, each of which must be an allow-list entry.
 * A line difference passes only when it is an entry in
 * specs/116-ng-parser-adoption/evidence/allow-list.json or one of its classes,
 * each class checked by its own verifier below.
 *
 * KS_RECORD_EVIDENCE=1 writes evidence/reader-differential.md.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parseLegacy, type ParseResult } from "./parse-legacy.js";
import { lowerDetailed } from "./lower.js";
import { emit } from "./emit.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env["KS_KEYBOARDS"] ?? path.resolve(__dir, "../../../../../keyboards");
const rootExists = fs.existsSync(path.join(ROOT, "release"));
const EVIDENCE_DIR = path.resolve(__dir, "../../../../specs/116-ng-parser-adoption/evidence");
const ENGINE_SRC = path.resolve(__dir, "..");

if (!rootExists) {
  console.warn(`[WARN] keyboards corpus not found at ${ROOT}; comparing engine fixtures only`);
}

interface AllowList {
  entries: Array<{ file: string; line: number; reason: string }>;
  classes: Array<{ class: string; reason: string }>;
}
const allowList = JSON.parse(fs.readFileSync(path.join(EVIDENCE_DIR, "allow-list.json"), "utf8")) as AllowList;

function* walkKmn(dir: string, skip: (name: string) => boolean): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!skip(e.name)) yield* walkKmn(full, skip);
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".kmn")) {
      yield full;
    }
  }
}

/** Corpus files (keyed `release/...`) and engine fixtures (keyed `fixture:...`). */
function sources(): Array<{ key: string; file: string }> {
  const out: Array<{ key: string; file: string }> = [];
  if (rootExists) {
    for (const tree of ["release", "experimental"]) {
      for (const f of walkKmn(path.join(ROOT, tree), (n) => n === "node_modules" || n === "build")) {
        out.push({ key: path.relative(ROOT, f).split(path.sep).join("/"), file: f });
      }
    }
  }
  for (const f of walkKmn(ENGINE_SRC, (n) => n === "node_modules" || n === "dist")) {
    if (!f.split(path.sep).includes("__fixtures__")) continue;
    out.push({ key: `fixture:${path.relative(ENGINE_SRC, f).split(path.sep).join("/")}`, file: f });
  }
  return out;
}

type Kind = "store" | "group" | "rule" | "raw";
interface LineItem {
  kind: Kind;
  nodeId: string;
  obj: Record<string, unknown>;
}

/** Each line's IR items, comments excluded (US2). */
function lineItems(ir: KeyboardIR): Map<number, LineItem[]> {
  const m = new Map<number, LineItem[]>();
  const add = (line: number | undefined, kind: Kind, obj: Record<string, unknown>): void => {
    const key = line ?? 0;
    const { trailingComment: _tc, ...rest } = obj;
    const list = m.get(key) ?? [];
    list.push({ kind, nodeId: String(obj["nodeId"]), obj: rest });
    m.set(key, list);
  };
  for (const g of ir.groups) {
    const { rules: _rules, ...groupOnly } = g;
    add(g.sourceLine, "group", groupOnly as unknown as Record<string, unknown>);
    for (const r of g.rules) add(r.sourceLine, "rule", r as unknown as Record<string, unknown>);
  }
  for (const s of ir.stores) add(s.sourceLine, "store", s as unknown as Record<string, unknown>);
  for (const f of ir.raw) add(f.sourceLine, "raw", f as unknown as Record<string, unknown>);
  return m;
}

const SPACE_PAREN_KEYWORDS = /^(any|notany|index|context|outs|dk|deadkey|use|if|set|save|reset|call|platform|layer|baselayout)$/i;
const GLUED_CALL = /^[A-Za-z]+\s*\([^)]*\)\S/;

/** The raw element texts anywhere in a line's items. */
function rawTexts(items: LineItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    for (const list of [it.obj["context"], it.obj["output"], it.obj["items"]]) {
      if (!Array.isArray(list)) continue;
      for (const el of list as Array<{ kind: string; text?: string }>) {
        if (el.kind === "raw" && el.text !== undefined) out.push(el.text);
      }
    }
  }
  return out;
}

const SPACE_PAREN_IN_SOURCE = /\b(any|notany|index|context|outs|dk|deadkey|use|if|set|save|reset|call|platform|layer|baselayout)\s+\(/i;

/** Both sides are one fragment each, with different reasons. */
function reasonOnlyChange(oldItems: LineItem[], newItems: LineItem[]): boolean {
  return oldItems.length === 1 && newItems.length === 1 && oldItems[0]!.kind === "raw" && newItems[0]!.kind === "raw" &&
    oldItems[0]!.obj["reason"] !== newItems[0]!.obj["reason"];
}

/** The class of an accepted difference on one line, or null when it is not one. */
function classify(oldItems: LineItem[], newItems: LineItem[], src: string): string | null {
  // smp-literal-typed: the legacy reader opaqued an SMP literal. The new one types it,
  // so the line is typed, or stays a fragment for its next opaque construct.
  if (
    oldItems.length > 0 &&
    oldItems.every((i) => i.kind === "raw" && i.obj["reason"] === "smp-literal") &&
    newItems.length === oldItems.length &&
    newItems.every((i) => i.kind !== "raw" || i.obj["reason"] !== "smp-literal")
  ) {
    return "smp-literal-typed";
  }
  const oldRaw = rawTexts(oldItems);
  const newRaw = new Set(rawTexts(newItems));
  // space-before-paren: legacy split `kw (args)` into `kw` + raw `(args)`, which leaves
  // a stray `(args)` element or changes which construct opaques the line.
  if (SPACE_PAREN_IN_SOURCE.test(src)) {
    for (let i = 0; i < oldRaw.length; i++) {
      if (oldRaw[i]!.startsWith("(") && !newRaw.has(oldRaw[i]!)) return "space-before-paren";
    }
    for (let i = 0; i + 1 < oldRaw.length; i++) {
      if (SPACE_PAREN_KEYWORDS.test(oldRaw[i]!) && !newRaw.has(oldRaw[i]!)) return "space-before-paren";
    }
    if (reasonOnlyChange(oldItems, newItems)) return "space-before-paren";
  }
  // glued-calls: legacy kept `f(a)g(b)` as one raw element.
  if (oldRaw.some((t) => GLUED_CALL.test(t) && !newRaw.has(t))) return "glued-calls";
  return null;
}

type Status = "clean" | "clean-with-opaque" | "parse-failure";
const RANK: Record<Status, number> = { clean: 0, "clean-with-opaque": 1, "parse-failure": 2 };
function run(fn: (t: string, id: string) => ParseResult, text: string): { result: ParseResult | null; status: Status; ms: number } {
  const t0 = performance.now();
  try {
    const result = fn(text, "kbd");
    return { result, status: result.ir.raw.length > 0 ? "clean-with-opaque" : "clean", ms: performance.now() - t0 };
  } catch {
    return { result: null, status: "parse-failure", ms: performance.now() - t0 };
  }
}

function reasonCounts(r: ParseResult | null, into: Map<string, number>): void {
  for (const f of r?.ir.raw ?? []) into.set(f.reason, (into.get(f.reason) ?? 0) + 1);
}

describe("new reader equals the legacy reader (corpus and fixtures)", () => {
  it("has no unlisted difference in IR, emitted text, node ids or import status", () => {
    const failures: string[] = [];
    const classCounts = new Map<string, Map<string, number>>(); // class -> file -> lines
    const entriesUsed = new Set<string>();
    const oldReasons = new Map<string, number>();
    const newReasons = new Map<string, number>();
    let files = 0;
    let identical = 0;
    let oldMs = 0;
    let newMs = 0;
    const entryKey = (file: string, line: number): string => `${file}:${line}`;
    const entries = new Map(allowList.entries.map((e) => [entryKey(e.file, e.line), e]));

    for (const { key, file } of sources()) {
      files++;
      const text = fs.readFileSync(file, "utf8");
      const srcLines = text.split(/\r?\n/);
      const a = run(parseLegacy, text);
      let rejected: number[] = [];
      const b = run((t, id) => {
        const r = lowerDetailed(t, id);
        rejected = r.rejectedLines;
        return r;
      }, text);
      for (const line of rejected) {
        if (entries.has(entryKey(key, line))) entriesUsed.add(entryKey(key, line));
        else failures.push(`${key}:${line}: grammar rejects a line that is not in allow-list.json`);
      }
      oldMs += a.ms;
      newMs += b.ms;
      reasonCounts(a.result, oldReasons);
      reasonCounts(b.result, newReasons);
      if (RANK[b.status] > RANK[a.status]) failures.push(`${key}: import status ${a.status} -> ${b.status}`);
      if (a.result === null || b.result === null) {
        if ((a.result === null) !== (b.result === null)) failures.push(`${key}: only one reader throws`);
        continue;
      }
      if (JSON.stringify(a.result.ir.header) !== JSON.stringify(b.result.ir.header)) {
        failures.push(`${key}: header ${JSON.stringify(a.result.ir.header)} -> ${JSON.stringify(b.result.ir.header)}`);
      }
      const ma = lineItems(a.result.ir);
      const mb = lineItems(b.result.ir);
      let allowedDiffs = 0;
      let unlisted = 0;
      for (const line of new Set([...ma.keys(), ...mb.keys()])) {
        const oldItems = ma.get(line) ?? [];
        const newItems = mb.get(line) ?? [];
        const ids = (l: LineItem[]): string => l.map((i) => i.nodeId).join(",");
        if (ids(oldItems) !== ids(newItems)) {
          failures.push(`${key}:${line}: node ids ${ids(oldItems)} -> ${ids(newItems)}`);
        }
        if (JSON.stringify(oldItems) === JSON.stringify(newItems)) continue;
        const entry = entries.get(entryKey(key, line));
        if (entry !== undefined) {
          entriesUsed.add(entryKey(key, line));
          allowedDiffs++;
          continue;
        }
        const cls = classify(oldItems, newItems, srcLines[line - 1] ?? "");
        if (cls !== null) {
          const perFile = classCounts.get(cls) ?? new Map<string, number>();
          perFile.set(key, (perFile.get(key) ?? 0) + 1);
          classCounts.set(cls, perFile);
          allowedDiffs++;
          continue;
        }
        unlisted++;
        if (unlisted <= 3) {
          failures.push(`${key}:${line}: unlisted difference\n  old ${JSON.stringify(oldItems).slice(0, 300)}\n  new ${JSON.stringify(newItems).slice(0, 300)}`);
        }
      }
      if (allowedDiffs === 0 && unlisted === 0) {
        const withoutComments = (ir: KeyboardIR): KeyboardIR => ({ ...ir, comments: [] });
        const ea = emit(withoutComments(a.result.ir));
        const eb = emit(withoutComments(b.result.ir));
        if (ea !== eb) failures.push(`${key}: emitted text differs`);
        else identical++;
      }
    }

    for (const e of allowList.entries) {
      const isFixture = e.file.startsWith("fixture:");
      if ((rootExists || isFixture) && !entriesUsed.has(entryKey(e.file, e.line))) failures.push(`allow-list entry unused: ${e.file}:${e.line}`);
    }
    const knownClasses = new Set(allowList.classes.map((c) => c.class));
    for (const cls of classCounts.keys()) {
      if (!knownClasses.has(cls)) failures.push(`class ${cls} is not in allow-list.json`);
    }

    if (process.env["KS_RECORD_EVIDENCE"] === "1") {
      const lines: string[] = [
        "# Reader comparison: legacy reader vs. vendored Keyman parser (spec 116 T038)",
        "",
        "Generated by `reader-differential.corpus.test.ts` with `KS_RECORD_EVIDENCE=1`. Comments are",
        "excluded from the comparison until US2.",
        "",
        `- Files compared: ${files} (corpus and engine fixtures)`,
        `- Identical (IR line by line and emitted text): ${identical}`,
        `- Time, whole set, one run: legacy ${oldMs.toFixed(0)} ms, new ${newMs.toFixed(0)} ms`,
        "",
        "## Fragment reasons, old against new",
        "",
        "| Reason | Legacy | New |",
        "|---|---|---|",
        ...[...new Set([...oldReasons.keys(), ...newReasons.keys()])]
          .sort()
          .map((r) => `| \`${r}\` | ${oldReasons.get(r) ?? 0} | ${newReasons.get(r) ?? 0} |`),
        "",
        "## Allow-listed differences",
        "",
        `- Line entries: ${allowList.entries.length} (see allow-list.json)`,
        ...allowList.classes.map((c) => {
          const perFile = classCounts.get(c.class);
          const total = [...(perFile?.values() ?? [])].reduce((x, y) => x + y, 0);
          return `- Class \`${c.class}\`: ${total} lines in ${perFile?.size ?? 0} files`;
        }),
        "",
        "## Per-file class counts",
        "",
        "| File | Class | Lines |",
        "|---|---|---|",
        ...[...classCounts].flatMap(([cls, perFile]) =>
          [...perFile].sort(([x], [y]) => (x < y ? -1 : 1)).map(([f, n]) => `| ${f} | \`${cls}\` | ${n} |`),
        ),
        "",
      ];
      fs.writeFileSync(path.join(EVIDENCE_DIR, "reader-differential.md"), lines.join("\n"));
    }

    expect(files).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 900_000);
});
