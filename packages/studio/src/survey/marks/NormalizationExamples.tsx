// NormalizationExamples — up to five `pasted -> result` rows for the author's
// preview of the generated normalization step (spec 086 FR-020).
//
// A semantic list; each row's glyphs are decorative (`aria-hidden`) and the
// row's accessible text is built from the code-point names of both sides, via
// the same naming helper the context-tolerance notice uses (spec 056).

import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";

import { loadContextToleranceEngine } from "../../lib/contextToleranceEngine.ts";
import { describeChar } from "../../lint/ContextToleranceNotice.tsx";
import { visuallyHidden } from "../surveyStyles.ts";

type CharNames = ReadonlyMap<number, string>;

export interface NormalizationExample {
  pasted: string;
  result: string;
}

export interface NormalizationExamplesProps {
  examples: readonly NormalizationExample[];
  /** Injected in tests; defaults to the engine's lazy Unicode-name table. */
  loadNames?: () => Promise<CharNames>;
}

const MAX_ROWS = 5;

const defaultLoadNames = async (): Promise<CharNames> => (await loadContextToleranceEngine()).loadCharNames();

/** A combining mark shown on its own sits on a dotted circle (U+25CC), the usual carrier. */
function glyphs(text: string): string {
  return [...text].map((ch) => (/^\p{M}$/u.test(ch) ? `◌${ch}` : ch)).join("");
}

function spoken(text: string, names: CharNames | null): string {
  return [...text].map((ch) => describeChar(ch, names)).join(", ");
}

export function NormalizationExamples({ examples, loadNames = defaultLoadNames }: NormalizationExamplesProps) {
  const { t } = useLingui();
  const [names, setNames] = useState<CharNames | null>(null);
  useEffect(() => {
    let live = true;
    loadNames().then(
      (loaded) => {
        if (live) setNames(loaded);
      },
      () => {
        // Without names the rows fall back to bare code points; nothing to report.
      },
    );
    return () => {
      live = false;
    };
  }, [loadNames]);

  const rows = examples.slice(0, MAX_ROWS);
  if (rows.length === 0) return null;
  return (
    <ul data-testid="normalization-examples" style={{ margin: "4px 0 8px 0", paddingLeft: 18 }}>
      {rows.map((row, i) => {
        const pasted = spoken(row.pasted, names);
        const result = spoken(row.result, names);
        return (
          <li key={`${row.pasted}-${i}`} style={{ fontSize: 14, lineHeight: 1.6 }}>
            <span aria-hidden="true">
              {glyphs(row.pasted)} → {glyphs(row.result)}
            </span>
            <span style={visuallyHidden}>
              {t({ id: "marks.context_tolerance.step.examples.row", message: `${pasted} becomes ${result}` })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
