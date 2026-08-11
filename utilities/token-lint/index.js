#!/usr/bin/env node
// token-lint — bans hard-coded colors in the studio source (design-system
// adoption, epic #533 Phase 0). Colors belong in the token system
// (`packages/studio/src/styles/`, `index.css`) as CSS custom properties, not
// scattered as literals across component/lib code.
//
// BANNED:
//   1. Hex color literals — `#` followed by exactly 3, 4, 6, or 8 hex digits
//      at a word boundary (the CSS shorthand/full/alpha lengths).
//   2. `rgb(`/`rgba(`/`hsl(`/`hsla(` with a literal numeric first channel
//      (as opposed to `rgb(var(--x) ...)`-style token composition).
//
// ALLOWED:
//   - `packages/studio/src/styles/` and `packages/studio/src/index.css` —
//     token-definition sites. (Scan is .ts/.tsx only, so this is
//     belt-and-braces; `styles/` is still excluded in case it grows .ts
//     token modules.)
//   - Test files: `*.test.ts(x)`, anything under a `__tests__` or `e2e`
//     directory, and `*.fixture.ts`.
//   - Three documented third-party brand colors (sign-in buttons must match
//     the provider's brand exactly) — see THIRD_PARTY_BRAND below.
//
// BASELINE RATCHET: `baseline.json` maps repo-relative file path -> integer
// count of currently-allowed violations. A file with MORE violations than
// its baseline is an ERROR. A file with FEWER prints an "improved" [OK] line
// and tells the caller to re-run with --update-baseline to lock it in. A
// file absent from the baseline must have ZERO violations. This is Phase 0:
// REPORT-ONLY in the sense that it doesn't touch any source — the gate
// exists so the rest of the #533 branch can burn the baseline down without
// the count silently creeping back up.
//
// Flags:
//   --update-baseline   rewrite baseline.json from the current scan
//   --report            print the full per-file table and exit 0
//
// Run: `pnpm run token-lint`  (== `node utilities/token-lint/index.js`)
// Wired into `pnpm lint` after test-antipattern-lint. Must stay GREEN.
//
// CommonJS, plain `node`. No external dependencies (only fs + path).

const { readFileSync, readdirSync, existsSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const STUDIO_SRC = path.join(REPO_ROOT, "packages", "studio", "src");
const BASELINE_PATH = path.join(__dirname, "baseline.json");

const rel = (abs) => path.relative(REPO_ROOT, abs).replace(/\\/g, "/");

// Three documented third-party brand colors this lint intentionally allows.
// Sign-in buttons must match the provider's brand color exactly, so these
// are not tokenized:
//   #238636, #2ea043 — GitHub sign-in button (GitHub brand green, two shades)
//   #1a73e8          — Google sign-in button (Google brand blue)
// Third-party brand marks. These must render EXACTLY in both themes — they
// identify someone else's product, so theming them is both wrong and, for the
// logos, a trademark-usage problem. Tokenizing a multi-color mark also simply
// destroys it (the Google "G" is four colors that only read as the G together).
//   GitHub sign-in button:  #238636 (fill), #2ea043 (border)
//   Google sign-in button:  #1a73e8 (fill)
//   Google "G" mark:        #4285f4 blue, #34a853 green, #fbbc05 yellow,
//                           #ea4335 red  (components/ProviderMarks.tsx)
const THIRD_PARTY_BRAND = new Set([
  "#238636",
  "#2ea043",
  "#1a73e8",
  "#4285f4",
  "#34a853",
  "#fbbc05",
  "#ea4335",
]);

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  // "styles" — token-definition directory (belt-and-braces; scan is already
  // .ts/.tsx only, and index.css doesn't match anyway).
  const skip = new Set(["node_modules", ".git", "dist", "build", "styles"]);
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const abs = path.join(dir, entry);
    let st;
    try {
      st = statSync(abs);
    } catch (e) {
      // Skip entries we can't stat (broken symlinks, permission errors, etc.)
      continue;
    }
    if (st.isDirectory()) out.push(...walk(abs));
    else if (abs.endsWith(".ts") || abs.endsWith(".tsx")) out.push(abs);
  }
  return out;
}

