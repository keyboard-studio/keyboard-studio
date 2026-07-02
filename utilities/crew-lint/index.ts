// crew-lint — crew-consistency lint suite (GitHub issue #948).
//
// The capstone that locks in the km-crew doc cleanups from the rest of the
// epic. It scans the crew docs under .claude/** (plus a couple of adjacent
// paths) and enforces 7 machine-checked invariants. Every failure names the
// offending FILE and LINE (and the matched text) so a human — or km-programmer
// in fix mode — can jump straight to it.
//
// Run: `pnpm crew-lint`  (== `tsx utilities/crew-lint/index.ts`)
// Wired into `pnpm lint` after eslint + depcruise. Must stay GREEN.
//
// The 7 checks:
//   1. No python fences        — no ```python / ```py blocks in .claude/**/km-*.md
//   2. No emoji                — no pictographic emoji in .claude/**/km-*.md
//   3. No phantom pkg paths    — no packages/{scaffolder,validator} under .claude/**
//   4. No self line-refs       — no hardcoded line-number cross-refs in km-triage.md
//   5. km-qc rubric consistency— the two km-qc rubrics agree (scheme + verdicts)
//   6. Roster consistency      — every referenced km-<role> has an agent file
//   7. Sentinel single spelling— only .escalations/.labels-created-v2 (never bare)
//
// Two of the checks (emoji, self line-refs) also carry a "prove it isn't a
// no-op" self-verification: the detector MUST fire on a known-bad throwaway
// string and MUST NOT fire on look-alike legitimate text. A regression that
// neuters a detector turns the suite RED just like a real violation.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(thisDir, "../..");

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

interface Failure {
  file: string; // repo-relative
  line: number; // 1-based; 0 == file-level (no single line)
  text: string; // the matched text / description
}

interface CheckResult {
  id: string;
  title: string;
  failures: Failure[];
}

const rel = (abs: string) => path.relative(REPO_ROOT, abs);

function read(abs: string): string {
  return readFileSync(abs, "utf8");
}
function lines(abs: string): string[] {
  return read(abs).split("\n");
}

const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf"]);

/** Recursively list files under `dir` (absolute), skipping obvious binaries. */
function walk(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(abs));
    else if (!BINARY_EXT.has(path.extname(ent.name).toLowerCase())) out.push(abs);
  }
  return out;
}

const CLAUDE = path.join(REPO_ROOT, ".claude");

// All km-*.md docs anywhere under .claude/ (agents + commands + elsewhere).
function crewDocs(): string[] {
  return walk(CLAUDE).filter((f) => /^km-.*\.md$/.test(path.basename(f)));
}

