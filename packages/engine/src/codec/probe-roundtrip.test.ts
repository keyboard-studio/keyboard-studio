// Bulk round-trip probe: parse + scaffold + emit every release keyboard,
// then detect emit output that kmcmplib would reject. Aggregates failures
// by symptom so we can fix the top patterns in bulk.
//
// We do not run kmcmplib here (too slow for 914 keyboards). Instead we apply
// a set of lexer-faithful heuristics that catch known invalid-token causes:
//   - lines with two top-level `+` markers in the same rule
//   - lines with a bare `> use(group)` that lost its match/nomatch keyword
//   - quoted string literals that embed their own delimiter
//   - quoted string literals that embed combining marks (\p{M})
//
// Each failure is recorded with its file path, line number, and symptom tag.
// At end-of-suite we dump a grouped summary so we can pick fix targets.
//
// Run via: pnpm -C packages/engine test -- --run probe-roundtrip
// Not part of the normal CI suite — file ends with `probe-` so it can be
// removed once the round-trip suite is clean.

import { describe, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { parse, emit } from "./index.ts";
import { scaffoldIR } from "../scaffolder/scaffold-ir.ts";

const KEYBOARDS_ROOTS = [
  "D:/Github/_Projects/_KM/keyboards/release",
  "D:/Github/_Projects/_KM/keyboards/experimental",
];

interface Failure {
  keyboardId: string;
  path: string;
  symptom: string;
  line: number;
  excerpt: string;
}

function listKmnSources(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      const p = join(dir, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) {
        walk(p);
      } else if (st.isFile() && p.endsWith(".kmn") && p.includes("\\source\\")) {
        out.push(p);
      }
    }
  }
  walk(root);
  return out;
}

/**
 * Strip a trailing `c <comment>` (or bare `c`) from a rule line.
 * kmcmplib's lexer treats `c ` followed by anything as a line comment;
 * matches stripTrailingComment in parse.ts.
 * Quoted regions are respected — the `c` must be unquoted.
 */
function stripTrailingComment(line: string): string {
  let inS = false, inD = false, depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) { inS = !inS; continue; }
    if (c === '"' && !inS) { inD = !inD; continue; }
    if (inS || inD) continue;
    if (c === "[") { depth++; continue; }
    if (c === "]") { depth--; continue; }
    if (depth === 0 && c === "c" && /\s/.test(line[i - 1] ?? "") &&
        (i === line.length - 1 || /\s/.test(line[i + 1] ?? ""))) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

function detectFailures(keyboardId: string, path: string, emitted: string): Failure[] {
  const fails: Failure[] = [];
  const rawLines = emitted.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i++) {
    const ln = stripTrailingComment(rawLines[i] ?? "");
    if (ln === "" || ln.startsWith("c ") || ln === "c") continue;

    // Symptom 1: bare `> use(...)` / `> beep` / bare `> output` with no leading match/nomatch
    if (/^\s*>\s*\S/.test(ln) && !/^(?:match|nomatch)\b/.test(rawLines[i - 1] ?? "")) {
      fails.push({ keyboardId, path, symptom: "bare-arrow-rule", line: i + 1, excerpt: ln });
    }

    // Strip quoted regions to find structural punctuation outside strings.
    // Track whether we are inside ' or " — bracket groups also need to be excluded
    // (e.g. [SHIFT K_X] should not contribute to + count).
    let depth = 0;
    let inS = false;
    let inD = false;
    let plusCount = 0;
    for (let k = 0; k < ln.length; k++) {
      const c = ln[k];
      if (c === "'" && !inD) { inS = !inS; continue; }
      if (c === '"' && !inS) { inD = !inD; continue; }
      if (inS || inD) continue;
      if (c === "[") { depth++; continue; }
      if (c === "]") { depth--; continue; }
      if (depth === 0 && c === "+" &&
          (k === 0 || /\s/.test(ln[k - 1] ?? "")) &&
          (k === ln.length - 1 || /\s/.test(ln[k + 1] ?? ""))) {
        plusCount++;
      }
    }
    if (plusCount >= 2) {
      fails.push({ keyboardId, path, symptom: "double-plus", line: i + 1, excerpt: ln });
    }

    // Symptom 3: quoted region contains its own delimiter (unclosed strings).
    // Detect by scanning for unescaped quote pairs that close prematurely.
    // We approximate by checking each quoted span — if a `'`-delimited span
    // is followed immediately by a non-space, non-end character, the parser
    // likely tokenized it weirdly.
    if (/'[^']*'\S/.test(ln) || /"[^"]*"\S/.test(ln)) {
      // Allowed: 'x'U+0022 is NOT followed by non-space char (U is ws? no, it's a letter).
      // But things like 'a'b are suspicious.
      // Restrict to bare 'x'y patterns — flag if the char after the closing quote is alphanumeric.
      if (/'[^']*'[A-Za-z0-9]/.test(ln) || /"[^"]*"[A-Za-z0-9]/.test(ln)) {
        fails.push({ keyboardId, path, symptom: "quote-glued-token", line: i + 1, excerpt: ln });
      }
    }

    // Symptom 4: combining mark inside a quoted literal (the original quote-fix
    // case — already addressed but kept here as a regression sentinel).
    if (/['"][^'"]*[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯][^'"]*['"]/.test(ln)) {
      fails.push({ keyboardId, path, symptom: "combining-in-quote", line: i + 1, excerpt: ln });
    }
  }
  return fails;
}

