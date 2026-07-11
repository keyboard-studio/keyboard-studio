#!/usr/bin/env node
// crew-lint — crew-consistency lint suite (GitHub issue #948).
//
// The capstone that locks in the km-crew doc cleanups from the rest of the
// epic. It scans the crew docs under .claude/** (plus a couple of adjacent
// paths) and enforces 7 machine-checked invariants. Every failure names the
// offending FILE and LINE (and the matched text) so a human — or km-programmer
// in fix mode — can jump straight to it.
//
// Run: `pnpm crew-lint`  (== `node utilities/crew-lint/index.js`)
// Wired into `pnpm lint` after eslint + depcruise. Must stay GREEN.
//
// Dependency-free CommonJS (plain `node`, no tsx / no compiler) — matches the
// utilities/km-triage-app/* helper pattern so CI's frozen-lockfile install
// needs no extra devDependency.
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

const { readFileSync, readdirSync, existsSync } = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const CLAUDE = path.join(REPO_ROOT, ".claude");

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
//
// A Failure is { file, line, text }:
//   file — repo-relative path
//   line — 1-based; 0 == file-level (no single line)
//   text — the matched text / description
// A CheckResult is { id, title, failures: Failure[] }.

const rel = (abs) => path.relative(REPO_ROOT, abs);
const read = (abs) => readFileSync(abs, "utf8");
const lines = (abs) => read(abs).split("\n");

const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf"]);

/** Recursively list files under `dir` (absolute), skipping obvious binaries. */
function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walk(abs));
    } else if (!BINARY_EXT.has(path.extname(ent.name).toLowerCase())) {
      out.push(abs);
    }
  }
  return out;
}

// All km-*.md docs anywhere under .claude/ (agents + commands + elsewhere).
const crewDocs = () => walk(CLAUDE).filter((f) => /^km-.*\.md$/.test(path.basename(f)));

