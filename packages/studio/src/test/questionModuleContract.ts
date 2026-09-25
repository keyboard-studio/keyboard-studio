// Shared contract suite for survey question modules.
//
// Every question module under src/survey/questions/<folder>/ is enumerated
// straight off disk (import.meta.glob), registered or not, and run through the
// same checks: its fixtures go through its own validate(), its definition is
// pinned by one snapshot entry, and the generic invariants hold (id matches
// filename, inputs/writes declared, required questions reject a blank answer,
// option questions accept exactly their declared options). This replaced one
// hand-copied mirror test file per module; per-module test files now hold only
// behaviour that is specific to that module (mutate(), routing, content).
//
// Test-support module: imported only by *.test.ts files.

import { describe, it, expect } from "vitest";
import { formatIRPath } from "@keyboard-studio/contracts";
import type { FlowQuestion, QuestionModule } from "../survey/types.ts";

type Answer = string | string[] | undefined;

export interface OnDiskQuestionModule {
  /** Module id, taken from the filename (or the folder name for <id>/index.ts). */
  id: string;
  /** The folder under src/survey/questions/ (a, b, f, g, reserve, ...). */
  folder: string;
  /** Path relative to src/survey/questions/. */
  file: string;
  mod: QuestionModule;
}

const MODULE_FILES = import.meta.glob<QuestionModule>(
  [
    "../survey/questions/*/*.ts",
    "../survey/questions/*/*/index.ts",
    "!../survey/questions/**/*.test.ts",
  ],
  { eager: true, import: "default" },
);

const PREFIX = "../survey/questions/";

