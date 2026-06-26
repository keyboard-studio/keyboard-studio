import { useState, useEffect } from "react";
import type { LintFinding } from "@keyboard-studio/contracts";
import { validateWithOracle } from "@keyboard-studio/engine";
import { useDebounce, DEBOUNCE_MS } from "./useDebounce.ts";
import { VALIDATOR_ERROR_FINDING } from "../lint/validationErrorFindings.ts";

export interface ValidatorResult {
  findings: LintFinding[];
  running: boolean;
}

// We call validateWithOracle (not the synchronous runAllChecks) so the SPA
// runs the WASM-only Layer-A checks AND surfaces KM_WARN_ORACLE_UNAVAILABLE
// when the oracle is down — otherwise WASM-down degradation is silent (#494).
// validateWithOracle runs the TS + WASM tasks concurrently within one cycle;
// the single 300 ms timer is supplied by useDebounce below — we add no second
// timer, per Decision D3 / spec §10.
export function useValidator(kmnSource: string | null): ValidatorResult {
  const [findings, setFindings] = useState<LintFinding[]>([]);
  const [running, setRunning] = useState(false);

  const debouncedSource = useDebounce(kmnSource, DEBOUNCE_MS);

  useEffect(() => {
    if (debouncedSource === null) {
      setFindings([]);
      setRunning(false);
      return;
    }
    // Stale-guard: a newer debounced source must win even if its async
    // validation resolves before an in-flight older one. Flip on cleanup.
    // The guard is required in .finally() too: a superseded cycle must NOT
    // clear `running`, because the newer cycle (which already called
    // setRunning(true)) is still in flight — clearing it here would race it
    // to a spurious running:false. Only the live cycle controls `running`.
    let cancelled = false;
    setRunning(true);
    validateWithOracle(debouncedSource)
      .then((next) => {
        if (cancelled) return;
        setFindings(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // An unexpected rejection must stay user-visible (#606): surface the
        // synthetic VALIDATOR_ERROR_FINDING rather than silently clearing to [].
        console.error("[useValidator] validateWithOracle threw:", err);
        setFindings([VALIDATOR_ERROR_FINDING]);
      })
      .finally(() => {
        if (cancelled) return;
        setRunning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSource]);

  return { findings, running };
}
