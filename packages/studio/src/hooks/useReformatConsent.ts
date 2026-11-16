// useReformatConsent -- the one place Open mode's "agree to a full re-emit"
// (spec 111 FR-009) is asked for. Its only consumer is `OpenApplyHost`, which asks
// when an applied change cannot be placed precisely in a file; the output and the
// pull-request submit ask nothing (every change is in the files when it is applied).
//
// `guard(run)` runs the change with consent withheld. When the apply reports files it
// could not update in place it throws ReformatConsentRequiredError; the hook then
// opens the dialog and halts. On agreement `run(true)` is called and its result
// returned; on keep the change is cancelled (`undefined`). No timer.

import { useCallback, useRef, useState } from "react";
import { ReformatConsentRequiredError } from "../lib/reformatConsentError.ts";
import type { TouchReplacementSummary } from "../lib/openApply/types.ts";

export interface ReformatConsentProps {
  open: boolean;
  files: readonly string[];
  /** Set to ask about replacing or creating the touch layout (with what changes) instead of a reformat. */
  touchReplacement?: TouchReplacementSummary | undefined;
  onConsent: () => void;
  onCancel: () => void;
}

export interface ReformatConsent {
  /** Props for `<ReformatConsentDialog />`. */
  dialog: ReformatConsentProps;
  /** Run a delivery; resolves `undefined` when the author declined. */
  guard: <T>(run: (consentedReemit: boolean) => Promise<T>) => Promise<T | undefined>;
}

export function useReformatConsent(): ReformatConsent {
  const [asked, setAsked] = useState<{
    files: readonly string[];
    touchReplacement: TouchReplacementSummary | undefined;
  } | null>(null);
  const answerRef = useRef<((agreed: boolean) => void) | null>(null);

  const answer = useCallback((agreed: boolean) => {
    const resolve = answerRef.current;
    answerRef.current = null;
    setAsked(null);
    resolve?.(agreed);
  }, []);

  const guard = useCallback(
    async <T,>(run: (consentedReemit: boolean) => Promise<T>): Promise<T | undefined> => {
      try {
        return await run(false);
      } catch (err) {
        if (!(err instanceof ReformatConsentRequiredError)) throw err;
        const agreed = await new Promise<boolean>((resolve) => {
          answerRef.current = resolve;
          setAsked({ files: err.files, touchReplacement: err.touchReplacement });
        });
        return agreed ? await run(true) : undefined;
      }
    },
    [],
  );

  return {
    guard,
    dialog: {
      open: asked !== null,
      files: asked?.files ?? [],
      touchReplacement: asked?.touchReplacement,
      onConsent: () => answer(true),
      onCancel: () => answer(false),
    },
  };
}
