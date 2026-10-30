// Identity, attribution and project name: the identity prefill (defaultsFor, deriveScriptPrefill); case fields are overrides.
//
// Stub (spec 107 T016): completes the step with its own state untouched, the
// result a component passes when Continue is pressed with nothing changed.

import type { StepDrivers } from "./types.ts";

export const identityDrivers: StepDrivers = {
  identity: () => undefined,
  attribution: () => undefined,
  project_name: () => undefined,
};
