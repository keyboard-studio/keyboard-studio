// useReformatConsent -- the one place Open mode's "agree to a full re-emit"
// (spec 111 FR-009) is asked for, shared by every delivery path (downloads and
// the pull-request submit).
//
// `guard(run)` runs the delivery with consent withheld. When the projection
// reports files it could not update in place it throws
// ReformatConsentRequiredError; the hook then opens the dialog and halts. On
// agreement `run(true)` is called and its result returned; on keep the delivery
// is cancelled (`undefined`). No timer.

import { useCallback, useRef, useState } from "react";
import { ReformatConsentRequiredError } from "../lib/reformatConsentError.ts";

export interface ReformatConsentProps {
  open: boolean;
  files: readonly string[];
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
  const [files, setFiles] = useState<readonly string[] | null>(null);
  const answerRef = useRef<((agreed: boolean) => void) | null>(null);

  const answer = useCallback((agreed: boolean) => {
    const resolve = answerRef.current;
    answerRef.current = null;
    setFiles(null);
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
          setFiles(err.files);
        });
        return agreed ? await run(true) : undefined;
      }
    },
    [],
  );

  return {
    guard,
    dialog: {
      open: files !== null,
      files: files ?? [],
      onConsent: () => answer(true),
      onCancel: () => answer(false),
    },
  };
}
