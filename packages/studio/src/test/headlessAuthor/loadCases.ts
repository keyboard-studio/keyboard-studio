// loadCases -- case input for the headless scripted author (spec 107).
//
// Reads the canonical harness case file (cases/harness-cases.json) in its own
// shape and resolves it to `Case`s: the harness's overwriteChar/overwriteKey
// become an `overwrite` override, `track` defaults to `copy`, and `group` is
// looked up from the corpus when the row does not carry it. Unknown fields are
// rejected so a typo in a case file fails loudly instead of being ignored.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CORPUS } from "../sc004Harness.ts";
import type { Case, HarnessCaseRow, PrSetEntry } from "./caseTypes.ts";

const here = dirname(fileURLToPath(import.meta.url));

export const CANONICAL_CASES_PATH = join(here, "cases", "harness-cases.json");
export const PR_SET_PATH = join(here, "prSet.json");

const REQUIRED_STRING_FIELDS = [
  "id",
  "lang",
  "base",
  "english",
  "autonym",
  "code",
  "inputOrder",
  "outputForm",
  "backspace",
  "sampleText",
] as const;

const KNOWN_FIELDS: ReadonlySet<string> = new Set([
  ...REQUIRED_STRING_FIELDS,
  "profile",
  "backspaceOnDiagonal",
  "overwriteChar",
  "overwriteKey",
  "group",
  "track",
  "script",
]);

/**
 * The group of `base`: the directory under `corpusRoot` that contains
 * `<base>/`. Returns undefined when the keyboard is not in the corpus.
 */
export function lookupGroup(base: string, corpusRoot: string = CORPUS): string | undefined {
  if (!existsSync(corpusRoot)) return undefined;
  for (const entry of readdirSync(corpusRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(join(corpusRoot, entry.name, base))) return entry.name;
  }
  return undefined;
}

export interface LoadDeps {
  /** Group lookup used when a row carries no `group`; defaults to the corpus scan. */
  groupOf?: (base: string) => string | undefined;
}

function rowId(raw: Record<string, unknown>): string {
  return typeof raw["id"] === "string" ? raw["id"] : "<no id>";
}

/** Validate one harness-shape row and resolve it to a `Case`. */
export function resolveRow(value: unknown, deps: LoadDeps = {}): Case {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("case row is not an object");
  }
  const raw = value as Record<string, unknown>;
  const id = rowId(raw);
  for (const key of Object.keys(raw)) {
    if (!KNOWN_FIELDS.has(key)) throw new Error(`case ${id}: unknown field "${key}"`);
  }
  for (const key of REQUIRED_STRING_FIELDS) {
    if (typeof raw[key] !== "string") throw new Error(`case ${id}: field "${key}" must be a string`);
  }
  if (typeof raw["profile"] !== "number") throw new Error(`case ${id}: field "profile" must be a number`);
  if (typeof raw["backspaceOnDiagonal"] !== "boolean") {
    throw new Error(`case ${id}: field "backspaceOnDiagonal" must be a boolean`);
  }
  const row = raw as unknown as HarnessCaseRow;

  const track = row.track ?? "copy";
  if (track !== "copy" && track !== "adapt") throw new Error(`case ${id}: field "track" must be copy or adapt`);

  const overrides: Case["overrides"] = [];
  if ((row.overwriteChar === undefined) !== (row.overwriteKey === undefined)) {
    throw new Error(`case ${id}: overwriteChar and overwriteKey must come together`);
  }
  if (row.overwriteChar !== undefined && row.overwriteKey !== undefined) {
    overrides.push({ kind: "overwrite", char: row.overwriteChar, key: row.overwriteKey });
  }

  const group = row.group ?? (deps.groupOf ?? ((b: string) => lookupGroup(b)))(row.base);
  if (group === undefined) throw new Error(`case ${id}: no group given and "${row.base}" is not in the corpus`);

  const out: Case = {
    id: row.id,
    base: row.base,
    group,
    track,
    english: row.english,
    autonym: row.autonym,
    code: row.code,
    profile: row.profile,
    lang: row.lang,
    inputOrder: row.inputOrder,
    outputForm: row.outputForm,
    backspace: row.backspace,
    backspaceOnDiagonal: row.backspaceOnDiagonal,
    sampleText: row.sampleText,
    overrides,
  };
  if (row.script !== undefined) out.script = row.script;
  return out;
}

export function loadCases(path: string = CANONICAL_CASES_PATH, deps: LoadDeps = {}): Case[] {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${path}: expected a JSON array of cases`);
  return parsed.map((row) => resolveRow(row, deps));
}

export function loadPrSet(
  path: string = PR_SET_PATH,
  canonicalPath: string = CANONICAL_CASES_PATH,
  deps: LoadDeps = {},
): { entry: PrSetEntry; case: Case }[] {
  // Adding a keyboard to prSet.json is part of fixing a keyboard-specific bug:
  // the fix's PR adds the case and its reason (spec 107 FR-031). A new entry
  // that would break the PR budget replaces a weaker one of the same shape.
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${path}: expected a JSON array of PR-set entries`);
  const entries = parsed as PrSetEntry[];
  const canonical = new Map<string, Record<string, unknown>>();
  for (const row of JSON.parse(readFileSync(canonicalPath, "utf8")) as Record<string, unknown>[]) {
    canonical.set(rowId(row), row);
  }
  return entries.map((entry) => {
    const hasId = entry.caseId !== undefined;
    const hasCase = entry.case !== undefined;
    if (hasId === hasCase) {
      throw new Error(
        `prSet entry ${entry.caseId ?? entry.case?.id ?? "<unnamed>"}: needs exactly one of caseId or case`,
      );
    }
    if (entry.case !== undefined) return { entry, case: resolveRow(entry.case, deps) };
    const row = canonical.get(entry.caseId as string);
    if (row === undefined) throw new Error(`prSet entry: unknown caseId "${entry.caseId}"`);
    return { entry, case: resolveRow(row, deps) };
  });
}
