// outputFormUniformity — projection-time assertion (spec 106 plan P2.4) that
// the generated keyboard text follows the one output form. Diagnostic only:
// the projection pushes a warning, never user-facing.
//
// A "run" is a maximal sequence of adjacent literal characters in one rule
// output or one store. Under base-plus-mark a run must already be NFD; under
// ready-made it must already be NFC (no base+mark pair with a single-character
// form left decomposed).

import type { KeyboardIR, OutputForm } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";

function runsOf(ir: KeyboardIR): string[] {
  const runs: string[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      let run = "";
      for (const el of rule.output) {
        if (el.kind === "char") {
          run += el.value;
        } else if (run !== "") {
          runs.push(run);
          run = "";
        }
      }
      if (run !== "") runs.push(run);
    }
  }
  for (const store of ir.stores) {
    if (store.isSystem) continue;
    let run = "";
    for (const item of store.items) {
      if (item.kind === "char") {
        run += item.value;
      } else if (run !== "") {
        runs.push(run);
        run = "";
      }
    }
    if (run !== "") runs.push(run);
  }
  return runs;
}

/** The distinct runs in `kmn` that are in the wrong form for `form`. */
export function formViolations(kmn: string, keyboardId: string, form: OutputForm): Set<string> {
  const target = form === "base-plus-mark" ? "NFD" : "NFC";
  const bad = new Set<string>();
  for (const run of runsOf(parseKmn(kmn, keyboardId).ir)) {
    if (run.normalize(target) !== run) bad.add(run);
  }
  return bad;
}

const hex = (s: string): string =>
  [...s].map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`).join(" ");

/**
 * Warning text for runs the assignments introduced in the wrong form, or
 * `undefined` when none. `before` is the violation set of the text the
 * assignments were applied to, so the starting keyboard's own text is not blamed.
 */
export function outputFormWarning(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
  form: OutputForm,
): string | undefined {
  const introduced = [...after].filter((run) => !before.has(run));
  if (introduced.length === 0) return undefined;
  return `[project-working-copy] output form ${form} not uniform in generated rules: ${introduced
    .map(hex)
    .join(", ")}`;
}