/** Scan a file's lines with a global regex; one Failure per match. */
function scanLines(abs: string, re: RegExp, label?: (m: RegExpMatchArray) => string): Failure[] {
  const out: Failure[] = [];
  lines(abs).forEach((line, i) => {
    for (const m of line.matchAll(re)) {
      out.push({ file: rel(abs), line: i + 1, text: label ? label(m) : m[0] });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Detectors (exported-in-spirit so the self-verification can exercise them)
// ---------------------------------------------------------------------------

// Pictographic emoji. Deliberately covers the real emoji blocks and NOTHING
// in the legitimate-typography neighbourhood:
//   1F000-1FAFF  supplemental pictographs / symbols (incl. 🤖 U+1F916)
//   2600-27BF    misc symbols + dingbats (incl. ✅❌⚠✂✔✖)
//   2B00-2BFF    misc symbols & arrows (decorative)
//   FE0F         emoji variation selector (the "️" in ⚠️)
// Left OUT on purpose: → (U+2192) and the U+2190-21FF arrows, § (U+00A7),
// × (U+00D7), en/em dashes (U+2013/2014), curly quotes (U+2018/9,201C/D),
// ≥ (U+2265) / ≤ (U+2264) — all below U+2600, so never matched.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

// Self-referential line-number idioms (check 4). Each is a SOFT ref into the
// doc's own body. The tilde is the load-bearing signal — a "~<num>" or a
// "line(s) ~<num>" is an approximate self-line-ref that rots the instant the
// file is edited. Bare exact numbers ("line 13617") are left alone because
// they appear inside worked examples describing OTHER files' diff offsets.
const LINE_REF_PATTERNS: RegExp[] = [
  /\blines?\s+~\d+/gi, // "line ~758", "lines ~758"
  /\blines?\s+~?\d+\s*[-–—]\s*~?\d+/gi, // "lines ~758-760", "lines 100-200"
  /\bsee\s+lines?\s+~?\d+/gi, // "see line 42"
  /~\d+\s*[-–—]\s*\d+/gi, // bare "~758-760" soft range
];
function lineRefMatches(s: string): string[] {
  const out: string[] = [];
  for (const re of LINE_REF_PATTERNS) for (const m of s.matchAll(re)) out.push(m[0]);
  return out;
}

// ---------------------------------------------------------------------------
// Check 1 — no python fences
// ---------------------------------------------------------------------------
function checkNoPythonFences(): CheckResult {
  const failures: Failure[] = [];
  const re = /```\s*(python|py)\b/gi;
  for (const f of crewDocs()) failures.push(...scanLines(f, re));
  return { id: "1", title: "No python fences in .claude/**/km-*.md", failures };
}

// ---------------------------------------------------------------------------
// Check 2 — no emoji
// ---------------------------------------------------------------------------
function checkNoEmoji(): CheckResult {
  const failures: Failure[] = [];
  for (const f of crewDocs()) {
    failures.push(
      ...scanLines(f, EMOJI, (m) => {
        const cp = m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
        return `${m[0]} (U+${cp})`;
      }),
    );
  }
  return { id: "2", title: "No emoji in .claude/**/km-*.md", failures };
}

// ---------------------------------------------------------------------------
// Check 3 — no phantom package paths (anywhere under .claude/**)
// ---------------------------------------------------------------------------
function checkNoPhantomPaths(): CheckResult {
  const failures: Failure[] = [];
  const re = /packages\/(scaffolder|validator)\b/g;
  for (const f of walk(CLAUDE)) {
    if (path.extname(f).toLowerCase() === ".md" || /\.(js|cjs|mjs|ts|json|txt)$/.test(f)) {
      failures.push(...scanLines(f, re));
    }
  }
  return {
    id: "3",
    title:
      "No phantom package paths (packages/{scaffolder,validator}) under .claude/** — they live at packages/engine/src/{scaffolder,validator}",
    failures,
  };
}

// ---------------------------------------------------------------------------
// Check 4 — no hardcoded self line-number cross-refs in km-triage.md
// ---------------------------------------------------------------------------
function checkNoSelfLineRefs(): CheckResult {
  const failures: Failure[] = [];
  const triage = path.join(CLAUDE, "commands", "km-triage.md");
  if (existsSync(triage)) {
    for (const re of LINE_REF_PATTERNS) failures.push(...scanLines(triage, re));
  } else {
    failures.push({ file: rel(triage), line: 0, text: "km-triage.md not found" });
  }
  return {
    id: "4",
    title: "No hardcoded line-number self cross-refs in km-triage.md",
    failures,
  };
}

// ---------------------------------------------------------------------------
// Check 5 — km-qc rubric consistency across agent + command
// ---------------------------------------------------------------------------
function checkQcConsistency(): CheckResult {
  const failures: Failure[] = [];
  const targets = [
    path.join(CLAUDE, "agents", "km-qc.md"),
    path.join(CLAUDE, "commands", "km-qc.md"),
  ];

  // Canonical tokens that MUST appear in both rubrics.
  const required: { re: RegExp; desc: string }[] = [
    { re: /Start (?:at )?100|out of 100/, desc: "subtractive base (start 100)" },
    { re: /10 per P0/, desc: "-10 per P0" },
    { re: /3 per P1/, desc: "-3 per P1" },
    { re: /1 per P2/, desc: "-1 per P2" },
    { re: /PASS WITH NOTES/, desc: "PASS WITH NOTES verdict" },
    { re: /≥\s*80/, desc: "PASS >= 80 threshold" },
    { re: /60\s*[–—-]\s*79/, desc: "60-79 band" },
    { re: /<\s*60/, desc: "FAIL < 60 threshold" },
    { re: /\bFAIL\b/, desc: "FAIL verdict" },
  ];
  // Conflicting/stale schemes that must NOT appear in either rubric.
  const forbidden: { re: RegExp; desc: string }[] = [
    { re: /≥\s*85/g, desc: "additive >= 85 gate" },
    { re: /85\s*\/\s*100/g, desc: "additive 85/100 gate" },
    { re: /FIX ISSUES/gi, desc: "stale 'FIX ISSUES' verdict" },
    { re: /\bREJECT\b/g, desc: "stale 'REJECT' verdict" },
  ];

  for (const t of targets) {
    if (!existsSync(t)) {
      failures.push({ file: rel(t), line: 0, text: "km-qc rubric file not found" });
      continue;
    }
    const txt = read(t);
    for (const { re, desc } of required) {
      if (!re.test(txt)) {
        failures.push({ file: rel(t), line: 0, text: `missing canonical rubric token: ${desc}` });
      }
    }
    for (const { re, desc } of forbidden) {
      failures.push(...scanLines(t, re, () => `conflicting rubric token present: ${desc}`));
    }
  }
  return {
    id: "5",
    title: "km-qc rubric consistency (subtractive scheme + verdict thresholds agree)",
    failures,
  };
}

// ---------------------------------------------------------------------------
// Check 6 — roster consistency
// ---------------------------------------------------------------------------
function checkRosterConsistency(): CheckResult {
  const failures: Failure[] = [];
  const agentsDir = path.join(CLAUDE, "agents");
  const agentNames = new Set(
    walk(agentsDir)
      .filter((f) => /^km-.*\.md$/.test(path.basename(f)))
      .map((f) => path.basename(f, ".md").toLowerCase()),
  );

  // km-lead / km-triage are commands, km-review is a workflow — not subagents.
  const NON_AGENT = new Set(["km-lead", "km-triage", "km-review"]);

  // (a) prose references in the two command docs.
  const docs = [
    path.join(CLAUDE, "commands", "km-lead.md"),
    path.join(CLAUDE, "commands", "km-triage.md"),
  ];
  const tokenRe = /km-[a-zA-Z]+/g;
  for (const d of docs) {
    if (!existsSync(d)) continue;
    lines(d).forEach((line, i) => {
      for (const m of line.matchAll(tokenRe)) {
        const name = m[0].toLowerCase();
        if (NON_AGENT.has(name)) continue;
        if (!agentNames.has(name)) {
          failures.push({ file: rel(d), line: i + 1, text: `referenced role "${m[0]}" has no .claude/agents/${m[0]}.md` });
        }
      }
    });
  }

  // (b) agentType values in the km-review workflow REVIEWERS/prompts.
  const review = path.join(CLAUDE, "workflows", "km-review.js");
  if (existsSync(review)) {
    lines(review).forEach((line, i) => {
      for (const m of line.matchAll(/agentType:\s*"(km-[^"]+)"/g)) {
        const name = m[1].toLowerCase();
        if (NON_AGENT.has(name)) continue;
        if (!agentNames.has(name)) {
          failures.push({ file: rel(review), line: i + 1, text: `agentType "${m[1]}" has no .claude/agents/${m[1]}.md` });
        }
      }
    });
  }
  return {
    id: "6",
    title: "Roster consistency (every referenced km-<role> has an agent file)",
    failures,
  };
}

// ---------------------------------------------------------------------------
// Check 7 — sentinel single spelling (.escalations/.labels-created-v2)
// ---------------------------------------------------------------------------
function checkSentinelSpelling(): CheckResult {
  const failures: Failure[] = [];
  // Match the stale form (no -v2 suffix). Negative lookahead keeps the correct
  // .labels-created-v2 spelling GREEN.
  const re = /\.escalations\/\.labels-created(?!-v2)/g;
  const roots = [CLAUDE, path.join(REPO_ROOT, "utilities", "km-triage-app")];
  for (const root of roots) {
    for (const f of walk(root)) {
      if (/\.(md|js|cjs|mjs|ts|json|txt|sh|ps1)$/.test(f)) failures.push(...scanLines(f, re));
    }
  }
  return {
    id: "7",
    title: "Sentinel single spelling (.escalations/.labels-created-v2 everywhere; no stale .labels-created)",
    failures,
  };
}

// ---------------------------------------------------------------------------
// Self-verification — prove the two riskiest detectors are not no-ops.
// These add a synthetic Failure to a dedicated result if the detector fails to
// fire on known-bad text, or fires on known-good text.
// ---------------------------------------------------------------------------
function checkDetectorsProven(): CheckResult {
  const failures: Failure[] = [];

  // Emoji detector: MUST flag these, MUST NOT flag those.
  const mustFlag = ["✅", "❌", "⚠️", "🤖", "✂", "✔", "✖"];
  const mustPass = ["→", "§", "×", "—", "–", "“", "”", "’", "≥", "≤", "A1-A7"];
  for (const s of mustFlag) {
    EMOJI.lastIndex = 0;
    if (!EMOJI.test(s)) failures.push({ file: "(self-test)", line: 0, text: `EMOJI failed to flag ${JSON.stringify(s)} — detector is a no-op` });
  }
  for (const s of mustPass) {
    EMOJI.lastIndex = 0;
    if (EMOJI.test(s)) failures.push({ file: "(self-test)", line: 0, text: `EMOJI wrongly flagged legitimate ${JSON.stringify(s)}` });
  }

  // Self line-ref detector: MUST catch the tilde soft-ref, MUST NOT catch the
  // PR-#350 worked-example line numbers or the "~1000 fixtures" count.
  if (lineRefMatches("mirrors the crew composition at lines ~758-760 above").length === 0) {
    failures.push({ file: "(self-test)", line: 0, text: "line-ref detector failed to flag 'at lines ~758-760' — detector is a no-op" });
  }
  if (lineRefMatches("`scan.ts` cited at line 13617 vs. real line 195 because").length !== 0) {
    failures.push({ file: "(self-test)", line: 0, text: "line-ref detector wrongly flagged the PR-#350 worked example (bare diff line numbers)" });
  }
  if (lineRefMatches("baseline/ (~1000 fixtures)").length !== 0) {
    failures.push({ file: "(self-test)", line: 0, text: "line-ref detector wrongly flagged '~1000 fixtures' (an approximate count, not a line-ref)" });
  }

  return { id: "0", title: "Detector self-verification (prove emoji + line-ref detectors both ways)", failures };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
function main(): void {
  const results: CheckResult[] = [
    checkDetectorsProven(),
    checkNoPythonFences(),
    checkNoEmoji(),
    checkNoPhantomPaths(),
    checkNoSelfLineRefs(),
    checkQcConsistency(),
    checkRosterConsistency(),
    checkSentinelSpelling(),
  ];

  let failed = 0;
  console.log("crew-lint — crew-consistency checks (issue #948)\n");
  for (const r of results) {
    const ok = r.failures.length === 0;
    if (!ok) failed++;
    const tag = ok ? "PASS" : "FAIL";
    console.log(`[${tag}] check ${r.id}: ${r.title}`);
    for (const f of r.failures) {
      const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file;
      console.log(`        ${loc}  ${f.text}`);
    }
  }

  console.log("");
  if (failed > 0) {
    console.error(`crew-lint: ${failed} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("crew-lint: all 7 checks GREEN.");
}

main();
