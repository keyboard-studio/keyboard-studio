/**
 * Layer A' import-fidelity checks (I1–I6).
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

import type { LintFinding, KeyboardIR, IRRule } from "@keyboard-studio/contracts";
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