/** Every question module on disk, sorted by path. */
export const ON_DISK_QUESTION_MODULES: readonly OnDiskQuestionModule[] = Object.entries(MODULE_FILES)
  .map(([globPath, mod]) => {
    const file = globPath.slice(PREFIX.length);
    const segments = file.split("/");
    const folder = segments[0]!;
    const last = segments[segments.length - 1]!;
    const id = last === "index.ts" ? segments[segments.length - 2]! : last.slice(0, -".ts".length);
    return { id, folder, file, mod };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

/** The live phase folders (a, b, f, g, ...): everything outside reserve/. */
export const LIVE_QUESTION_MODULES: readonly OnDiskQuestionModule[] = ON_DISK_QUESTION_MODULES.filter(
  (e) => e.folder !== "reserve",
);

/** The spec 022 reserve/ folder: demoted modules no live flow uses. */
export const RESERVE_QUESTION_MODULES: readonly OnDiskQuestionModule[] = ON_DISK_QUESTION_MODULES.filter(
  (e) => e.folder === "reserve",
);

/**
 * A hand-written validate() case for one module, beyond its own fixtures.
 * `rejects: true` asserts only that the answer is refused; a string also pins
 * the ValidationResult code.
 */
export type ValidateProbe =
  | { value: Answer; accepts: true; note: string }
  | { value: Answer; rejects: string | true; note: string };

export interface ContractOptions {
  /** Extra validate() cases, keyed by module id. */
  probes?: Readonly<Record<string, readonly ValidateProbe[]>>;
  /**
   * Modules whose validate() reports a blank answer with a code other than
   * "required" (e.g. an identifier validator that reports every bad value the
   * same way). Keyed by module id.
   */
  blankCodes?: Readonly<Record<string, string>>;
}

const FREE_TEXT_TYPES = new Set<FlowQuestion["type"]>(["text", "short_text", "autocomplete"]);
const OPTION_TYPES = new Set<FlowQuestion["type"]>(["radio", "select", "multi_select"]);

function formatNext(next: FlowQuestion["next"]): string {
  if (next === undefined) return "(absent)";
  if (next === null) return "null";
  if (typeof next === "string") return next;
  const rules = next.map((rule) => `${rule.default ? "(default)" : rule.condition ?? "(no condition)"} -> ${rule.goto}`);
  return `[${rules.join("; ")}]`;
}

/**
 * The definition facts one snapshot line pins per module: shape, routing,
 * options and declared IR surface. Prompt and help wording are not pinned
 * (the content i18n catalogs own the text); only whether each is present.
 */
export function definitionContract(mod: QuestionModule): string {
  const d = mod.definition;
  const parts: string[] = [
    d.type,
    d.required === undefined ? "required (absent)" : d.required ? "required" : "optional",
    `next ${formatNext(d.next)}`,
  ];
  if (d.engine_resolved !== undefined) parts.push(`engine_resolved ${d.engine_resolved}`);
  if (d.advisory !== undefined) parts.push(`advisory ${d.advisory}`);
  if (d.format !== undefined) parts.push(`format ${d.format}`);
  if (d.options_source !== undefined) parts.push(`options_source ${d.options_source}`);
  if (d.options !== undefined) parts.push(`options [${d.options.map((o) => o.value).join(", ")}]`);
  parts.push(d.prompt ? "prompt" : "no prompt");
  parts.push(d.help_text ? "help_text" : "no help_text");
  parts.push(mod.validate ? "validate" : "no validate");
  parts.push(mod.fixtures.valid.some((f) => f.value === "" || f.value === undefined) ? "blank fixture" : "no blank fixture");
  parts.push(`inputs [${(mod.inputs ?? []).map(formatIRPath).join(", ")}]`);
  parts.push(`writes [${(mod.writes ?? []).map(formatIRPath).join(", ")}]`);
  return parts.join(" | ");
}

function label(value: Answer, note?: string): string {
  return `${JSON.stringify(value)}${note ? ` (${note})` : ""}`;
}

/** Registers the contract suite for `entries`, one describe block per module. */
export function describeQuestionModules(
  title: string,
  entries: readonly OnDiskQuestionModule[],
  options: ContractOptions = {},
): void {
  const probes = options.probes ?? {};
  const blankCodes = options.blankCodes ?? {};

  describe(title, () => {
    it("has modules to check (sanity)", () => {
      expect(entries.length).toBeGreaterThan(0);
    });

    // Every probe must name a module in this suite, or it silently checks nothing.
    it("every validate() probe names a module with validate()", () => {
      const withValidate = new Set(entries.filter((e) => e.mod.validate).map((e) => e.id));
      for (const id of Object.keys(probes)) {
        expect(withValidate.has(id), `probe table names "${id}", which is not a module with validate() here`).toBe(true);
      }
    });

    describe.each(entries.map((e) => [e.file, e] as const))("%s", (_file, { id, mod }) => {
      const { definition, fixtures, validate } = mod;

      it("is a QuestionModule whose definition.id matches its filename", () => {
        expect(typeof definition).toBe("object");
        expect(definition.id).toBe(id);
        expect(typeof fixtures).toBe("object");
        if (validate !== undefined) expect(typeof validate).toBe("function");
      });

      // spec 010 FR-006 / G7: explicit [] for a question that reads or writes
      // nothing, so the dashboard and orphan-input lint can tell "no dependency"
      // from "not yet declared".
      it("declares inputs and writes as arrays", () => {
        expect(Array.isArray(mod.inputs), `${id} is missing 'inputs'`).toBe(true);
        expect(Array.isArray(mod.writes), `${id} is missing 'writes'`).toBe(true);
      });

      it("definition contract", () => {
        expect(definitionContract(mod)).toMatchSnapshot();
      });

      // An engine-resolved node is never rendered, so it has no answer to fixture.
      it(definition.engine_resolved ? "declares no fixtures (engine-resolved)" : "declares at least one valid fixture", () => {
        if (definition.engine_resolved) {
          expect(fixtures.valid).toHaveLength(0);
          expect(fixtures.invalid).toHaveLength(0);
        } else {
          expect(fixtures.valid.length).toBeGreaterThan(0);
        }
      });

      if (validate === undefined) {
        // Nothing to run a fixture THROUGH, so pin that each declared value is a
        // shape the field can hold — a fixture authored as a number would
        // otherwise sit here looking like coverage while asserting nothing.
        it("has no invalid fixtures, and every valid fixture is a field-shaped value", () => {
          expect(fixtures.invalid).toHaveLength(0);
          for (const { value } of fixtures.valid) {
            const ok =
              value === undefined ||
              (definition.type === "multi_select"
                ? Array.isArray(value) && value.every((v) => typeof v === "string")
                : typeof value === "string");
            expect(ok, `fixture ${JSON.stringify(value)} does not fit a ${definition.type} field`).toBe(true);
          }
        });
        return;
      }

      it.each(fixtures.valid)("validate() accepts valid fixture $value", ({ value, note }) => {
        expect(validate(value), label(value, note)).toEqual({ ok: true });
      });

      it.each(fixtures.invalid)("validate() rejects invalid fixture $value", ({ value, note, expectedCode }) => {
        const result = validate(value);
        expect(result.ok, label(value, note)).toBe(false);
        if (expectedCode !== undefined && result.ok === false) {
          expect(result.code, label(value, note)).toBe(expectedCode);
        }
      });

      if (definition.required) {
        const code = blankCodes[id] ?? "required";
        it(`validate() rejects a blank answer with "${code}"`, () => {
          const blanks: Answer[] = [undefined, "", []];
          if (FREE_TEXT_TYPES.has(definition.type)) blanks.push("   ");
          for (const blank of blanks) {
            const result = validate(blank);
            expect(result.ok, label(blank)).toBe(false);
            if (result.ok === false) expect(result.code, label(blank)).toBe(code);
          }
        });
      }

      const declared = definition.options?.map((o) => o.value) ?? [];
      if (OPTION_TYPES.has(definition.type) && declared.length > 0) {
        const asAnswer = (v: string): Answer => (definition.type === "multi_select" ? [v] : v);
        it("validate() accepts every declared option and rejects an undeclared one", () => {
          for (const v of declared) {
            expect(validate(asAnswer(v)), `declared option ${v}`).toEqual({ ok: true });
          }
          expect(validate(asAnswer("__undeclared_option__")).ok, "an undeclared option").toBe(false);
        });
      }

      const own = probes[id] ?? [];
      if (own.length > 0) {
        it.each(own)("validate() probe $value ($note)", (probe) => {
          const result = validate(probe.value);
          if ("accepts" in probe) {
            expect(result, label(probe.value)).toEqual({ ok: true });
          } else {
            expect(result.ok, label(probe.value)).toBe(false);
            if (typeof probe.rejects === "string" && result.ok === false) {
              expect(result.code, label(probe.value)).toBe(probe.rejects);
            }
          }
        });
      }
    });
  });
}
