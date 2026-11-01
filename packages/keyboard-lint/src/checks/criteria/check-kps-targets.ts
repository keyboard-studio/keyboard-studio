// Check 8.13 — KM_LINT_KPS_TARGETS_MISMATCH (spec 084 Batch 2).
//
// "Targets declared in .kmn match compiled files listed in the .kps."
// Three sources must agree:
//   1. the .kmn targets (&TARGETS, via the IR header),
//   2. the .kps declared targets (<Targets>, via parseKps),
//   3. the compiled members the .kps ships (<File> entries under
//      build/: .kmx is the desktop binary, .kvk the visual-keyboard
//      binary, .js the web/mobile build).
//
// Decidable disagreements, pinned:
//   - Declared sets differ: the .kmn target set ≠ the .kps target set
//     ("any" in either expands to every platform before comparing).
//   - Artifact/target disagreement: the .kps ships a .js build but
//     neither declared set contains a web-capable target (web, mobile,
//     or tablet); or the .kps ships a .kmx but neither declared set
//     contains a desktop target (windows, macosx, linux).
// The .kps file list comes from parseKpsFiles (engine) via
// CriteriaLintInput; the declared .kps targets likewise. When the .kps
// declares no targets at all (absent or unparseable), the assembly has
// nothing to compare — that absence is the assembly's context-missing
// case, not a finding here (this check is only called with a non-empty
// kps target list, or not called).

import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  baseNameLower,
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";

const ALL_TARGETS: readonly string[] = [
  "windows",
  "macosx",
  "linux",
  "web",
  "mobile",
  "tablet",
];
const DESKTOP_TARGETS: ReadonlySet<string> = new Set([
  "windows",
  "macosx",
  "linux",
]);
const WEB_TARGETS: ReadonlySet<string> = new Set(["web", "mobile", "tablet"]);

function expandTargets(targets: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const t of targets) {
    const token = t.toLowerCase();
    if (token === "any") {
      for (const all of ALL_TARGETS) out.add(all);
    } else {
      out.add(token);
    }
  }
  return out;
}

function setDifference(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

/** 8.13 — .kmn targets, .kps targets, and shipped compiled files disagree → finding. */
export function checkKpsTargetsMatch(input: {
  ir: KeyboardIR;
  kpsTargets: readonly string[];
  kpsFileNames: readonly string[];
  kpsPath: string;
}): CheckResult {
  const code = "KM_LINT_KPS_TARGETS_MISMATCH";
  const kmnTargets = expandTargets(input.ir.header.targets);
  const kpsTargets = expandTargets(input.kpsTargets);
  const problems: string[] = [];

  // An undeclared .kps <Targets> list (empty) is not a disagreement:
  // only the declared-set comparison is skipped, the shipped-file
  // checks below still run.
  const onlyKmn = kpsTargets.size > 0 ? setDifference(kmnTargets, kpsTargets) : [];
  const onlyKps = setDifference(kpsTargets, kmnTargets);
  if (onlyKmn.length > 0 || onlyKps.length > 0) {
    const parts: string[] = [];
    if (onlyKmn.length > 0) {
      parts.push(`in the .kmn but not the .kps: ${onlyKmn.join(", ")}`);
    }
    if (onlyKps.length > 0) {
      parts.push(`in the .kps but not the .kmn: ${onlyKps.join(", ")}`);
    }
    problems.push(`Declared targets differ (${parts.join("; ")})`);
  }

  const fileNames = input.kpsFileNames.map(baseNameLower);
  const shipsJs = fileNames.some((n) => n.endsWith(".js"));
  const shipsKmx = fileNames.some((n) => n.endsWith(".kmx"));
  const declared = new Set([...kmnTargets, ...kpsTargets]);
  if (shipsJs && ![...declared].some((t) => WEB_TARGETS.has(t))) {
    problems.push(
      "the .kps ships a compiled .js build, but neither the .kmn nor the .kps declares a web, mobile, or tablet target",
    );
  }
  if (shipsKmx && ![...declared].some((t) => DESKTOP_TARGETS.has(t))) {
    problems.push(
      "the .kps ships a compiled .kmx, but neither the .kmn nor the .kps declares a windows, macosx, or linux target",
    );
  }

  if (problems.length === 0) {
    const shipped = [
      ...(shipsJs ? [".js"] : []),
      ...(shipsKmx ? [".kmx"] : []),
    ];
    return checkPassed(code, [
      `.kmn targets: ${[...kmnTargets].sort().join(" ") || "(none)"}; .kps targets: ${[...kpsTargets].sort().join(" ") || "(none)"}; ships: ${shipped.length > 0 ? shipped.join(", ") : "no compiled builds"} — all agree.`,
    ]);
  }
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_KPS_TARGETS_MISMATCH",
      file: input.kpsPath !== "" ? input.kpsPath : kmnPath(input.ir.header.keyboardId),
      message: `Package targets do not agree: ${problems.join("; ")}.`,
      hint: "Make the .kmn &TARGETS, the .kps <Targets>, and the compiled files listed in the .kps describe the same platforms.",
    }),
  ]);
}
