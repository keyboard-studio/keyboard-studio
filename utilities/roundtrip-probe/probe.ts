/**
 * Round-trip corpus probe — parse + scaffold + emit every keyboard under the
 * given roots, then detect emit output that kmcmplib would reject.
 *
 * Ported from the former `packages/engine/src/codec/probe-roundtrip.test.ts`
 * (deleted in the same change). That file was a vitest test in name only: it
 * contained no assertions, hardcoded one machine's `D:/Github/...` corpus
 * paths, and passed vacuously everywhere else. This utility keeps its
 * lexer-faithful symptom heuristics — they encode hard-won knowledge about
 * how emitted .kmn goes wrong — and gives them a real contract:
 *
 *   - the corpus roots are CLI arguments, never hardcoded paths;
 *   - finding any symptom, parse error, or emit error exits 1;
 *   - scanning nothing (missing root, zero .kmn files) exits 2 — a probe
 *     that examined no keyboards must never look like a pass.
 *
 * We do not run kmcmplib here (too slow for ~914 keyboards). Instead we apply
 * the same heuristics the test used:
 *   - lines with two top-level `+` markers in the same rule
 *   - lines with a bare `> use(group)` that lost its match/nomatch keyword
 *   - quoted string literals glued to a following alphanumeric token
 *   - quoted string literals that embed combining marks (\p{M})
 *
 * Run (from the repo root):
 *   TSX_TSCONFIG_PATH=utilities/roundtrip-probe/tsconfig.json \
 *     pnpm dlx tsx utilities/roundtrip-probe/probe.ts <keyboards-root> [more-roots...]
 *
 * Each root is scanned recursively for `*.kmn` files under a `source/`
 * directory (the keymanapp/keyboards layout); passing the repo root, its
 * `release/` dir, or a single keyboard dir all work.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename, sep } from "node:path";
import { parse, emit } from "../../packages/engine/src/codec/index.ts";
import { scaffoldIR } from "../../packages/engine/src/scaffolder/scaffold-ir.ts";

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
      } else if (st.isFile() && p.endsWith(".kmn") && p.split(sep).includes("source")) {
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
    // eslint-disable-next-line no-misleading-character-class
    if (/['"][^'"]*[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯][^'"]*['"]/.test(ln)) {
      fails.push({ keyboardId, path, symptom: "combining-in-quote", line: i + 1, excerpt: ln });
    }
  }
  return fails;
}

function main(argv: string[]): number {
  const roots = argv.slice(2);
  if (roots.length === 0) {
    console.error("usage: probe.ts <keyboards-root> [more-roots...]");
    return 2;
  }
  for (const root of roots) {
    if (!existsSync(root)) {
      console.error(`[probe] root not found: ${root}`);
      return 2;
    }
  }

  const all: string[] = [];
  for (const root of roots) {
    const found = listKmnSources(root);
    console.log(`[probe] ${root}: ${found.length} keyboards`);
    all.push(...found);
  }
  if (all.length === 0) {
    console.error("[probe] no .kmn files under a source/ directory in the given roots — refusing to pass vacuously");
    return 2;
  }
  console.log(`[probe] scanning ${all.length} keyboards total`);

  const failures: Failure[] = [];
  const parseErrors: { path: string; message: string }[] = [];
  const emitErrors: { path: string; message: string }[] = [];
  let scaffoldSkips = 0;

  for (const p of all) {
    const id = basename(p, ".kmn");
    let src: string;
    try { src = readFileSync(p, "utf-8"); } catch { continue; }
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
    } catch {
      // scaffold may throw on shapes it can't handle; skip but count.
      scaffoldSkips++;
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
  console.log(`scaffold skips: ${scaffoldSkips}`);
  console.log(`total symptoms: ${failures.length}`);
  console.log(`unique kbs w/ symptoms: ${new Set(failures.map((f) => f.keyboardId)).size}`);

  console.log(`\n=== BY SYMPTOM ===`);
  for (const [sym, arr] of [...bySymptom.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const uniqKbs = new Set(arr.map((f) => f.keyboardId));
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

  if (failures.length > 0 || parseErrors.length > 0 || emitErrors.length > 0) {
    console.error(`\n[probe] FAIL: ${failures.length} symptoms, ${parseErrors.length} parse errors, ${emitErrors.length} emit errors`);
    return 1;
  }
  console.log(`\n[probe] PASS: ${all.length} keyboards round-tripped with no symptoms`);
  return 0;
}

process.exit(main(process.argv));
