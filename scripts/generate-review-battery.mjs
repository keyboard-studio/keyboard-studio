// generate-review-battery.mjs — the /review battery's auto-update mechanism.
//
// The health-check battery is COMPUTED, never hand-listed: this script reads
// the single sources of truth —
//   - packages/contracts/data/criteria.json   (the 149-row catalog)
//   - packages/studio/src/criteria/implementedChecks.ts  (IMPLEMENTED_LINT_CODES)
//   - packages/studio/src/criteria/precertify.ts  (PRECERTIFIED_LINT_CODES)
//   - packages/keyboard-lint/src/checks/**/check-*.ts  (`code: "KM_…"` literals)
// — and emits packages/studio/src/review/battery.generated.json.
//
// Adding a consistency check later = implement the check + map its lintRuleId
// in criteria.json + register the code in implementedChecks.ts (+ wire it into
// runCriteriaChecks/runDocChecks). Re-run this script; the drift test
// (battery.drift.test.ts) fails CI until the checked-in JSON is regenerated.
// The /review UI itself needs zero edits: resolveCriteria walks the whole
// catalog, so a new row appears automatically.
//
// Usage:
//   node scripts/generate-review-battery.mjs [--md | --json]
// --md prints a markdown table (for the design doc) instead of writing JSON.
// --json prints the battery JSON to stdout (used by the drift test).

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function stringLiterals(src, varName) {
  // Extract the string literals inside `const <varName> = new Set([...])`.
  const m = src.match(new RegExp(`${varName}[^=]*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`));
  if (!m) return new Set();
  return new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

/** code: "KM_…" / const code = "KM_…" literals per check file (the drift-guard scanner method). */
function scanCheckCodes() {
  const dir = join(ROOT, "packages/keyboard-lint/src/checks");
  const byCode = new Map();
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const abs = join(d, name);
      if (statSync(abs).isDirectory()) {
        if (name !== "fixtures") walk(abs);
        continue;
      }
      if (!name.endsWith(".ts") || name.endsWith(".test.ts") || name.startsWith("_shared")) continue;
      const text = readFileSync(abs, "utf8");
      for (const m of text.matchAll(/code(?::|\s*=)\s*"(KM_(?:LINT|WARN|HINT|ERROR)_[A-Z0-9_]+)"/g)) {
        const rel = abs.slice(ROOT.length + 1).replaceAll("\\", "/");
        if (!byCode.has(m[1])) byCode.set(m[1], []);
        if (!byCode.get(m[1]).includes(rel)) byCode.get(m[1]).push(rel);
      }
    }
  };
  walk(dir);
  return byCode;
}

export function generateBattery(rootDir = ROOT) {
  const criteria = JSON.parse(
    readFileSync(join(rootDir, "packages/contracts/data/criteria.json"), "utf8"),
  );
  const implementedSrc = readFileSync(
    join(rootDir, "packages/studio/src/criteria/implementedChecks.ts"), "utf8",
  );
  const precertSrc = readFileSync(
    join(rootDir, "packages/studio/src/criteria/precertify.ts"), "utf8",
  );
  const implemented = stringLiterals(implementedSrc, "IMPLEMENTED_LINT_CODES");
  const precertified = stringLiterals(precertSrc, "PRECERTIFIED_LINT_CODES");
  const checkFiles = scanCheckCodes();

  const rows = criteria.map((c) => {
    const hook =
      c.band === "scaffolder-bake" ? { kind: "scaffolderRule", id: c.scaffolderRule }
      : c.band === "layer-c-enforce" ? { kind: "lintRuleId", id: c.lintRuleId }
      : c.band === "yellow-survey" ? { kind: "surveyQuestionId", id: c.surveyQuestionId }
      : { kind: "preSubmitChecklistText", id: undefined };
    const row = {
      id: c.id,
      band: c.band,
      section: c.section,
      description: c.description,
      hook,
    };
    if (c.band === "layer-c-enforce") {
      row.implemented = implemented.has(c.lintRuleId);
      row.precertified = precertified.has(c.lintRuleId);
      row.checkFiles = checkFiles.get(c.lintRuleId) ?? [];
    }
    return row;
  });

  const byBand = {};
  for (const r of rows) byBand[r.band] = (byBand[r.band] ?? 0) + 1;
  const layerC = rows.filter((r) => r.band === "layer-c-enforce");
  return {
    generatedAt: new Date().toISOString(),
    catalogSize: rows.length,
    byBand,
    implementedCount: layerC.filter((r) => r.implemented).length,
    notImplemented: layerC.filter((r) => !r.implemented).map((r) => r.id),
    precertified: [...precertified].sort(),
    criteria: rows,
  };
}

function toMarkdown(battery) {
  const lines = ["| id | band | hook | status |", "|---|---|---|---|"];
  for (const r of battery.criteria) {
    let status;
    if (r.band === "layer-c-enforce") {
      status = r.implemented
        ? (r.precertified ? "implemented · precertified (runs in /review)" : "implemented")
        : "not implemented";
    } else if (r.band === "scaffolder-bake") {
      status = "post-hoc check per §4 groups";
    } else {
      status = "needs human";
    }
    lines.push(`| ${r.id} | ${r.band} | ${r.hook.kind}=${r.hook.id ?? "—"} | ${status} |`);
  }
  return lines.join("\n");
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const battery = generateBattery();
  if (process.argv.includes("--md")) {
    console.log(toMarkdown(battery));
  } else if (process.argv.includes("--json")) {
    console.log(JSON.stringify(battery));
  } else {
    const out = join(ROOT, "packages/studio/src/review/battery.generated.json");
    writeFileSync(out, JSON.stringify(battery, null, 1) + "\n");
    console.log(
      `wrote ${out}: ${battery.catalogSize} criteria, ` +
      `${battery.implementedCount} implemented layer-c checks`,
    );
  }
}
