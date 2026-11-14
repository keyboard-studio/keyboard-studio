// compileCandidateKmn -- one explicit compile of a Code-tab candidate (spec 117 US8, FR-061).
//
// The Code tab's Apply gate compiles the candidate once, on the author's click, through the
// compile service the download path uses (`buildOutputBundle`). It is not part of the 300 ms
// validation cycle (decision D3): it starts no timer and races nothing.
//
// The candidate is the output projection run with the edit appended to the recorded `kmn-edits`
// (`projectWorkingCopyForOutput({ candidateKmnEdit })`), so the candidate .kmn is exactly what the
// real replay at step 2.2 builds, with the later steps acting on it, and the compile sees what the
// download will ship. Compiling the editor's own text instead would be wrong: it is the working
// IR's text, before the projection renames the keyboard's files and rewrites its asset stores, so a
// keyboard that compiles as shipped could fail here on a file it no longer has. A change the
// replay reports as a miss finds no anchor in the keyboard as it will be built: it is
// `unplaceable` (it would apply live and vanish from the download). The projected VFS is a clone,
// never the store's own.

import type { CompilerDiagnostic, IRChange } from "@keyboard-studio/contracts";
import { nextCodeEdit } from "./nextCodeEdit.ts";
import { getCompile, USE_REAL } from "./services.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";

export type CandidateCompileResult =
  | { status: "ok" }
  | { status: "errors"; diagnostics: CompilerDiagnostic[] }
  /** Some change finds no anchor in the keyboard as it will be built, so the download would lose it. */
  | { status: "unplaceable" }
  /**
   * The compile service is not wired here: the mock engine (`USE_REAL` false), or the projection
   * has no working copy. Apply accepts this one status (the Layer A gate still ran). A service
   * that IS wired but fails is `errors`, never `unavailable`.
   */
  | { status: "unavailable" };

export async function compileCandidateKmn(changes: readonly IRChange[]): Promise<CandidateCompileResult> {
  if (!USE_REAL) return { status: "unavailable" };
  const candidate = nextCodeEdit(changes);
  const projected = await projectWorkingCopyForOutput({ candidateKmnEdit: candidate });
  if (projected === null) return { status: "unavailable" };
  const { vfs, keyboardId, warnings } = projected;
  if (warnings.some((w) => w.startsWith(`[project-working-copy] layout edit ${candidate.seq} skipped`))) {
    return { status: "unplaceable" };
  }
  // A wired service that cannot load or throws blocks the Apply (fail closed): a broken
  // compile service must not let an unchecked edit through. Empty diagnostics render the
  // generic "does not compile" message.
  let result: Awaited<ReturnType<Awaited<ReturnType<typeof getCompile>>>>;
  try {
    const compile = await getCompile();
    result = await compile(vfs, keyboardId);
  } catch {
    return { status: "errors", diagnostics: [] };
  }
  const errors = result.diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal");
  const hasKmx = result.artifacts.some((a) => a.filename.toLowerCase().endsWith(".kmx"));
  if (errors.length > 0 || !hasKmx) return { status: "errors", diagnostics: errors };
  return { status: "ok" };
}
