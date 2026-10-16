/**
 * Layer A' import-fidelity checks (I1–I6).
 *
 * Each exported function follows the one-function-per-check convention used
 * by packages/engine/src/validator/checks/*.ts: accepts relevant inputs,
 * returns LintFinding[]. No I/O side effects except where explicitly noted
 * (I2 logs corpus size via devLog, matching the pattern in
 * packages/engine/src/compiler/index.ts, and runs its injected compile /
 * simulate harness).
 *
 * Layer A' MAY emit "info" for I4 only (opaque-feature inventory, non-blocking).
 *
 * Keep this file out of the runAllChecks path — it must never be imported by
 * packages/engine/src/validator/index.ts.
 */

import { devLog } from "@keyboard-studio/contracts/dev-log";
import type {
  CompileResult,
  KeyChord,
  LintFinding,
  KeyboardIR,
  IRRule,
  SimKeyInput,
  SimulationResult,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { createVirtualFS, isValidTouchKeyIdentifier } from "@keyboard-studio/contracts";
import type { ParseResult } from "../codec/parse.js";
import { tokenize } from "../codec/tokenize.js";
import { computeSha256Hex } from "../codec/hash.js";
import { generateCorpus } from "./corpus.js";

// ---------------------------------------------------------------------------
// I1 — Parse completeness
// ---------------------------------------------------------------------------

/**
 * I1: Verify that every meaningful source token maps to at least one IR node
 * (typed or RawKmnFragment). Detects silent drops by the codec.
 *
 * Heuristic: tokenize the source text with the codec tokenizer (which the
 * parser also uses) and count non-blank, non-comment tokens. Then count the
 * total IR nodes (stores + groups × their rules + raw fragments + begin
 * directive implied by groups). If IR-node count < source-token count we
 * report ONE aggregate finding describing the total number of unaccounted
 * tokens (not one finding per token).
 *
 * Limits of this heuristic:
 *   - The tokenizer produces logical lines, not fine-grained AST nodes, so
 *     a single "rule" token may map to one IRRule. A store token maps to one
 *     IRStore or one RawKmnFragment. Group header tokens map to IRGroup nodes.
 *     The counts should be 1:1 for well-formed keyboards.
 *   - The `begin` directive is counted as 1 implied node for the whole file
 *     (it sets the entry group in IRHeader, not a separate IR node). We
 *     account for at most 1 begin token in the balance.
 *   - Comments and blank tokens are structural, not data — they do not
 *     contribute to the data-node count on either side.
 *   - match/nomatch tokens become IRRule nodes inside currentGroup; they are
 *     counted as rules.
 *   - If a keyboard has zero typed groups (all rules fell into raw), the
 *     heuristic may report false positives. This is a known gap; downstream
 *     use of I1 results should be combined with I4 opaque inventory.
 */
export function checkParseCompleteness(
  parseResult: ParseResult,
  source: string,
): LintFinding[] {
  const findings: LintFinding[] = [];
  const tokens = tokenize(source);

  // Count data tokens: everything that should produce an IR node.
  let beginCount = 0;
  let dataTokenCount = 0;
  for (const tok of tokens) {
    if (tok.kind === "blank" || tok.kind === "comment") continue;
    if (tok.kind === "begin") { beginCount++; dataTokenCount++; continue; }
    dataTokenCount++;
  }

  const { ir } = parseResult;

  // Count IR data nodes.
  const storeCount = ir.stores.length;
  const ruleCount = ir.groups.reduce((sum, g) => sum + g.rules.length, 0);
  const groupHeaderCount = ir.groups.length;
  const rawCount = ir.raw.length;
  // Each group has 1 header token; each rule has 1 rule token; stores have 1 each.
  // The `begin` token maps to 1 header (no separate IR node beyond IRHeader).
  const irNodeCount = storeCount + groupHeaderCount + ruleCount + rawCount + Math.min(beginCount, 1);

  if (irNodeCount < dataTokenCount) {
    const dropped = dataTokenCount - irNodeCount;
    findings.push({
      code: "KM_ERROR_PARSE_INCOMPLETE",
      severity: "error",
      layer: "A-prime",
      message:
        `Parse completeness check: ${dropped} source token(s) have no corresponding IR node. ` +
        `Source had ${dataTokenCount} data tokens; IR accounts for ${irNodeCount} nodes. ` +
        "Possible silent drop by the codec.",
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// I3 — Header preservation
// ---------------------------------------------------------------------------

/** Code shared by every I3 "header field missing" finding. */
export const HEADER_FIELD_MISSING_CODE = "KM_WARN_HEADER_FIELD_MISSING";

/** Build the canonical I3 "missing header field" message for `label`. */
function headerFieldMissingMessage(label: string): string {
  return `Header field "${label}" is absent or empty in the emitted .kmn.`;
}

/**
 * Inverse of {@link headerFieldMissingMessage}: recover the field label from an
 * I3 finding, or `null` if the finding isn't a header-field-missing one.
 *
 * Co-located with the message builder so the two cannot drift — a consumer that
 * needs the short label (e.g. the supportability scanner's `i3HeaderMissing`
 * column) calls this instead of re-parsing the message prose at a distance. The
 * round-trip `headerFieldLabel(missing(L)) === L` is pinned by a lock-test in
 * layer-a-prime.test.ts, so a reword of the message breaks the test rather than
 * silently degrading every consumer.
 */
export function headerFieldLabel(finding: LintFinding): string | null {
  if (finding.code !== HEADER_FIELD_MISSING_CODE) return null;
  const m = /Header field "([^"]+)"/.exec(finding.message);
  return m ? m[1]! : null;
}

/**
 * I3: Verify that key header fields are non-empty in the emitted .kmn.
 *
 * Checks keyboardId, name, copyright, and version. Identity
 * propagation (values changed vs. the import) is intentional and not checked
 * here — only emptiness is a failure.
 *
 * Language tags (bcp47) are deliberately NOT checked here: they live in the
 * package descriptor (.kps), never in a .kmn store, and the parser leaves
 * ir.header.bcp47 empty until the survey identity composes it. An emptiness
 * check at this stage fired on essentially every real import. Whether the
 * finished keyboard carries a language is judged at output, where the
 * descriptor is written.
 */
export function checkHeaderPreservation(
  ir: KeyboardIR,
  emitted: string,
): LintFinding[] {
  const findings: LintFinding[] = [];

  // Helper: scan emitted text for a system-store value.
  function emittedStoreValue(storeName: string): string {
    // Match: store(&NAME) 'value'  or  store(&NAME) "value"
    const re = new RegExp(`store\\s*\\(\\s*&${storeName}\\s*\\)\\s*['"]([^'"]*)['"]`, "i");
    const m = re.exec(emitted);
    return m ? (m[1] ?? "").trim() : "";
  }

  function missing(label: string): LintFinding {
    return {
      code: HEADER_FIELD_MISSING_CODE,
      severity: "warning",
      layer: "A-prime",
      message: headerFieldMissingMessage(label),
    };
  }

  // keyboardId: the IR carries it; the emitter doesn't emit it as a store,
  // but it should be present in the IR header itself.
  if (!ir.header.keyboardId || ir.header.keyboardId.trim() === "") {
    findings.push(missing("keyboardId"));
  }

  // name
  const nameVal = emittedStoreValue("NAME");
  if (!nameVal) {
    findings.push(missing("name (&NAME)"));
  }

  // copyright
  const copyrightVal = emittedStoreValue("COPYRIGHT");
  if (!copyrightVal) {
    findings.push(missing("copyright (&COPYRIGHT)"));
  }

  // version
  const versionVal =
    emittedStoreValue("KEYBOARDVERSION") || emittedStoreValue("VERSION");
  if (!versionVal) {
    findings.push(missing("version (&KEYBOARDVERSION / &VERSION)"));
  }

  return findings;
}

// ---------------------------------------------------------------------------
// I4 — Opaque feature inventory
// ---------------------------------------------------------------------------

/**
 * I4: Emit one informational finding summarising the inventory of opaque
 * features in the parsed IR. Non-blocking. The inventory array itself is
 * surfaced via ImportReport.opaqueFeatureInventory (assembled in
 * import-keyboard.ts).
 */
export function checkOpaqueFeatureInventory(
  parseResult: ParseResult,
): LintFinding[] {
  const { opaqueFeatures } = parseResult;

  const total = opaqueFeatures.reduce((sum, f) => sum + f.count, 0);
  const summary =
    opaqueFeatures.length === 0
      ? "No opaque fragments detected."
      : opaqueFeatures
          .map((f) => `${f.feature}×${f.count}`)
          .join(", ");

  return [
    {
      code: "KM_INFO_OPAQUE_FEATURE_INVENTORY",
      severity: "info",
      layer: "A-prime",
      message:
        `Opaque feature inventory: ${total} raw fragment(s) across ` +
        `${opaqueFeatures.length} feature type(s). ${summary}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// I2 — Functional round-trip check (via simulate(), #882)
// ---------------------------------------------------------------------------

/** I2 divergence: compared inputs produced different output after emit. */
export const ROUND_TRIP_DIVERGENCE_CODE = "KM_ERROR_ROUND_TRIP_DIVERGENCE";
/** I2 ran with zero comparable inputs — equivalence was NOT established. */
export const ROUND_TRIP_NO_COVERAGE_CODE = "KM_WARN_ROUND_TRIP_NO_COVERAGE";
/** I2 could not run (no harness supplied, compile failed, runtime failed). */
export const ROUND_TRIP_UNAVAILABLE_CODE = "KM_HINT_ROUND_TRIP_UNAVAILABLE";
/** I2 compared a capped subset of the theoretical D7 corpus. */
export const ROUND_TRIP_CORPUS_TRUNCATED_CODE = "KM_WARN_ROUND_TRIP_CORPUS_TRUNCATED";

/** One source file carried into both compile VFSes (siblings of the .kmn). */
export interface RoundTripSourceFile {
  path: string;
  content: Uint8Array | string;
  isBinary: boolean;
}

/**
 * Host-supplied harness for functional I2. Dependencies are injected (never
 * statically imported here) so this module stays off the simulator/compiler
 * import graph: the engine's main entry must remain simulator-free for
 * browser bundlers (see engine/src/index.ts, issue #183), and the compiler
 * lives behind the same WASM loading path as the rest of the engine.
 */
export interface RoundTripDeps {
  /** The original imported .kmn source text. */
  originalKmn: string;
  /** The .kmn text emitted from the parsed IR. */
  emittedKmn: string;
  /** Keyboard identifier (the `source/<keyboardId>.kmn` stem). */
  keyboardId: string;
  /** kmcmplib compile: reads `source/<keyboardId>.kmn` + siblings from the VFS. */
  compileFn: (vfs: VirtualFS, keyboardId: string) => Promise<CompileResult>;
  /** KeymanWeb JS-runtime simulation over a compiled keyboard. */
  simulateFn: (compiled: CompileResult, keys: SimKeyInput[]) => SimulationResult;
  /**
   * Sibling files of the .kmn (the whole `source/` directory: &BITMAP icon,
   * &VISUALKEYBOARD .kvks, &LAYOUTFILE touch layout, fonts…). Both compile
   * VFSes are populated from these entries, overriding only the .kmn text —
   * without them kmcmplib fails with "Cannot open the bitmap or icon file"
   * (5251121). Any `source/<keyboardId>.kmn` entry in this list is ignored;
   * the original/emitted texts above take its place.
   */
  sourceFiles?: readonly RoundTripSourceFile[];
}

/**
 * D7 modifier-name → SimKeyInput modifier bridge.
 *
 * Keyman semantics pinned by the km-keyman review (#882): RALT is a distinct
 * flag bit (RALTFLAG 0x40, outside the generic ALL mask) and must map to
 * "ralt", NEVER "lalt" — a wrong mapping would silently compare a different
 * input than the corpus names. CAPS is a state key, not a modifier bit, so
 * it maps to SimKeyInput.caps. Any name absent from this table makes the
 * chord unmappable (the caller skips + counts it as a coverage gap) rather
 * than being guessed or dropped.
 */
const D7_MODIFIER_TO_SIM: ReadonlyMap<string, SimKeyInput["modifiers"][number]> = new Map([
  ["SHIFT", "shift"],
  ["CTRL", "ctrl"],
  ["ALT", "alt"],
  ["LCTRL", "lctrl"],
  ["RCTRL", "rctrl"],
  ["LALT", "lalt"],
  ["RALT", "ralt"],
]);

/**
 * Convert one D7 KeyChord to a SimKeyInput, or return null when a modifier
 * name has no bridge entry (coverage gap — the caller must count it, never
 * simulate a different chord than the corpus specifies).
 */
export function chordToSimKeyInput(chord: KeyChord): SimKeyInput | null {
  const modifiers: SimKeyInput["modifiers"] = [];
  let caps = false;
  for (const raw of chord.modifiers) {
    const name = raw.toUpperCase();
    if (name === "CAPS") {
      caps = true;
      continue;
    }
    const mapped = D7_MODIFIER_TO_SIM.get(name);
    if (mapped === undefined) return null;
    modifiers.push(mapped);
  }
  return caps ? { vkey: chord.vkey, modifiers, caps } : { vkey: chord.vkey, modifiers };
}

/** Render a corpus sequence for a finding message, e.g. `[SHIFT K_A] then [K_B]`. */
function describeSequence(sequence: readonly KeyChord[]): string {
  return sequence
    .map((c) => (c.modifiers.length > 0 ? `[${[...c.modifiers, c.vkey].join(" ")}]` : `[${c.vkey}]`))
    .join(" then ");
}

/** Theoretical (uncapped) D7 corpus size for a vkey count — truncation test. */
function theoreticalCorpusSize(vkeyCount: number, modifierSetCount: number, deadkeyDepth: number): number {
  if (vkeyCount === 0) return 0;
  const singles = vkeyCount * modifierSetCount;
  let total = 0;
  for (let d = 0; d <= deadkeyDepth; d++) total += Math.pow(vkeyCount, d) * singles;
  return total;
}

function roundTripUnavailable(reason: string): LintFinding {
  return {
    code: ROUND_TRIP_UNAVAILABLE_CODE,
    severity: "hint",
    layer: "A-prime",
    message:
      `Functional round-trip (I2) could not run: ${reason}. ` +
      "Equivalence was not established; compile diagnostics are reported through the compiler's own channel.",
  };
}

/**
 * I2: Functional round-trip equivalence (spec §10) via the KeymanWeb JS
 * runtime — compile the original .kmn and the emitted .kmn with kmcmplib,
 * run the D7 bounded-enumeration corpus through simulate() on both, and diff
 * the input→output maps.
 *
 * Severity contract (km-lead ruling, queue-882):
 *   - A compared divergence (different finalOutput, or exactly one side
 *     throwing in simulate) is ONE aggregate `error`
 *     (KM_ERROR_ROUND_TRIP_DIVERGENCE) — the D9 signal that sets
 *     RoundTripDivergence on the ImportReport.
 *   - An empty corpus, a corpus whose chords are all unmappable, is a
 *     `warning` (KM_WARN_ROUND_TRIP_NO_COVERAGE): equivalence was NOT
 *     established and must never read as a pass.
 *   - A truncated corpus (generator cap) adds a `warning`
 *     (KM_WARN_ROUND_TRIP_CORPUS_TRUNCATED) naming generated vs theoretical
 *     counts; a pass over the compared subset is partial.
 *   - Harness failures (no deps supplied, either compile failing, no .js
 *     artifact, simulate throwing on BOTH sides) are a non-blocking `hint`
 *     (KM_HINT_ROUND_TRIP_UNAVAILABLE) — they never mask the compiler's own
 *     diagnostics and never block the import on infrastructure grounds.
 *   - A clean pass over a non-empty, untruncated corpus emits NO finding;
 *     the counts are logged via devLog.
 *
 * FIDELITY CAVEAT: simulate() executes the KeymanWeb `.js` build of the
 * keyboard, NOT native Keyman Core (.kmx). A pass establishes JS-runtime
 * functional equivalence only; native-only divergences are out of reach
 * until a libkeymancore WASM build lands (phase 2, tracked separately).
 * Comparison is finalOutput-only in v1 — beep and pending-deadkey state are
 * not diffed.
 *
 * This function is async and comparatively slow (~2 ms/input plus two
 * compiles): it belongs to the import/emit gate, outside the 300 ms
 * debounce cycle, and must never be wired into the batch supportability
 * scanner (which keeps the structural proxy).
 */
export async function checkRoundTrip(
  ir: KeyboardIR,
  deps?: RoundTripDeps,
): Promise<LintFinding[]> {
  const { corpus, corpusSpec, inputCount } = generateCorpus(ir);
  const theoretical = theoreticalCorpusSize(
    corpusSpec.vkeyCount,
    corpusSpec.modifierSets.length,
    corpusSpec.deadkeyDepth,
  );
  const truncated = theoretical > inputCount;

  devLog.info(
    `[layer-a-prime] I2 corpus: ${inputCount} sequences` +
      ` (${corpusSpec.vkeyCount} vkeys × ${corpusSpec.modifierSets.length} modifier sets,` +
      ` deadkeyDepth=${corpusSpec.deadkeyDepth})`,
    { corpusSpec, sampleSize: Math.min(corpus.length, 5) },
  );

  if (deps === undefined) {
    return [roundTripUnavailable("no compile/simulate harness was supplied by the host")];
  }

  if (inputCount === 0) {
    return [
      {
        code: ROUND_TRIP_NO_COVERAGE_CODE,
        severity: "warning",
        layer: "A-prime",
        message:
          "Functional round-trip (I2) has NO coverage for this keyboard: the D7 corpus is empty " +
          "(no vkey-based rule contexts to enumerate), so functional equivalence was not established. " +
          "The keyboard imports on structural checks only.",
      },
    ];
  }

  // Build the two compile VFSes: identical siblings, only the .kmn differs.
  const kmnPath = `source/${deps.keyboardId}.kmn`;
  const siblings = (deps.sourceFiles ?? []).filter((f) => f.path !== kmnPath);
  const buildVfs = (kmnText: string): VirtualFS =>
    createVirtualFS([
      ...siblings.map((f) => ({ path: f.path, content: f.content, isBinary: f.isBinary })),
      { path: kmnPath, content: kmnText, isBinary: false },
    ]);

  let originalCompiled: CompileResult;
  let emittedCompiled: CompileResult;
  try {
    originalCompiled = await deps.compileFn(buildVfs(deps.originalKmn), deps.keyboardId);
    emittedCompiled = await deps.compileFn(buildVfs(deps.emittedKmn), deps.keyboardId);
  } catch (err) {
    return [roundTripUnavailable(`compile threw: ${err instanceof Error ? err.message : String(err)}`)];
  }

  const compileProblem = (label: string, result: CompileResult): string | null => {
    if (!result.success) {
      const first = result.diagnostics[0];
      return `${label} compile failed${first ? `: ${first.message}` : ""}`;
    }
    if (!result.artifacts.some((a) => a.filename.endsWith(".js"))) {
      return `${label} compile produced no .js artifact to simulate`;
    }
    return null;
  };
  const problems = [
    compileProblem("original", originalCompiled),
    compileProblem("emitted", emittedCompiled),
  ].filter((p): p is string => p !== null);
  if (problems.length > 0) {
    return [roundTripUnavailable(problems.join("; "))];
  }

  // Run the corpus through both compiled keyboards and diff finalOutput.
  const MAX_EXAMPLES = 5;
  let compared = 0;
  let skippedUnmappable = 0;
  let bothThrew = 0;
  const divergences: Array<{ input: string; originalOut: string; emittedOut: string }> = [];

  for (const sequence of corpus) {
    const keys: SimKeyInput[] = [];
    let mappable = true;
    for (const chord of sequence) {
      const converted = chordToSimKeyInput(chord);
      if (converted === null) {
        mappable = false;
        break;
      }
      keys.push(converted);
    }
    if (!mappable) {
      skippedUnmappable++;
      continue;
    }

    let originalOut: string | null = null;
    let emittedOut: string | null = null;
    let originalErr: string | null = null;
    let emittedErr: string | null = null;
    try {
      originalOut = deps.simulateFn(originalCompiled, keys).finalOutput;
    } catch (err) {
      originalErr = err instanceof Error ? err.message : String(err);
    }
    try {
      emittedOut = deps.simulateFn(emittedCompiled, keys).finalOutput;
    } catch (err) {
      emittedErr = err instanceof Error ? err.message : String(err);
    }

    if (originalErr !== null && emittedErr !== null) {
      bothThrew++;
      continue;
    }
    compared++;
    if (originalErr !== null || emittedErr !== null || originalOut !== emittedOut) {
      divergences.push({
        input: describeSequence(sequence),
        originalOut: originalErr !== null ? `<simulate threw: ${originalErr}>` : JSON.stringify(originalOut),
        emittedOut: emittedErr !== null ? `<simulate threw: ${emittedErr}>` : JSON.stringify(emittedOut),
      });
    }
  }

  if (compared === 0) {
    if (skippedUnmappable > 0) {
      return [
        {
          code: ROUND_TRIP_NO_COVERAGE_CODE,
          severity: "warning",
          layer: "A-prime",
          message:
            `Functional round-trip (I2) has NO coverage for this keyboard: all ${skippedUnmappable} corpus ` +
            "sequence(s) use modifier names with no simulator bridge mapping, so functional equivalence " +
            "was not established.",
        },
      ];
    }
    return [roundTripUnavailable(`simulate() threw for all ${bothThrew} corpus sequence(s) on both keyboards`)];
  }

  const findings: LintFinding[] = [];

  if (divergences.length > 0) {
    const examples = divergences
      .slice(0, MAX_EXAMPLES)
      .map((d) => `${d.input}: original → ${d.originalOut}, emitted → ${d.emittedOut}`)
      .join("; ");
    findings.push({
      code: ROUND_TRIP_DIVERGENCE_CODE,
      severity: "error",
      layer: "A-prime",
      message:
        `Functional round-trip (I2) divergence: ${divergences.length} of ${compared} compared input(s) ` +
        `produce different output after emit. First ${Math.min(divergences.length, MAX_EXAMPLES)}: ${examples}.`,
    });
  }

  if (truncated) {
    findings.push({
      code: ROUND_TRIP_CORPUS_TRUNCATED_CODE,
      severity: "warning",
      layer: "A-prime",
      message:
        `Functional round-trip (I2) corpus was truncated: compared ${compared} of ${inputCount} generated ` +
        `input(s) out of a theoretical ${theoretical} (generator cap). Equivalence over the compared ` +
        "subset only — the verdict is partial.",
    });
  }

  if (skippedUnmappable > 0) {
    findings.push({
      code: ROUND_TRIP_NO_COVERAGE_CODE,
      severity: "warning",
      layer: "A-prime",
      message:
        `Functional round-trip (I2) coverage gap: ${skippedUnmappable} corpus sequence(s) were skipped ` +
        "because a modifier name has no simulator bridge mapping; they were not compared.",
    });
  }

  if (bothThrew > 0) {
    findings.push(
      roundTripUnavailable(`simulate() threw for ${bothThrew} corpus sequence(s) on both keyboards`),
    );
  }

  if (findings.length === 0) {
    devLog.info(
      `[layer-a-prime] I2 functional round-trip: ${compared}/${inputCount} inputs identical — equivalent (JS runtime).`,
    );
  }

  return findings;
}

// ---------------------------------------------------------------------------
// I5 — Sidecar hash
// ---------------------------------------------------------------------------

/**
 * I5: Recompute the SHA-256 of the sidecar text and compare to the stored
 * hash. A mismatch means the sidecar was mutated after import.
 *
 * @param keyboardId       Keyboard identifier (used in the error message).
 * @param emittedSidecarText  The raw text of the sidecar file as read from VFS.
 * @param storedHash       The hex SHA-256 stored at source/<id>.kmn.imported.sha256.
 */
export async function checkSidecarHash(
  keyboardId: string,
  emittedSidecarText: string,
  storedHash: string,
): Promise<LintFinding[]> {
  if (storedHash.trim() === "") {
    return [
      {
        code: "KM_WARN_SIDECAR_HASH_MISSING",
        severity: "warning",
        layer: "A-prime",
        message:
          `Sidecar hash file missing for "${keyboardId}": ` +
          "no .sha256 companion found. Cannot verify sidecar integrity.",
      },
    ];
  }
  const recomputed = await computeSha256Hex(emittedSidecarText);
  if (recomputed !== storedHash) {
    return [
      {
        code: "KM_ERROR_SIDECAR_HASH_MISMATCH",
        severity: "error",
        layer: "A-prime",
        message:
          `Sidecar hash mismatch for "${keyboardId}": stored hash is "${storedHash}" ` +
          `but recomputed hash of sidecar text is "${recomputed}". ` +
          "The sidecar file may have been modified after import.",
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// I6 — Ownership consistency
// ---------------------------------------------------------------------------

/** Shared code for all I6 findings. (KM_ERROR_* matches the A' error-code
 *  convention — I1's KM_ERROR_PARSE_INCOMPLETE, I5's KM_ERROR_SIDECAR_HASH_MISMATCH.
 *  The issue suggested KM_LINT_OWNERSHIP_CONSISTENCY, but KM_LINT_* is the Layer C
 *  hygiene namespace; a Layer A' error belongs under KM_ERROR_*.) */
export const OWNERSHIP_CONSISTENCY_CODE = "KM_ERROR_OWNERSHIP_CONSISTENCY";

/**
 * I6: Ownership consistency between recognized Patterns and the IR nodes they
 * own (spec §10, fires on emit). The Pattern↔node back-reference must agree in
 * both directions, or the carve gallery mis-attributes / permanently suppresses
 * nodes:
 *
 *   - Forward (spec's stated rule): for every rule-kind ref in
 *     `Pattern.ownedNodes`, the referenced `IRRule` must exist and its
 *     `ownedByPattern` must equal that Pattern's id.
 *   - Reverse (the spec's stated impact): every `IRRule.ownedByPattern` must
 *     point to a Pattern that still exists — a dangling pointer left by a
 *     deleted Pattern orphans the node (permanent carve-gallery suppression).
 *
 * Only `IRRule` carries `ownedByPattern` (patterns are lifted from rule
 * clusters), so non-rule `ownedNodes` refs have no back-reference to verify and
 * are skipped. Severity `error`: a failing I6 means the IR cannot be trusted as
 * the source of truth on emit (D9).
 */
export function checkOwnershipConsistency(ir: KeyboardIR): LintFinding[] {
  const findings: LintFinding[] = [];

  // Rules are the only nodes carrying ownedByPattern.
  const ruleById = new Map<string, IRRule>();
  for (const group of ir.groups) {
    for (const rule of group.rules) ruleById.set(rule.nodeId, rule);
  }
  const patternIds = new Set(ir.recognizedPatterns.map((p) => p.id));

  // Forward: each Pattern.ownedNodes rule-ref resolves to a rule this Pattern owns.
  for (const pattern of ir.recognizedPatterns) {
    for (const ref of pattern.ownedNodes ?? []) {
      if (ref.kind !== "rule") continue; // only rules carry the back-reference
      const rule = ruleById.get(ref.nodeId);
      if (rule === undefined) {
        findings.push({
          code: OWNERSHIP_CONSISTENCY_CODE,
          severity: "error",
          layer: "A-prime",
          message:
            `Pattern "${pattern.id}" lists rule node "${ref.nodeId}" in ownedNodes, ` +
            "but no such rule exists in the IR (stale ownedNodes pointer).",
        });
      } else if (rule.ownedByPattern !== pattern.id) {
        findings.push({
          code: OWNERSHIP_CONSISTENCY_CODE,
          severity: "error",
          layer: "A-prime",
          message:
            `Pattern "${pattern.id}" owns rule node "${ref.nodeId}", but that node's ` +
            `ownedByPattern is ${rule.ownedByPattern === undefined ? "unset" : `"${rule.ownedByPattern}"`} ` +
            `(expected "${pattern.id}").`,
        });
      }
    }
  }

  // Reverse: each rule's ownedByPattern points to a Pattern that still exists.
  for (const rule of ruleById.values()) {
    if (rule.ownedByPattern !== undefined && !patternIds.has(rule.ownedByPattern)) {
      findings.push({
        code: OWNERSHIP_CONSISTENCY_CODE,
        severity: "error",
        layer: "A-prime",
        message:
          `Rule node "${rule.nodeId}" is owned by Pattern "${rule.ownedByPattern}", ` +
          "but no such Pattern exists (orphaned node — its Pattern was deleted).",
      });
    }
  }

  return findings;
}

