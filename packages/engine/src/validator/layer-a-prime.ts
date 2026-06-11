/**
 * Layer A' import-fidelity checks (I1–I5).
 *
 * Each exported function follows the one-function-per-check convention used
 * by packages/engine/src/validator/checks/*.ts: accepts relevant inputs,
 * returns LintFinding[]. No I/O side effects except where explicitly noted
 * (I2 stub logs corpus size via console.info, matching the pattern in
 * packages/engine/src/compiler/index.ts).
 *
 * Layer A' MAY emit "info" for I4 only (opaque-feature inventory, non-blocking).
 *
 * Keep this file out of the runAllChecks path — it must never be imported by
 * packages/engine/src/validator/index.ts.
 */

import type { LintFinding, KeyboardIR } from "@keyboard-studio/contracts";
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

/**
 * I3: Verify that key header fields are non-empty in the emitted .kmn.
 *
 * Checks keyboardId, name, BCP47 tags, copyright, and version. Identity
 * propagation (values changed vs. the import) is intentional and not checked
 * here — only emptiness is a failure.
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
      code: "KM_WARN_HEADER_FIELD_MISSING",
      severity: "warning",
      layer: "A-prime",
      message: `Header field "${label}" is absent or empty in the emitted .kmn.`,
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

  // BCP47: the IR header carries bcp47[]; we verify the IR side.
  if (ir.header.bcp47.length === 0 || ir.header.bcp47.every((t) => !t.trim())) {
    findings.push(missing("bcp47 (language tags)"));
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
// I2 — Round-trip check (DEFERRED STUB)
// ---------------------------------------------------------------------------

/**
 * I2: Functional round-trip check — DEFERRED STUB.
 *
 * This check requires the Keyman Core keystroke runtime to execute the
 * compiled keyboard and observe output text. The WASM oracle available in
 * this build is kmcmplib (a compiler), not Keyman Core (a runtime). Until
 * Keyman Core integration lands, this function:
 *   1. Generates and logs the bounded-enumeration corpus (D7).
 *   2. Returns one non-blocking "hint" finding.
 *   3. Does NOT set RoundTripDivergence on the ImportReport.
 */
export function checkRoundTrip(ir: KeyboardIR): LintFinding[] {
  const { corpus, corpusSpec, inputCount } = generateCorpus(ir);

  // Log corpus size matching the console.info pattern used in compiler/index.ts.
  console.info(
    `[layer-a-prime] I2 corpus: ${inputCount} sequences` +
      ` (${corpusSpec.vkeyCount} vkeys × ${corpusSpec.modifierSets.length} modifier sets,` +
      ` deadkeyDepth=${corpusSpec.deadkeyDepth})`,
    { corpusSpec, sampleSize: Math.min(corpus.length, 5) },
  );

  return [
    {
      code: "KM_HINT_ROUND_TRIP_DEFERRED",
      severity: "hint",
      layer: "A-prime",
      message:
        `Functional round-trip (I2) deferred: requires Keyman Core keystroke runtime, ` +
        `not available in this build. Corpus of ${inputCount} inputs generated; ` +
        `see follow-up issue for Keyman Core integration.`,
    },
  ];
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
