// The installable LDML package (spec 108 FR-074, FR-076): `<kmnid>_ldml.kmp`.
//
// It is built through `buildKmp` (the one packager) from the export's own `source/<id>.kps`, with
// the compiler's `.kmx` and `.kvk` staged into `build/` on a clone. The caller's file map is never
// written, so no compiled artifact can reach the shared projection or a pull request. The touch
// forms are never removed to get a clean compile: any error of any kind means no package.

import { createVirtualFS, type CompilerDiagnostic } from "@keyboard-studio/contracts";
import { buildKmp } from "../../output/kmp.js";
import { addKpsFile, markKpsDesktopOnly } from "../project/kps.js";
import type { KeymanBuildResult } from "./loadLdmlCompiler.js";

export const LDML_COMPILE_REPORT_NAME = "LDML-COMPILE-REPORT.md";

export interface BuildLdmlKmpOptions {
  /** The compile report text (`renderCompileReport`); carried in the package as a document. */
  compileReport?: string;
}

export type BuildLdmlKmpResult =
  | { ok: true; bytes: Uint8Array; filename: string; diagnostics: CompilerDiagnostic[] }
  | { ok: false; reason: string; diagnostics: CompilerDiagnostic[] };

/**
 * @param exportFiles The file map of a successful `buildLdmlExport` (read, never written).
 * @param keyboardId  The KMN keyboard id; the package id is `<keyboardId>_ldml`.
 * @param compiled    The result of `buildLdmlInBrowser` on that export's keyboard document.
 */
export async function buildLdmlKmp(
  exportFiles: ReadonlyMap<string, string | Uint8Array>,
  keyboardId: string,
  compiled: KeymanBuildResult,
  opts: BuildLdmlKmpOptions = {},
): Promise<BuildLdmlKmpResult> {
  const id = `${keyboardId}_ldml`;
  const errors = compiled.messages.filter((m) => m.severity === "error" || m.severity === "fatal");
  if (!compiled.ok || errors.length > 0 || compiled.kmx === undefined) {
    return {
      ok: false,
      reason: `Keyman's compiler reported ${errors.length} error${errors.length === 1 ? "" : "s"}; the installable package is offered only for a clean compile.`,
      diagnostics: [],
    };
  }

  const kpsPath = `source/${id}.kps`;
  const kps = exportFiles.get(kpsPath);
  if (typeof kps !== "string") {
    return { ok: false, reason: `The LDML export has no ${kpsPath}.`, diagnostics: [] };
  }

  // A clone: the staging below never reaches `exportFiles`.
  const vfs = createVirtualFS();
  for (const [path, content] of exportFiles) vfs.set(path, content, typeof content !== "string");
  let descriptor = markKpsDesktopOnly(kps);
  if (opts.compileReport !== undefined) {
    vfs.set(`source/${LDML_COMPILE_REPORT_NAME}`, opts.compileReport, false);
    descriptor = addKpsFile(descriptor, LDML_COMPILE_REPORT_NAME, ".md");
  }
  vfs.set(kpsPath, descriptor, false);

  const built = await buildKmp(vfs, id, {
    kmx: compiled.kmx,
    ...(compiled.kvk === undefined ? {} : { kvk: compiled.kvk }),
  });
  if (!built.success) {
    const blocking = built.diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal");
    return {
      ok: false,
      reason: blocking[0]?.message ?? "The package could not be built.",
      diagnostics: built.diagnostics,
    };
  }
  return { ok: true, bytes: built.bytes, filename: built.filename, diagnostics: built.diagnostics };
}