describe("round-trip probe over all release + experimental keyboards", () => {
  it("scans every {release,experimental}/**/*.kmn and aggregates emit-output issues", () => {
    const all: string[] = [];
    for (const root of KEYBOARDS_ROOTS) {
      const found = listKmnSources(root);
      console.log(`[probe] ${root.split("/").pop()}: ${found.length} keyboards`);
      all.push(...found);
    }
    console.log(`[probe] scanning ${all.length} keyboards total`);

    const failures: Failure[] = [];
    const parseErrors: { path: string; message: string }[] = [];
    const emitErrors: { path: string; message: string }[] = [];

    for (const p of all) {
      const id = basename(p, ".kmn");
      let src: string;
      try { src = readFileSync(p, "utf-8"); } catch (e) { continue; }
      let ir;
      try {
        ir = parse(src, id).ir;
      } catch (e) {
        parseErrors.push({ path: p, message: (e as Error).message });
        continue;
      }
      try {
        scaffoldIR(ir, {
          identity: { keyboardId: "probe_new", displayName: "Probe" },
          group: "qwerty-qwertz",
        });
      } catch (e) {
        // scaffold may throw on shapes it can't handle; skip but log.
        continue;
      }
      let emitted: string;
      try {
        emitted = emit(ir);
      } catch (e) {
        emitErrors.push({ path: p, message: (e as Error).message });
        continue;
      }
      failures.push(...detectFailures(id, p, emitted));
    }

    // Group by symptom and count.
    const bySymptom = new Map<string, Failure[]>();
    for (const f of failures) {
      const arr = bySymptom.get(f.symptom) ?? [];
      arr.push(f);
      bySymptom.set(f.symptom, arr);
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`parse errors:   ${parseErrors.length}`);
    console.log(`emit errors:    ${emitErrors.length}`);
    console.log(`total symptoms: ${failures.length}`);
    console.log(`unique kbs w/ symptoms: ${new Set(failures.map(f => f.keyboardId)).size}`);
    console.log(`\n=== BY SYMPTOM ===`);
    for (const [sym, arr] of [...bySymptom.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const uniqKbs = new Set(arr.map(f => f.keyboardId));
      console.log(`${sym}: ${arr.length} lines across ${uniqKbs.size} keyboards`);
    }

    console.log(`\n=== FIRST 3 EXAMPLES PER SYMPTOM ===`);
    for (const [sym, arr] of bySymptom.entries()) {
      console.log(`\n--- ${sym} ---`);
      for (const ex of arr.slice(0, 3)) {
        console.log(`  ${ex.keyboardId}:${ex.line}  ${ex.excerpt.slice(0, 120)}`);
      }
    }

    if (parseErrors.length > 0) {
      console.log(`\n=== FIRST 5 PARSE ERRORS ===`);
      for (const e of parseErrors.slice(0, 5)) {
        console.log(`  ${basename(e.path, ".kmn")}: ${e.message.slice(0, 200)}`);
      }
    }
    if (emitErrors.length > 0) {
      console.log(`\n=== FIRST 5 EMIT ERRORS ===`);
      for (const e of emitErrors.slice(0, 5)) {
        console.log(`  ${basename(e.path, ".kmn")}: ${e.message.slice(0, 200)}`);
      }
    }
  }, 600_000);
});
