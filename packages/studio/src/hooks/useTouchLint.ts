import { useState, useEffect, useMemo } from "react";
import { KeyboardLintEngine } from "@keymanapp/keyboard-lint";
import type { LintFinding, VirtualFS, TouchLayoutIR } from "@keyboard-studio/contracts";
import { useDebounce, DEBOUNCE_MS } from "./useDebounce.ts";
import { LINT_ERROR_FINDING } from "../lint/validationErrorFindings.ts";

const engine = new KeyboardLintEngine();

/**
 * Optional context for the 18.6 touch-coverage guard (spec 035 FR-008,
 * KM_LINT_TOUCH_UNCOVERED). Supply the derived/edited touch layout and the
 * confirmed inventory chars to have coverage findings merged with 18.1–18.5.
 */
export interface TouchLintContext {
  layout: TouchLayoutIR;
  inventory: readonly string[];
}

export function useTouchLint(
  fs: VirtualFS | null,
  keyboardId: string | null,
  context?: TouchLintContext | null,
): { touchFindings: LintFinding[]; touchLintRunning: boolean } {
  const [touchFindings, setTouchFindings] = useState<LintFinding[]>([]);
  const [touchLintRunning, setTouchLintRunning] = useState(false);
  // Bundle fs + context into one value memoized on their references so the
  // single useDebounce below only resets its timer when either actually
  // changes (Constitution IV — no second debounce timer; fs and context are
  // debounced together, on the same tick).
  const combined = useMemo(
    () => ({ fs, context: context ?? null }),
    [fs, context],
  );
  const debounced = useDebounce(combined, DEBOUNCE_MS);
  useEffect(() => {
    const debouncedFs = debounced.fs;
    const debouncedContext = debounced.context;
    if (debouncedFs === null || keyboardId === null) {
      setTouchFindings([]);
      setTouchLintRunning(false);
      return;
    }
    let cancelled = false;
    setTouchLintRunning(true);
    const lintPromise = debouncedContext
      ? engine.lintWithContext(debouncedFs, keyboardId, {
          touchLayout: debouncedContext.layout,
          touchInventory: debouncedContext.inventory,
        })
      : engine.lint(debouncedFs, keyboardId);
    lintPromise
      .then((findings: LintFinding[]) => {
        if (cancelled) return;
        setTouchFindings(findings);
        setTouchLintRunning(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("[useTouchLint]", err);
        setTouchFindings([LINT_ERROR_FINDING]);
        setTouchLintRunning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, keyboardId]);
  return { touchFindings, touchLintRunning };
}
