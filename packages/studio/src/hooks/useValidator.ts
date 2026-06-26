import { useState, useEffect } from "react";
import type { LintFinding } from "@keyboard-studio/contracts";
import { runAllChecks } from "@keyboard-studio/engine";
import { useDebounce, DEBOUNCE_MS } from "./useDebounce.ts";
import { VALIDATOR_ERROR_FINDING } from "../lint/validationErrorFindings.ts";

export interface ValidatorResult {
  findings: LintFinding[];
  running: boolean;
}

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
    setRunning(true);
    try {
      setFindings(runAllChecks(debouncedSource));
    } catch (err: unknown) {
      console.error('[useValidator] runAllChecks threw:', err);
      setFindings([VALIDATOR_ERROR_FINDING]);
    } finally {
      setRunning(false);
    }
  }, [debouncedSource]);

  return { findings, running };
}
