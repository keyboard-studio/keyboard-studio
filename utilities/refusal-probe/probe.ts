/**
 * Refusal-rate corpus probe — spec 104 T026.
 *
 * Runs the Wave 2 severance transplant (engine `severTouchKey`, FR-008)
 * over every K_-linked touch key of every corpus keyboard that ships a
 * touch layout, and reports how often the transplant REFUSES, and why
 * (the binding cause in the record's `refusalBinding` text). This is the
 * evidence base for sizing the Track 2 (Adapt) choice UX (plan.md Risks:
 * "T026's refusal rate sets how often the collapsed choice is the only
 * choice an Adapt author sees") — it is NOT a gate: a completed scan
 * exits 0 whatever the rate; scanning nothing exits 2, per the
 * roundtrip-probe convention (a probe that examined no keyboards must
 * never look like a pass).
 *
 * Method, per keyboard:
 *   - parse the .kmn with the real codec; parse the .keyman-touch-layout;
 *   - enumerate the distinct K_-linked touch keys per platform (anchored
 *     at the first layer, in layout order, that carries the key);
 *   - for each, attempt the transplant onto a fresh probe id under the
 *     DEFAULT policy, and — when the opaque-fragment gate is what refused
 *     it — again with `opaqueAcknowledged: true`, so the report separates
 *     "refused because the keyboard carries opaque fragments the author
 *     has not acknowledged" from the binding cause behind the gate;
 *   - the transplant is pure (it returns new IR/layout), so attempts do
 *     not disturb each other or the corpus.
 *
 * Run (from the repo root):
 *   TSX_TSCONFIG_PATH=utilities/refusal-probe/tsconfig.json \
 *     pnpm dlx tsx utilities/refusal-probe/probe.ts [keyboards-root ...]
 *
 * Roots default to the sibling `keyboards/release` checkout (the repo's
 * corpus convention: `keyboards/` beside the keyboard-studio checkout).
 * Each root is scanned recursively for `source/*.kmn` with a sibling
 * `*.keyman-touch-layout`. Reports land beside this file as
 * `refusal-report.md` / `refusal-report.json`.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTouchKeyRuleIndex, parseTouchLayoutString } from "@keyboard-studio/contracts";
import { parse } from "../../packages/engine/src/codec/index.ts";
import { severTouchKey } from "../../packages/engine/src/pattern-apply/severTouchKey.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const RECORDED_AT = 0; // probe records are evidence, never persisted anywhere

// ---------------------------------------------------------------------------
// Refusal causes — classified from the transplant record's refusalBinding
// text (the raw text is kept in the JSON report; these buckets are for the
// headline counts).
// ---------------------------------------------------------------------------

type RefusalCause =
  | "opaque-fragments"
  | "shared-store"
  | "deadkey-binding"
  | "target-collision"
  | "group-placement"
  | "not-present"
  | "emulation"
  | "unclassified-source"
  | "other";

function classifyRefusal(binding: string): RefusalCause {
  if (binding.includes("opaque fragments present")) return "opaque-fragments";
  if (binding.includes("shared store")) return "shared-store";
  if (binding.includes("deadkey(")) return "deadkey-binding";
  if (binding.includes("already names an existing")) return "target-collision";
  if (binding.includes("no writable group") || binding.includes("appears before")) {
    return "group-placement";
  }
  if (binding.includes("is not present")) return "not-present";
  if (binding.includes("emulation-class")) return "emulation";
  if (binding.includes("cannot be classified")) return "unclassified-source";
  return "other";
}

// ---------------------------------------------------------------------------
// Corpus discovery
// ---------------------------------------------------------------------------

interface KeyboardFiles {
  readonly keyboardId: string;
  readonly kmnPath: string;
  readonly layoutPath: string | null;
}

function discoverKeyboards(root: string): KeyboardFiles[] {
  const out: KeyboardFiles[] = [];
  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const p = join(dir, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(p);
      } else if (st.isFile() && name.endsWith(".kmn") && p.split(sep).includes("source")) {
        const layoutName = `${basename(name, ".kmn")}.keyman-touch-layout`;
        const layoutPath = join(dir, layoutName);
        out.push({
          keyboardId: basename(name, ".kmn"),
          kmnPath: p,
          layoutPath: existsSync(layoutPath) ? layoutPath : null,
        });
      }
    }
  }
  walk(root);
  return out;
}

// ---------------------------------------------------------------------------
// Per-keyboard probe
// ---------------------------------------------------------------------------

interface KeyAttempt {
  readonly platformId: string;
  readonly anchorLayerId: string;
  readonly sourceId: string;
  readonly outcome: "completed" | "refused";
  /** Cause under the default policy, when refused. */
  readonly cause?: RefusalCause;
  readonly refusalBinding?: string;
  /** With opaque fragments acknowledged: outcome + cause, when different. */
  readonly acknowledgedOutcome?: "completed" | "refused";
  readonly acknowledgedCause?: RefusalCause;
  readonly acknowledgedRefusalBinding?: string;
}

