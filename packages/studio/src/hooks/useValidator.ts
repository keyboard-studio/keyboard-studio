import { useState, useEffect } from "react";
import type { LintFinding } from "@keyboard-studio/contracts";
import { runAllChecks } from "@keyboard-studio/engine";
import { useDebounce } from "./useDebounce.ts";

export interface ValidatorResult {
  findings: LintFinding[];
  running: boolean;
}

export function useValidator(kmnSource: string | null): ValidatorResult {
  const [findings, setFindings] = useState<LintFinding[]>([]);
  const [running, setRunning] = useState(false);

  const debouncedSource = useDebounce(kmnSource, 300);

  useEffect(() => {
    setRunning(true);
    if (debouncedSource === null) {
      setFindings([]);
      setRunning(false);
      return;
    }
    try {
      setFindings(runAllChecks(debouncedSource));
    } catch {
      setFindings([]);
    } finally {
      setRunning(false);
    }
  }, [debouncedSource]);

  return { findings, running };
}
