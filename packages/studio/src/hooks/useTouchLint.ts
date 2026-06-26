import { useState, useEffect } from "react";
import { KeyboardLintEngine } from "@keymanapp/keyboard-lint";
import type { LintFinding, VirtualFS } from "@keyboard-studio/contracts";
import { useDebounce, DEBOUNCE_MS } from "./useDebounce.ts";
import { LINT_ERROR_FINDING } from "../lint/validationErrorFindings.ts";

const engine = new KeyboardLintEngine();

export function useTouchLint(
  fs: VirtualFS | null,
  keyboardId: string | null,
): { touchFindings: LintFinding[]; touchLintRunning: boolean } {
  const [touchFindings, setTouchFindings] = useState<LintFinding[]>([]);
  const [touchLintRunning, setTouchLintRunning] = useState(false);
  const debouncedFs = useDebounce(fs, DEBOUNCE_MS);
  useEffect(() => {
    if (debouncedFs === null || keyboardId === null) {
      setTouchFindings([]);
      setTouchLintRunning(false);
      return;
    }
    let cancelled = false;
    setTouchLintRunning(true);
    engine.lint(debouncedFs, keyboardId).then((findings: LintFinding[]) => {
      if (!cancelled) { setTouchFindings(findings); setTouchLintRunning(false); }
    }).catch((err: unknown) => {
      // Guard: skip state injection after unmount/dep-change so we never set
      // state on a torn-down effect.
      if (!cancelled) {
        console.error("[useTouchLint]", err);
        setTouchFindings([LINT_ERROR_FINDING]);
        setTouchLintRunning(false);
      }
    });
    return () => { cancelled = true; };
  }, [debouncedFs, keyboardId]);
  return { touchFindings, touchLintRunning };
}
