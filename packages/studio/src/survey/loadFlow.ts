// YAML flow loader for the browser environment.
// Uses Vite ?raw imports to get the YAML source as a string, then parses it
// with the same `yaml` package the engine uses for content/patterns/*.yaml.
// This keeps the loading strategy consistent across the monorepo.

import { parse } from "yaml";
import type { FlowDef } from "./types.ts";
import { VALID_PHASES } from "./constants.ts";

/**
 * Parse a raw YAML string (from a `?raw` Vite import) into a FlowDef.
 * Throws if the YAML cannot be parsed or lacks the required `flow_id` field.
 */
export function parseFlow(raw: string): FlowDef {
  const parsed = parse(raw) as unknown;
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("flow_id" in parsed) ||
    !("questions" in parsed)
  ) {
    throw new Error("Invalid flow YAML: missing flow_id or questions");
  }
  if (!("phase" in parsed) || !VALID_PHASES.has((parsed as { phase?: string }).phase ?? "")) {
    throw new Error("Invalid flow YAML: missing or unknown phase");
  }
  return parsed as FlowDef;
}