interface KeyboardReport {
  readonly keyboardId: string;
  readonly kmnPath: string;
  readonly status: "probed" | "no-touch-layout" | "parse-error";
  readonly error?: string;
  readonly linkedKeys: number;
  readonly completed: number;
  readonly refused: number;
  readonly attempts: KeyAttempt[];
}

function probeKeyboard(files: KeyboardFiles): KeyboardReport {
  const base: Omit<KeyboardReport, "status"> = {
    keyboardId: files.keyboardId,
    kmnPath: files.kmnPath,
    linkedKeys: 0,
    completed: 0,
    refused: 0,
    attempts: [],
  };
  if (files.layoutPath === null) return { ...base, status: "no-touch-layout" };

  let ir;
  let layout;
  try {
    ir = parse(readFileSync(files.kmnPath, "utf8"), files.keyboardId).ir;
    layout = parseTouchLayoutString(readFileSync(files.layoutPath, "utf8"));
  } catch (err) {
    return {
      ...base,
      status: "parse-error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
  ir.touchLayout = layout;
  const ruleIndex = buildTouchKeyRuleIndex(ir);

  // Distinct K_-linked keys per platform, anchored at the first layer
  // (layout order) carrying the key — one transplant attempt per key, the
  // way an author severing that key would meet it.
  const attempts: KeyAttempt[] = [];
  let probeSeq = 0;
  for (const platform of layout.platforms) {
    const seen = new Map<string, string>(); // keyId -> anchorLayerId
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          if (key.id.startsWith("K_") && !seen.has(key.id)) seen.set(key.id, layer.id);
        }
      }
    }
    for (const [sourceId, anchorLayerId] of seen) {
      probeSeq += 1;
      const targetId = `T_PROBE${probeSeq}`;
      const attempt: {
        -readonly [K in keyof KeyAttempt]: KeyAttempt[K];
      } = { platformId: platform.id, anchorLayerId, sourceId, outcome: "completed" };
      const result = severTouchKey(ir, layout, ruleIndex, {
        sourceId,
        targetId,
        platformId: platform.id,
        anchorLayerId,
        recordedAt: RECORDED_AT,
      });
      if (result.record.outcome === "refused") {
        attempt.outcome = "refused";
        attempt.refusalBinding = result.record.refusalBinding ?? "";
        attempt.cause = classifyRefusal(attempt.refusalBinding);
        if (attempt.cause === "opaque-fragments") {
          const ack = severTouchKey(ir, layout, ruleIndex, {
            sourceId,
            targetId,
            platformId: platform.id,
            anchorLayerId,
            recordedAt: RECORDED_AT,
            opaqueAcknowledged: true,
          });
          attempt.acknowledgedOutcome = ack.record.outcome;
          if (ack.record.outcome === "refused") {
            attempt.acknowledgedRefusalBinding = ack.record.refusalBinding ?? "";
            attempt.acknowledgedCause = classifyRefusal(attempt.acknowledgedRefusalBinding);
          }
        }
      }
      attempts.push(attempt as KeyAttempt);
    }
  }

  return {
    ...base,
    status: "probed",
    linkedKeys: attempts.length,
    completed: attempts.filter((a) => a.outcome === "completed").length,
    refused: attempts.filter((a) => a.outcome === "refused").length,
    attempts,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const argRoots = process.argv.slice(2);
  const defaultRoot = resolve(HERE, "../../../keyboards/release");
  const roots = argRoots.length > 0 ? argRoots.map((r) => resolve(r)) : [defaultRoot];

  const keyboards: KeyboardFiles[] = [];
  for (const root of roots) {
    if (!existsSync(root)) {
      console.error(`[refusal-probe] root not found: ${root}`);
      continue;
    }
    keyboards.push(...discoverKeyboards(root));
  }
  if (keyboards.length === 0) {
    console.error("[refusal-probe] no keyboards scanned — exiting 2 (never a vacuous pass)");
    process.exit(2);
  }

  const reports = keyboards.map(probeKeyboard);
  const probed = reports.filter((r) => r.status === "probed");
  const totalKeys = probed.reduce((n, r) => n + r.linkedKeys, 0);
  const totalCompleted = probed.reduce((n, r) => n + r.completed, 0);
  const totalRefused = probed.reduce((n, r) => n + r.refused, 0);

  const causeCounts = new Map<string, number>();
  let acknowledgedCompleted = 0;
  for (const report of probed) {
    for (const attempt of report.attempts) {
      if (attempt.outcome !== "refused") continue;
      const cause =
        attempt.cause === "opaque-fragments" && attempt.acknowledgedOutcome === "refused"
          ? (attempt.acknowledgedCause ?? "other")
          : (attempt.cause ?? "other");
      if (attempt.cause === "opaque-fragments" && attempt.acknowledgedOutcome === "completed") {
        acknowledgedCompleted += 1;
        causeCounts.set("opaque-fragments (passes once acknowledged)", (causeCounts.get("opaque-fragments (passes once acknowledged)") ?? 0) + 1);
      } else {
        causeCounts.set(cause, (causeCounts.get(cause) ?? 0) + 1);
      }
    }
  }

  const refusalRate = totalKeys > 0 ? totalRefused / totalKeys : 0;
  // Emulation-class keys (K_BKSP, K_ENTER, K_LOPT, …) refuse BY DESIGN —
  // the criteria never propose severing them (their production source is
  // "emulation", contracts §1) — so the rate that sizes the Track 2 UX is
  // the one over genuine severance candidates: all linked keys minus the
  // emulation refusals, which is every emulation key (severance refuses
  // them all). Both rates are reported; neither is hidden.
  const emulationRefusals = probed.reduce(
    (n, r) => n + r.attempts.filter((a) => a.cause === "emulation").length,
    0,
  );
  const candidateKeys = totalKeys - emulationRefusals;
  const candidateRefused = totalRefused - emulationRefusals;
  const candidateRefusalRate = candidateKeys > 0 ? candidateRefused / candidateKeys : 0;
  const summary = {
    generatedAt: new Date().toISOString(),
    roots,
    keyboardsFound: keyboards.length,
    keyboardsProbed: probed.length,
    keyboardsNoTouchLayout: reports.filter((r) => r.status === "no-touch-layout").length,
    keyboardsParseError: reports.filter((r) => r.status === "parse-error").length,
    linkedKeys: totalKeys,
    completed: totalCompleted,
    refused: totalRefused,
    refusalRate,
    emulationRefusals,
    candidateKeys,
    candidateRefused,
    candidateRefusalRate,
    refusedButCompletesWhenOpaqueAcknowledged: acknowledgedCompleted,
    causeCounts: Object.fromEntries(causeCounts),
  };

  writeFileSync(
    join(HERE, "refusal-report.json"),
    `${JSON.stringify({ summary, keyboards: reports }, null, 2)}\n`,
  );

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const md: string[] = [
    "# Spec 104 T026 — severance refusal-rate probe",
    "",
    `Generated: ${summary.generatedAt}`,
    `Corpus roots: ${roots.join(", ")}`,
    "",
    "## Coverage (read this first)",
    "",
    `Keyboards found: ${summary.keyboardsFound}; probed (kmn + touch layout parsed): ${summary.keyboardsProbed}; ` +
      `no touch layout: ${summary.keyboardsNoTouchLayout}; parse errors: ${summary.keyboardsParseError}.`,
    "This run covers ONLY the keyboards present in the roots above. The full",
    "keymanapp/keyboards corpus (962 touch layouts in the spec 104 research",
    "census) is not checked out on this machine — the local checkout is a",
    "partial one — so these rates size the Track 2 UX for the keyboards at",
    "hand and MUST be re-run against a full corpus checkout before they are",
    "treated as corpus-wide.",
    "",
    "## Headline",
    "",
    // The candidate rate is the headline figure: it is the rate over keys
    // that are genuine severance candidates. The raw rate over ALL requests
    // is context only — it counts arm-0-holds cases (emulation-class keys,
    // refused by design and never candidates) and overstates severity when
    // read alone.
    `**Candidate refusal rate: ${pct(candidateRefusalRate)}** — ${candidateRefused} of ${candidateKeys} genuine severance candidates refused (default policy).`,
    `- Of the candidate refusals, completed once opaque fragments were acknowledged: ${acknowledgedCompleted}`,
    "",
    "Context (all requests, including cases that never needed severance):",
    `- K_-linked touch keys attempted: ${totalKeys}`,
    `- Transplants completed: ${totalCompleted} (${pct(totalKeys ? totalCompleted / totalKeys : 0)})`,
    `- Transplants refused (default policy): ${totalRefused} (${pct(refusalRate)})`,
    `- Emulation-class keys among the refusals (K_BKSP/K_ENTER/K_LOPT — refused by design, never severance candidates): ${emulationRefusals}`,
    "",
    "## Refusal causes (binding, behind the opaque gate where it applied)",
    "",
    ...[...causeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cause, n]) => `- ${cause}: ${n}`),
    "",
    "## Per keyboard",
    "",
    "| keyboard | linked keys | completed | refused | refusal rate |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...probed.map(
      (r) =>
        `| ${r.keyboardId} | ${r.linkedKeys} | ${r.completed} | ${r.refused} | ${pct(r.linkedKeys ? r.refused / r.linkedKeys : 0)} |`,
    ),
    "",
    "Full per-key detail (including the verbatim refusalBinding text) is in",
    "refusal-report.json beside this file.",
    "",
  ];
  writeFileSync(join(HERE, "refusal-report.md"), md.join("\n"));

  console.log(
    `[refusal-probe] keyboards: ${summary.keyboardsProbed}/${summary.keyboardsFound} probed; ` +
      `linked keys: ${totalKeys}; completed: ${totalCompleted}; refused: ${totalRefused} (${pct(refusalRate)}); ` +
      `candidates refused: ${candidateRefused}/${candidateKeys} (${pct(candidateRefusalRate)})`,
  );
  console.log(`[refusal-probe] causes: ${JSON.stringify(summary.causeCounts)}`);
  console.log(`[refusal-probe] reports: ${join(HERE, "refusal-report.md")}, ${join(HERE, "refusal-report.json")}`);
}

main();
