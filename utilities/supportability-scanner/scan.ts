/**
 * Supportability scanner — issue #237.
 *
 * Runs the KeyboardIR codec (issue #233) over every keyboard in a
 * `keymanapp/keyboards` `release/` tree and emits a supportability summary:
 *
 *   - docs/import-corpus.json  (machine-readable; consumed by the
 *                               source-selection browser to filter the
 *                               keyboards it advertises as "import-ready")
 *   - docs/import-corpus.md    (human-readable table)
 *
 * Per spec §4 / §8 step 1 a keyboard is "import-ready" when the codec produces
 * ImportStatus.Clean or .CleanWithOpaque (no parse failure) and the I2
 * round-trip passes.
 *
 * SCOPE NOTE (#237 built on #233 only; #236 still open). The formal Layer A'
 * checks I1-I5 live in @keymanapp/kmn-validator and are NOT yet implemented
 * (issue #236). Until they land this scanner derives what the *codec alone*
 * can tell us:
 *
 *   - ImportStatus     — Clean / CleanWithOpaque / ParseFailure are exact.
 *                        RoundTripDivergence is derived from a STRUCTURAL
 *                        round-trip (parse -> emit -> parse, deep-equal of the
 *                        normalised IR), NOT the functional WASM oracle that
 *                        the contract's RoundTripDivergence is ultimately
 *                        defined by. The `i2` field records which kind ran.
 *   - opaqueFeatureInventory — the codec's `opaqueFeatures` (I4/I5 surface).
 *   - recognizedRatio  — from the pattern recognizer (issue #234).
 *
 * When #236 lands, swap `structuralRoundTrip()` for the functional I2 check and
 * fold I1/I3 into the report. The JSON shape already matches the contract
 * `ImportReport` (plus a few scanner-only diagnostic fields) so consumers do
 * not need to change.
 *
 * This is a standalone CLI (modelled on utilities/kbgen) — NOT a packages/*
 * workspace member. It imports the codec/recognizer SOURCE directly and is run
 * with tsx (the engine packages are bundler-resolved, not raw-node loadable).
 * See README.md.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { promises as fsp } from "node:fs";
import { parse, emit, normaliseForComparison } from "../../packages/engine/src/codec/index.js";
import { recognizePatterns } from "../../packages/engine/src/recognizer/index.js";
import { emitPlacementMap, detectBaseLayoutFamily } from "../../packages/engine/src/placement/index.js";
import { aggregatePlacements, computeFingerprintFromCandidates } from "../../packages/engine/src/placement/aggregate.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { ImportStatus } from "@keyboard-studio/contracts";
import type { KeyboardPlacementReport } from "../../packages/engine/src/placement/model.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface Args {
  releaseDir: string;
  outDir: string;
  limit: number | null;
  check: boolean;
  quiet: boolean;
  emitPlacements: boolean;
}

/** Read the value following a value-taking flag, erroring out if it is missing. */
function requireValue(argv: string[], i: number, flag: string): string {
  const v = argv[i];
  if (v === undefined) {
    console.error(`[ERROR] ${flag} requires a value`);
    process.exit(2);
  }
  return v;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    // Default: the sibling keymanapp/keyboards checkout (see docs/keyboard-index.md).
    releaseDir: resolve(REPO_ROOT, "..", "keyboards", "release"),
    outDir: resolve(REPO_ROOT, "docs"),
    limit: null,
    check: false,
    quiet: false,
    emitPlacements: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--release-dir":
        out.releaseDir = resolve(requireValue(argv, ++i, a));
        break;
      case "--out":
        out.outDir = resolve(requireValue(argv, ++i, a));
        break;
      case "--limit": {
        const n = Number(requireValue(argv, ++i, a));
        if (!Number.isInteger(n) || n <= 0) {
          console.error(`[ERROR] ${a} requires a positive integer`);
          process.exit(2);
        }
        out.limit = n;
        break;
      }
      case "--check":
        out.check = true;
        break;
      case "--quiet":
        out.quiet = true;
        break;
      case "--emit-placements":
        out.emitPlacements = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`[ERROR] unknown argument: ${a}`);
        printHelp();
        process.exit(2);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(
    [
      "supportability-scanner — codec + (proxy) Layer A' over release/",
      "",
      "Usage: tsx scan.ts [options]",
      "",
      "  --release-dir <path>  release/ tree to scan (default: ../keyboards/release)",
      "  --out <dir>           output directory (default: <repo>/docs)",
      "  --limit <n>           scan only the first n keyboards (dev)",
      "  --check               regenerate to a temp buffer and fail if the",
      "                        committed import-corpus.json is stale (CI mode)",
      "  --quiet               suppress per-keyboard progress",
      "  --emit-placements     also emit docs/placement-priors.json (§7.6 corpus priors)",
      "  -h, --help            show this help",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Discovery — find every .kpj and the .kmn files it references
// ---------------------------------------------------------------------------

/** Recursively collect every `.kpj` file under `dir`. */
function findKpjFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    let entries: import('node:fs').Dirent<string>[];
    try {
      entries = readdirSync(d, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        // Skip build artefacts and VCS noise.
        if (e.name === "build" || e.name === ".git" || e.name === "node_modules") continue;
        walk(full);
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".kpj")) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Extract the `.kmn` source paths a `.kpj` project references, resolved to
 * absolute paths. Falls back to `source/<id>.kmn` next to the project when the
 * project lists no `.kmn` File entry.
 */
function kmnPathsForProject(kpjPath: string): string[] {
  const dir = dirname(kpjPath);
  let xml = "";
  try {
    xml = readFileSync(kpjPath, "utf8");
  } catch {
    return [];
  }
  const paths: string[] = [];
  // <Filepath>source\foo.kmn</Filepath> — Windows-style separators in the file.
  const re = /<Filepath>([^<]*\.kmn)<\/Filepath>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const rel = (m[1] ?? "").replace(/\\/g, "/");
    paths.push(resolve(dir, rel));
  }
  if (paths.length === 0) {
    const id = basename(kpjPath, ".kpj");
    const guess = resolve(dir, "source", `${id}.kmn`);
    if (existsSync(guess)) paths.push(guess);
  }
  // De-dup while preserving order.
  return [...new Set(paths)];
}

// ---------------------------------------------------------------------------
// I2 structural round-trip (proxy until #236 lands the functional WASM check)
// ---------------------------------------------------------------------------

type I2Result = "structural-pass" | "structural-divergence" | "error";

function structuralRoundTrip(ir: KeyboardIR, keyboardId: string): I2Result {
  try {
    const emitted = emit(ir);
    const { ir: ir2 } = parse(emitted, keyboardId);
    const a = JSON.stringify(normaliseForComparison(ir));
    const b = JSON.stringify(normaliseForComparison(ir2));
    return a === b ? "structural-pass" : "structural-divergence";
  } catch {
    return "error";
  }
}

// ---------------------------------------------------------------------------
// Report shape — superset of contract ImportReport
// ---------------------------------------------------------------------------

/** One opaque-feature reason and how many times it occurred. */
type OpaqueEntry = { feature: string; count: number };

interface ScanReport {
  keyboardId: string;
  /** repo-relative path of the scanned .kmn (diagnostic). */
  source: string;
  status: ImportStatus;
  parseErrors: string[];
  opaqueFeatureInventory: OpaqueEntry[];
  recognizedRatio: number;
  /** scanner-only: which round-trip kind produced the status. */
  i2: I2Result | "n/a";
  /** scanner-only: typed-rule and group counts (corpus diagnostics). */
  ruleCount: number;
  groupCount: number;
  rawFragmentCount: number;
}

// ---------------------------------------------------------------------------
// Placement helpers (--emit-placements support, spec §7.6)
// ---------------------------------------------------------------------------

/**
 * Detect the base keyboard layout family from the unshifted letter layer.
 *
 * Heuristic: compare K_Q/K_A/K_Z outputs against known families:
 *   QWERTY  q/a/z, AZERTY  a/q/w, QWERTZ  q/a/y
 */
// detectBaseLayoutFamily and computeFingerprint are provided by the placement module.

/**
 * Scan one .kmn file.  Returns the scan report and, optionally, the parsed IR
 * for downstream passes (e.g. --emit-placements).  When parsing fails, ir is
 * null.
 */
function scanOne(
  kmnPath: string,
  releaseDir: string,
): { report: ScanReport; ir: KeyboardIR | null } {
  const keyboardId = basename(kmnPath, ".kmn");
  const source = relative(releaseDir, kmnPath).replace(/\\/g, "/");
  const base: ScanReport = {
    keyboardId,
    source,
    status: ImportStatus.ParseFailure,
    parseErrors: [],
    opaqueFeatureInventory: [],
    recognizedRatio: 0,
    i2: "n/a",
    ruleCount: 0,
    groupCount: 0,
    rawFragmentCount: 0,
  };

  let text: string;
  try {
    text = readFileSync(kmnPath, "utf8");
  } catch (err) {
    base.parseErrors = [`cannot read source: ${(err as Error).message}`];
    return { report: base, ir: null };
  }

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(text, keyboardId);
  } catch (err) {
    base.parseErrors = [(err as Error).message];
    return { report: base, ir: null }; // ImportStatus.ParseFailure
  }

  const { ir, opaqueFeatures } = parsed;
  base.opaqueFeatureInventory = [...opaqueFeatures].sort((a, b) =>
    a.feature.localeCompare(b.feature),
  );
  base.groupCount = ir.groups.length;
  base.ruleCount = ir.groups.reduce((s, g) => s + g.rules.length, 0);
  base.rawFragmentCount = ir.raw.length;

  try {
    base.recognizedRatio = recognizePatterns(ir).recognizedRatio;
  } catch {
    // Recognizer failure is non-fatal; leave ratio at 0.
  }

  const i2 = structuralRoundTrip(ir, keyboardId);
  base.i2 = i2;

  if (i2 === "structural-divergence" || i2 === "error") {
    // A throwing emit/re-parse is a round-trip failure, not a clean import:
    // the codec could not reproduce the IR, so the keyboard is NOT import-ready.
    base.status = ImportStatus.RoundTripDivergence;
  } else if (base.rawFragmentCount > 0 || base.opaqueFeatureInventory.length > 0) {
    base.status = ImportStatus.CleanWithOpaque;
  } else {
    base.status = ImportStatus.Clean;
  }
  return { report: base, ir };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

const STATUS_ORDER: ImportStatus[] = [
  ImportStatus.Clean,
  ImportStatus.CleanWithOpaque,
  ImportStatus.RoundTripDivergence,
  ImportStatus.ParseFailure,
];

function sortReports(reports: ScanReport[]): ScanReport[] {
  return [...reports].sort((a, b) => {
    const sa = STATUS_ORDER.indexOf(a.status);
    const sb = STATUS_ORDER.indexOf(b.status);
    if (sa !== sb) return sa - sb;
    return a.keyboardId.localeCompare(b.keyboardId);
  });
}

function summarise(reports: ScanReport[]): Record<ImportStatus, number> {
  // Initialise every status to 0 from the enum so a newly added ImportStatus
  // value can't silently produce NaN counts.
  const counts = Object.fromEntries(
    Object.values(ImportStatus).map((s) => [s, 0]),
  ) as Record<ImportStatus, number>;
  for (const r of reports) counts[r.status]++;
  return counts;
}

/** Aggregate opaque-feature counts across the whole corpus (I4 inventory). */
function aggregateOpaque(reports: ScanReport[]): OpaqueEntry[] {
  const acc = new Map<string, number>();
  for (const r of reports) {
    for (const o of r.opaqueFeatureInventory) {
      acc.set(o.feature, (acc.get(o.feature) ?? 0) + o.count);
    }
  }
  return [...acc.entries()]
    .map(([feature, count]) => ({ feature, count }))
    .sort((a, b) => b.count - a.count || a.feature.localeCompare(b.feature));
}

/**
 * Build the deterministic JSON payload. Deliberately contains NO wall-clock
 * timestamp so `--check` can diff it byte-for-byte against the committed file.
 */
function buildJson(sorted: ScanReport[], opaqueTotals: OpaqueEntry[]): string {
  const payload = {
    schema: "import-corpus/v1",
    note:
      "Generated by utilities/supportability-scanner (issue #237). I2 is a " +
      "STRUCTURAL round-trip proxy; the functional WASM oracle check arrives " +
      "with Layer A' (issue #236).",
    totals: {
      keyboards: sorted.length,
      ...summarise(sorted),
    },
    opaqueFeatureTotals: opaqueTotals,
    keyboards: sorted,
  };
  return JSON.stringify(payload, null, 2) + "\n";
}

function fmtRatio(r: number): string {
  return r.toFixed(2);
}

function fmtOpaque(inv: OpaqueEntry[]): string {
  if (inv.length === 0) return "—";
  return inv.map((o) => `${o.feature}×${o.count}`).join(", ");
}

function buildMarkdown(sorted: ScanReport[], opaque: OpaqueEntry[]): string {
  const counts = summarise(sorted);
  const total = sorted.length;
  const importable = counts[ImportStatus.Clean] + counts[ImportStatus.CleanWithOpaque];
  const pct = (n: number): string => (total === 0 ? "0" : ((100 * n) / total).toFixed(1));

  const lines: string[] = [];
  lines.push("# Import corpus — supportability scan");
  lines.push("");
  lines.push(
    "Generated by [utilities/supportability-scanner](../utilities/supportability-scanner/) " +
      "(issue #237). Do not edit by hand — run the scanner to regenerate.",
  );
  lines.push("");
  lines.push(
    "> **I2 is a structural round-trip proxy.** The codec (#233) is the only " +
      "dependency wired in; the functional WASM oracle round-trip and the " +
      "formal Layer A' checks I1-I5 arrive with #236. The `I2` column reports " +
      "`structural-pass` / `structural-divergence`, not the functional result.",
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Keyboards scanned:** ${total}`);
  lines.push(
    `- **Import-ready** (Clean + CleanWithOpaque): **${importable}** (${pct(importable)}%)`,
  );
  lines.push(`- Clean: ${counts[ImportStatus.Clean]} (${pct(counts[ImportStatus.Clean])}%)`);
  lines.push(
    `- CleanWithOpaque: ${counts[ImportStatus.CleanWithOpaque]} (${pct(counts[ImportStatus.CleanWithOpaque])}%)`,
  );
  lines.push(
    `- RoundTripDivergence (structural): ${counts[ImportStatus.RoundTripDivergence]} (${pct(counts[ImportStatus.RoundTripDivergence])}%)`,
  );
  lines.push(
    `- ParseFailure: ${counts[ImportStatus.ParseFailure]} (${pct(counts[ImportStatus.ParseFailure])}%)`,
  );
  lines.push("");

  // Corpus-wide opaque-feature inventory (resolves #232 open question 4).
  lines.push("## Opaque-feature inventory (corpus-wide)");
  lines.push("");
  lines.push(
    "Complete `RawKmnFragment` boundary list across `release/` — the input to " +
      "#232 open question 4.",
  );
  lines.push("");
  if (opaque.length === 0) {
    lines.push("_No opaque features encountered._");
  } else {
    lines.push("| Opaque feature | Total occurrences |");
    lines.push("| --- | ---: |");
    for (const o of opaque) lines.push(`| \`${o.feature}\` | ${o.count} |`);
  }
  lines.push("");

  lines.push("## Per-keyboard");
  lines.push("");
  lines.push(
    "| Keyboard ID | ImportStatus | recognizedRatio | Opaque count | I2 (structural) | I4 opaque inventory |",
  );
  lines.push("| --- | --- | ---: | ---: | --- | --- |");
  for (const r of sorted) {
    const opaqueCount = r.opaqueFeatureInventory.reduce((s, o) => s + o.count, 0);
    lines.push(
      `| \`${r.keyboardId}\` | ${r.status} | ${fmtRatio(r.recognizedRatio)} | ${opaqueCount} | ${r.i2} | ${fmtOpaque(r.opaqueFeatureInventory)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Provenance helper
// ---------------------------------------------------------------------------

/**
 * Resolve the git SHA of the keyboards checkout for provenance. Returns
 * "keymanapp/keyboards@<sha>" or "keymanapp/keyboards@unknown" if the SHA
 * cannot be determined (not a git checkout, git unavailable, etc).
 */
function resolveKeyboardsProvenance(releaseDir: string): string {
  try {
    const root = dirname(releaseDir);
    const sha = execSync("git rev-parse HEAD", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return sha ? `keymanapp/keyboards@${sha}` : "keymanapp/keyboards@unknown";
  } catch {
    return "keymanapp/keyboards@unknown";
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(args.releaseDir)) {
    console.error(`[ERROR] release dir not found: ${args.releaseDir}`);
    console.error("        Point --release-dir at a keymanapp/keyboards release/ tree.");
    process.exit(2);
  }

  const t0 = process.hrtime.bigint();
  const kpjFiles = findKpjFiles(args.releaseDir);
  if (!args.quiet) console.error(`[OK] found ${kpjFiles.length} .kpj projects`);

  const reports: ScanReport[] = [];
  const placementReports: KeyboardPlacementReport[] = [];

  // A single .kmn can be referenced by more than one .kpj — the aggregate
  // bundle projects under release/packages/ point at .kmn files that also have
  // their own standalone project. Scan each physical file exactly once.
  const seenKmn = new Set<string>();
  let scanned = 0;
  for (const kpj of kpjFiles) {
    if (args.limit != null && scanned >= args.limit) break;
    for (const kmn of kmnPathsForProject(kpj)) {
      if (args.limit != null && scanned >= args.limit) break;
      if (seenKmn.has(kmn) || !existsSync(kmn)) continue;
      seenKmn.add(kmn);
      const { report, ir } = scanOne(kmn, args.releaseDir);
      reports.push(report);

      // --emit-placements: extract placement candidates from the parsed IR.
      if (args.emitPlacements && ir !== null) {
        try {
          const candidatesByCodepoint = emitPlacementMap(ir);
          if (candidatesByCodepoint.size > 0) {
            const flat = [...candidatesByCodepoint.values()].flat();
            placementReports.push({
              keyboardId: report.keyboardId,
              bcp47: ir.header.bcp47,
              baseLayoutFamily: detectBaseLayoutFamily(ir),
              candidatesByCodepoint,
              placementFingerprint: computeFingerprintFromCandidates(flat),
            });
          }
        } catch {
          // Placement extraction is non-fatal; continue.
        }
      }

      scanned++;
      if (!args.quiet && scanned % 100 === 0) {
        console.error(`[..] ${scanned} keyboards scanned`);
      }
    }
  }

  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  // Sort and aggregate once; both builders consume the result.
  const sorted = sortReports(reports);
  const opaqueTotals = aggregateOpaque(sorted);
  const json = buildJson(sorted, opaqueTotals);
  const md = buildMarkdown(sorted, opaqueTotals);

  const jsonPath = join(args.outDir, "import-corpus.json");
  const mdPath = join(args.outDir, "import-corpus.md");

  if (args.check) {
    const existing = existsSync(jsonPath) ? readFileSync(jsonPath, "utf8") : "";
    if (existing !== json) {
      console.error("[ERROR] docs/import-corpus.json is stale relative to current codec output.");
      console.error("        Re-run the scanner and commit the regenerated docs/import-corpus.{md,json}:");
      console.error(
        "        TSX_TSCONFIG_PATH=utilities/supportability-scanner/tsconfig.json \\\n" +
          `          pnpm dlx tsx utilities/supportability-scanner/scan.ts --release-dir ${args.releaseDir}`,
      );
      process.exit(1);
    }
    console.error(`[OK] import-corpus.json is up to date (${reports.length} keyboards).`);
    return;
  }

  mkdirSync(args.outDir, { recursive: true });
  writeFileSync(jsonPath, json, "utf8");
  writeFileSync(mdPath, md, "utf8");

  // --emit-placements: aggregate and write placement-priors.json.
  if (args.emitPlacements) {
    const priorsJSON = aggregatePlacements(placementReports, {
      generatedFrom: resolveKeyboardsProvenance(args.releaseDir),
    });
    const priorsPath = join(args.outDir, "placement-priors.json");
    await fsp.writeFile(priorsPath, JSON.stringify(priorsJSON, null, 2) + "\n", "utf8");
    console.error(
      `[OK] placement-priors.json written (${placementReports.length} keyboards with candidates) -> ${relative(REPO_ROOT, priorsPath).replace(/\\/g, "/")}`,
    );
  }

  const counts = summarise(reports);
  console.error(
    `[OK] scanned ${reports.length} keyboards in ${(elapsedMs / 1000).toFixed(1)}s -> ${relative(REPO_ROOT, jsonPath).replace(/\\/g, "/")}`,
  );
  console.error(
    `     Clean ${counts[ImportStatus.Clean]} | CleanWithOpaque ${counts[ImportStatus.CleanWithOpaque]} | ` +
      `RoundTripDivergence ${counts[ImportStatus.RoundTripDivergence]} | ParseFailure ${counts[ImportStatus.ParseFailure]}`,
  );
}

main().catch((err: unknown) => {
  console.error("[ERROR]", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