/** Scan a file's lines with a global regex; one Failure per match. */
function scanLines(abs, re, label) {
  const out = [];
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
const LINE_REF_PATTERNS = [
  /\blines?\s+~\d+/gi, // "line ~758", "lines ~758"
  /\blines?\s+~?\d+\s*[-–—]\s*~?\d+/gi, // "lines ~758-760", "lines 100-200"
  /\bsee\s+lines?\s+~?\d+/gi, // "see line 42"
  /~\d+\s*[-–—]\s*\d+/gi, // bare "~758-760" soft range
];
const lineRefMatches = (s) => LINE_REF_PATTERNS.flatMap((re) => [...s.matchAll(re)].map((m) => m[0]));

// ---------------------------------------------------------------------------
// Check 1 — no python fences
// ---------------------------------------------------------------------------
function checkNoPythonFences() {
  const failures = crewDocs().flatMap((f) => scanLines(f, /```\s*(python|py)\b/gi));
  return { id: "1", title: "No python fences in .claude/**/km-*.md", failures };
}

// ---------------------------------------------------------------------------
// Check 2 — no emoji
// ---------------------------------------------------------------------------
function checkNoEmoji() {
  const failures = crewDocs().flatMap((f) =>
    scanLines(f, EMOJI, (m) => {
      const cp = m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
      return `${m[0]} (U+${cp})`;
    }),
  );
  return { id: "2", title: "No emoji in .claude/**/km-*.md", failures };
}

// ---------------------------------------------------------------------------
// Check 3 — no phantom package paths (anywhere under .claude/**)
// ---------------------------------------------------------------------------
function checkNoPhantomPaths() {
  const re = /packages\/(scaffolder|validator)\b/g;
  const failures = walk(CLAUDE)
    .filter((f) => /\.(md|js|cjs|mjs|ts|json|txt)$/i.test(f))
    .flatMap((f) => scanLines(f, re));
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
function checkNoSelfLineRefs() {
  const failures = [];
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
function checkQcConsistency() {
  const targets = [
    path.join(CLAUDE, "agents", "km-qc.md"),
    path.join(CLAUDE, "commands", "km-qc.md"),
  ];

  // Canonical tokens that MUST appear in both rubrics.
  const required = [
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
  const forbidden = [
    { re: /≥\s*85/g, desc: "additive >= 85 gate" },
    { re: /85\s*\/\s*100/g, desc: "additive 85/100 gate" },
    { re: /FIX ISSUES/gi, desc: "stale 'FIX ISSUES' verdict" },
    { re: /\bREJECT\b/g, desc: "stale 'REJECT' verdict" },
  ];

  const failures = targets.flatMap((t) => {
    if (!existsSync(t)) {
      return [{ file: rel(t), line: 0, text: "km-qc rubric file not found" }];
    }
    const txt = read(t);
    return [
      ...required
        .filter(({ re }) => !re.test(txt))
        .map(({ desc }) => ({ file: rel(t), line: 0, text: `missing canonical rubric token: ${desc}` })),
      ...forbidden.flatMap(({ re, desc }) => scanLines(t, re, () => `conflicting rubric token present: ${desc}`)),
    ];
  });

  return {
    id: "5",
    title: "km-qc rubric consistency (subtractive scheme + verdict thresholds agree)",
    failures,
  };
}

// ---------------------------------------------------------------------------
// Check 6 — roster consistency
// ---------------------------------------------------------------------------
function checkRosterConsistency() {
  const agentsDir = path.join(CLAUDE, "agents");
  const agentNames = new Set(
    walk(agentsDir)
      .filter((f) => /^km-.*\.md$/.test(path.basename(f)))
      .map((f) => path.basename(f, ".md").toLowerCase()),
  );

  // km-lead / km-triage are commands, km-review is a workflow — not subagents.
  const NON_AGENT = new Set(["km-lead", "km-triage", "km-review"]);

  const checkRef = (name, fullMatch, filePath, lineNum) => {
    if (!NON_AGENT.has(name) && !agentNames.has(name)) {
      return { file: rel(filePath), line: lineNum, text: `referenced role "${fullMatch}" has no .claude/agents/${fullMatch}.md` };
    }
    return null;
  };

  // (a) prose references in the two command docs.
  const docs = [
    path.join(CLAUDE, "commands", "km-lead.md"),
    path.join(CLAUDE, "commands", "km-triage.md"),
  ];
  const proseFailures = docs
    .filter(existsSync)
    .flatMap((d) =>
      lines(d).flatMap((line, i) =>
        [...line.matchAll(/km-[a-zA-Z]+/g)]
          .map((m) => checkRef(m[0].toLowerCase(), m[0], d, i + 1))
          .filter(Boolean),
      ),
    );

  // (b) agentType values in the km-review workflow REVIEWERS/prompts.
  const review = path.join(CLAUDE, "workflows", "km-review.js");
  const reviewFailures = existsSync(review)
    ? lines(review).flatMap((line, i) =>
        [...line.matchAll(/agentType:\s*"(km-[^"]+)"/g)]
          .map((m) => checkRef(m[1].toLowerCase(), m[1], review, i + 1))
          .filter(Boolean),
      )
    : [];

  return {
    id: "6",
    title: "Roster consistency (every referenced km-<role> has an agent file)",
    failures: [...proseFailures, ...reviewFailures],
  };
}

// ---------------------------------------------------------------------------
// Check 7 — sentinel single spelling (.escalations/.labels-created-v2)
// ---------------------------------------------------------------------------
function checkSentinelSpelling() {
  // Match the stale form (no -v2 suffix). Negative lookahead keeps the correct
  // .labels-created-v2 spelling GREEN.
  const re = /\.escalations\/\.labels-created(?!-v2)/g;
  const roots = [CLAUDE, path.join(REPO_ROOT, "utilities", "km-triage-app")];
  const failures = roots.flatMap((root) =>
    walk(root)
      .filter((f) => /\.(md|js|cjs|mjs|ts|json|txt|sh|ps1)$/.test(f))
      .flatMap((f) => scanLines(f, re)),
  );
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
function checkDetectorsProven() {
  const testPattern = (pattern, shouldMatch, samples, label) => {
    return samples
      .map((s) => {
        pattern.lastIndex = 0;
        const matched = pattern.test(s);
        if (matched !== shouldMatch) {
          const verb = shouldMatch ? "failed to flag" : "wrongly flagged";
          return { file: "(self-test)", line: 0, text: `${label} ${verb} ${JSON.stringify(s)}` };
        }
        return null;
      })
      .filter(Boolean);
  };

  const emojiFailures = [
    ...testPattern(EMOJI, true, ["✅", "❌", "⚠️", "🤖", "✂", "✔", "✖"], "EMOJI"),
    ...testPattern(EMOJI, false, ["→", "§", "×", "—", "–", "“", "”", "'", "≥", "≤", "A1-A7"], "EMOJI"),
  ];

  const lineRefTests = [
    { text: "mirrors the crew composition at lines ~758-760 above", shouldMatch: true, desc: "'at lines ~758-760'" },
    { text: "`scan.ts` cited at line 13617 vs. real line 195 because", shouldMatch: false, desc: "the PR-#350 worked example (bare diff line numbers)" },
    { text: "baseline/ (~1000 fixtures)", shouldMatch: false, desc: "'~1000 fixtures' (an approximate count, not a line-ref)" },
  ];
  const lineRefFailures = lineRefTests
    .filter(({ text, shouldMatch }) => (lineRefMatches(text).length > 0) !== shouldMatch)
    .map(({ shouldMatch, desc }) => ({
      file: "(self-test)",
      line: 0,
      text: `line-ref detector ${shouldMatch ? "failed to flag" : "wrongly flagged"} ${desc}`,
    }));

  return { id: "0", title: "Detector self-verification (prove emoji + line-ref detectors both ways)", failures: [...emojiFailures, ...lineRefFailures] };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
function main() {
  const results = [
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