function isExcludedFile(frel) {
  const parts = frel.split("/");
  if (parts.includes("__tests__") || parts.includes("e2e")) return true;
  // survey/questions/** are pure DATA modules — question id, prompt, help_text,
  // options, validate(). They carry no styling at all, so any `#nnn` in them is
  // prose inside a string (GitHub issue references such as
  // `note: "Adlam (RTL alphabet, added in #870)"`), never a color. Comment
  // stripping cannot rescue those because they are string CONTENT, and no
  // regex distinguishes "#870" the issue from "#870" the 3-digit hex. Excluding
  // the directory is exact; the alternative was mangling real data to appease
  // the linter.
  if (frel.includes("/survey/questions/")) return true;
  const base = parts[parts.length - 1];
  if (/\.test\.tsx?$/.test(base)) return true;
  if (/\.fixture\.ts$/.test(base)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Pattern detectors
// ---------------------------------------------------------------------------

// Hex color: `#` + exactly 3, 4, 6, or 8 hex digits, at a word boundary.
// Longest-alternative-first so e.g. `#1234567` (7 digits — not a valid CSS
// hex length) doesn't spuriously match a 6-digit prefix: the \b after each
// alternative requires the hex run to end exactly there.
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;

// rgb()/rgba()/hsl()/hsla() with a literal numeric first channel — as
// opposed to token composition like `rgb(var(--accent-rgb) / 0.5)`.
const RGB_HSL_RE = /\b(?:rgba?|hsla?)\(\s*[0-9.]/gi;

// Guard: a match whose immediately preceding text is one of these codepoint/
// entity notations is not a color literal — it's part of a Unicode
// reference. Most relevant to hex matches (`&#0301;` numeric HTML entities
// can look like a 3/4-digit hex color).
function precededByCodepointNotation(before) {
  return /\\u$/i.test(before) || /U\+$/i.test(before) || /0x$/i.test(before) || /&$/.test(before);
}

// Guard: lines that are anchors, hash routes, data URIs, or DOM ids/ARIA
// attrs are full of `#`/`data:` text that isn't a color.
function lineIsExempt(line) {
  return (
    line.includes("href=") ||
    line.includes("#/") ||
    line.includes("data:") ||
    line.includes('id="') ||
    line.includes("aria-")
  );
}

// Blank out every comment in the source, preserving line count and column
// positions so the line-based exemptions below still line up.
//
// A start-of-line check is NOT enough. Real misses it produced:
//   - trailing comments:  `const x = 1; // see #533`
//   - JSX comments:       `{/* carried over from #931 */}`
//   - block interiors:    a `/* ... */` whose continuation lines start with
//                         neither `*` nor `/`
// All of those carry GitHub issue numbers (#525, #870, #1399, #533 ...) that
// are indistinguishable from 3-4 digit hex by regex alone, so they were being
// counted as color violations and baked into the baseline as phantom debt.
//
// Deliberately a small scanner rather than a regex: a regex cannot tell a `//`
// inside a string literal (`"https://..."`, a very common false strip) from a
// real comment start. String state is tracked for exactly that reason.
function stripComments(src) {
  let out = "";
  let i = 0;
  let quote = null; // '"' | "'" | "`" when inside a string literal
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote !== null) {
      out += c;
      if (c === "\\") {
        // Keep the escape pair intact; a `\"` must not close the string.
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      // Newlines are preserved so line numbers/count never shift.
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function countMatches(line, re, isAllowed) {
  re.lastIndex = 0;
  let n = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    const before = line.slice(0, m.index);
    if (precededByCodepointNotation(before)) continue;
    if (isAllowed(m[0])) continue;
    n++;
  }
  return n;
}

function scanFile(absPath) {
  const content = stripComments(readFileSync(absPath, "utf8"));
  const lines = content.split(/\r?\n/);
  let total = 0;
  for (const line of lines) {
    if (lineIsExempt(line)) continue;
    total += countMatches(line, HEX_RE, (text) => THIRD_PARTY_BRAND.has(text.toLowerCase()));
    total += countMatches(line, RGB_HSL_RE, () => false);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return {};
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

function writeBaseline(counts) {
  const obj = {};
  for (const key of [...counts.keys()].sort()) obj[key] = counts.get(key);
  writeFileSync(BASELINE_PATH, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const updateBaseline = args.includes("--update-baseline");
  const report = args.includes("--report");

  const files = walk(STUDIO_SRC).filter((f) => !isExcludedFile(rel(f)));

  const counts = new Map(); // relPath -> violation count (only entries > 0)
  for (const file of files) {
    const n = scanFile(file);
    if (n > 0) counts.set(rel(file), n);
  }

  if (updateBaseline) {
    writeBaseline(counts);
    const totalViolations = [...counts.values()].reduce((a, b) => a + b, 0);
    console.log(
      `[OK] token-lint: baseline updated — ${counts.size} file(s), ${totalViolations} violation(s)`,
    );
    process.exit(0);
  }

  if (report) {
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    console.log("token-lint report (file: current violation count):");
    for (const [file, n] of rows) console.log(`  ${n}  ${file}`);
    const totalViolations = rows.reduce((a, [, n]) => a + n, 0);
    console.log(`token-lint: ${rows.length} file(s) with violations, ${totalViolations} total`);
    process.exit(0);
  }

  const baseline = loadBaseline();
  const allFiles = new Set([...counts.keys(), ...Object.keys(baseline)]);

  const failures = [];
  const improvements = [];
  for (const file of [...allFiles].sort()) {
    const current = counts.get(file) ?? 0;
    const allowed = baseline[file] ?? 0;
    if (current > allowed) failures.push({ file, current, allowed });
    else if (current < allowed) improvements.push({ file, current, allowed });
  }

  for (const imp of improvements) {
    console.log(`[OK] token-lint: ${imp.file} improved (${imp.allowed} -> ${imp.current})`);
  }
  if (improvements.length > 0) {
    console.log(
      "token-lint: re-run with --update-baseline to lock in the improvement(s) above",
    );
  }

  if (failures.length === 0) {
    console.log("[OK] token-lint: no file exceeds its baseline");
    process.exit(0);
  }

  console.error(`[ERROR] token-lint: ${failures.length} file(s) exceed their baseline:`);
  for (const f of failures) {
    console.error(`  [ERROR] ${f.file}: ${f.current} violation(s), baseline allows ${f.allowed}`);
  }
  process.exit(1);
}

main();