/** Code for a behaviour-owned rule that suppresses with `nul` on a text context. */
export const NUL_ON_TEXT_CONTEXT_CODE = "KM_ERROR_NUL_ON_TEXT_CONTEXT";

/**
 * I6 extension (spec 076 FR-009/FR-014/FR-020): a rule the suppression
 * compiler owns (`ownedByBehaviour` set) must not output a bare `nul` when its
 * context carries text. That `nul` would delete the matched characters, so
 * FR-020 requires `context` (or `context beep`) instead.
 *
 * Scoped to behaviour-owned rules on purpose. A hand-written
 * `'gb' + [K_BKSP] > nul` deletes its context intentionally (the
 * backspace-deletes-the-cluster idiom), is valid KMN, and appears in shipping
 * keyboards such as sil_yoruba8. Ownership lives only in the IR, which is why
 * this is an IR check and not part of the source-text context-ordering scan.
 *
 * Text-bearing means any context element except `vkey`, `deadkey`, and the
 * untyped `+` divider marker, which matches the suppression compiler's own
 * verb selection.
 */
export function checkBehaviourNulOnTextContext(ir: KeyboardIR): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (rule.ownedByBehaviour === undefined) continue;
      const outputIsNul =
        rule.output.length > 0 &&
        rule.output[0]?.kind === "nul" &&
        rule.output.slice(1).every((el) => el.kind === "beep");
      if (!outputIsNul) continue;
      const textBearing = rule.context.some(
        (el) =>
          el.kind !== "vkey" &&
          el.kind !== "deadkey" &&
          !(el.kind === "raw" && el.text === "+"),
      );
      if (!textBearing) continue;
      findings.push({
        code: NUL_ON_TEXT_CONTEXT_CODE,
        severity: "error",
        layer: "A-prime",
        message:
          `Rule node "${rule.nodeId}" (owned by "${rule.ownedByBehaviour}") suppresses with "nul" ` +
          "on a text-bearing context, which deletes the matched characters; " +
          "a blocking behaviour must re-emit them with `context`.",
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 0x05A — ERROR_TouchLayoutInvalidIdentifier, as a VALIDITY concern (spec 063
// FR-040 / T043).
//
// WHY THIS IS NOT A LAYER C CHECK. An id the compiler rejects is a validity
// problem, not a style or hygiene one, and every check shipped in
// `@keymanapp/keyboard-lint` today is warning severity — grep confirms zero
// error severities. Introducing the first error-severity Layer C code would be a
// layer-boundary breach nobody signed off on.
//
// The two paths that DO own 0x05A:
//   - AUTHOR-TYPED ids: edit-time REJECTION (FR-045). The mutation is blocked
//     before it can be saved, and no finding is emitted at all — there is nothing
//     to report, because the invalid state never exists.
//   - AN IMPORTED KEYBOARD'S EXISTING ids: this check. Layer A′ is exactly the
//     shape for a validity finding surfaced on import rather than on edit, which
//     is why it is spread into `runImportFidelityParseChecks` rather than added to
//     the debounce-cycle `runAllChecks` path.
//
// Neither path adds anything to Layer C.
// ---------------------------------------------------------------------------

/** Shared code for the 0x05A import-fidelity finding (the A′ `KM_ERROR_*` namespace). */
export const TOUCH_LAYOUT_INVALID_IDENTIFIER_CODE = "KM_ERROR_TOUCH_LAYOUT_INVALID_IDENTIFIER";

// The identifier grammar itself is `isValidTouchKeyIdentifier`
// (`@keyboard-studio/contracts`, `touch-key-rule-join.ts`). It moved there at
// spec 063 T118 so this import-fidelity check and the edit-time REJECTION path
// (`checkKeyEditRejections`, `keyEditOps.ts`) cannot disagree about what 0x05A
// rejects — FR-040 requires the two paths to share one definition, and a private
// regex here was the second copy waiting to happen.

/**
 * 0x05A: report every touch-layout key id the compiler would reject.
 *
 * Walks the whole touch layout including `sk` / `multitap` / `flick` sub-keys — an
 * invalid id on a longpress entry fails the compile exactly as one on a main key
 * does.
 *
 * ONE FINDING PER DISTINCT INVALID ID, not per occurrence: an id repeated across
 * eight layers is one authoring mistake with one fix, and eight identical errors
 * would bury the rest of the import report.
 *
 * Returns `[]` when the IR has no touch layout — there is nothing to validate,
 * which is the common case for a desktop-only keyboard.
 */
export function checkTouchLayoutIdentifiers(parseResult: ParseResult): LintFinding[] {
  const layout = parseResult.ir.touchLayout;
  if (layout === undefined) return [];

  const findings: LintFinding[] = [];
  const reported = new Set<string>();

  const visit = (key: { id: string; sk?: unknown; multitap?: unknown; flick?: unknown }, platformId: string, layerId: string): void => {
    const id = key.id;
    // An empty id is invalid, and reported with its own wording: "" tells the
    // author nothing, whereas naming the layer locates it.
    const invalid = !isValidTouchKeyIdentifier(id);
    if (invalid && !reported.has(id)) {
      reported.add(id);
      findings.push({
        code: TOUCH_LAYOUT_INVALID_IDENTIFIER_CODE,
        severity: "error",
        layer: "A",
        message:
          id.length === 0
            ? `Touch layout has a key with no id (${platformId} layer "${layerId}"); the Keyman compiler rejects this (0x05A).`
            : `Touch layout key id "${id}" (${platformId} layer "${layerId}") is not a valid identifier; the Keyman compiler rejects this (0x05A).`,
        hint: `Rename the key to a valid identifier — a letter or underscore followed by letters, digits, or underscores (e.g. \`T_MYKEY\` or \`U_00E9\`).`,
      });
    }

    const subs = [
      ...((key.sk as { id: string }[] | undefined) ?? []),
      ...((key.multitap as { id: string }[] | undefined) ?? []),
      ...Object.values((key.flick as Record<string, { id: string } | undefined> | undefined) ?? {}).filter(
        (v): v is { id: string } => v !== undefined,
      ),
    ];
    for (const sub of subs) visit(sub, platformId, layerId);
  };

  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) visit(key, platform.id, layer.id);
      }
    }
  }

  return findings;
}
