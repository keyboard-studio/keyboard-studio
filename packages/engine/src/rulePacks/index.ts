// Rule-pack export/import — spec 082 Track B (rule builder), FR-005..FR-010.
//
// The versioned, schema-validated pack loader, following the pattern-library
// precedent (packages/engine/src/pattern-library/): the contract (zod schema
// + version field) lives in @keyboard-studio/contracts (`rulePack.ts`); this
// module owns serialization (canonical JSON) and the validated load path.
//
// NOTE: this barrel is not yet re-exported from the engine root index —
// `packages/engine/src/index.ts` currently has uncommitted changes from a
// sibling workstream, so the one-line re-export
// (`export { exportPack, importPack, RulePackImportError } from
// "./rulePacks/index.js"`) lands separately once that file is committed.
// Until then, import from this barrel directly in node contexts; the studio
// panel validates via @keyboard-studio/contracts and serializes with an
// identical canonical form (see its canonicalPackJson).

import {
  validateRulePack,
  type RulePack,
  type RulePackIssue,
} from "@keyboard-studio/contracts";

export type { RulePack, RulePackIssue };
export { validateRulePack };

/** Thrown by {@link importPack} and {@link exportPack} on invalid input. */
export class RulePackImportError extends Error {
  /** The typed schema violations (empty for JSON parse failures). */
  readonly issues: RulePackIssue[];

  constructor(message: string, issues: RulePackIssue[] = []) {
    super(message);
    this.name = "RulePackImportError";
    this.issues = issues;
  }
}

/**
 * Recursively sort object keys so pack serialization is canonical:
 * byte-identical output for semantically identical packs, stable diffs in
 * version control. Arrays keep their order (rule order is significant).
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (typeof value === "object" && value !== null) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Serialize a pack to its canonical JSON form (sorted keys, 2-space
 * indent, trailing newline). The pack is validated first: export never
 * emits a pack that would fail {@link importPack}.
 *
 * @throws {RulePackImportError} when the pack violates the schema.
 */
export function exportPack(pack: RulePack): string {
  const result = validateRulePack(pack);
  if (!result.ok) {
    throw new RulePackImportError(
      `cannot export invalid rule pack: ${result.issues.map(i => `${i.path || "<root>"}: ${i.message}`).join("; ")}`,
      result.issues,
    );
  }
  return JSON.stringify(sortKeysDeep(result.pack), null, 2) + "\n";
}

/**
 * Parse and validate pack JSON, returning the typed pack.
 *
 * @throws {RulePackImportError} on malformed JSON or schema violation, with
 *   the typed issues attached.
 */
export function importPack(json: string): RulePack {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new RulePackImportError(`rule pack is not valid JSON: ${detail}`, [
      { path: "", message: `invalid JSON: ${detail}`, code: "parse" },
    ]);
  }
  const result = validateRulePack(data);
  if (!result.ok) {
    throw new RulePackImportError(
      `rule pack failed schema validation: ${result.issues.map(i => `${i.path || "<root>"}: ${i.message}`).join("; ")}`,
      result.issues,
    );
  }
  return result.pack;
}
