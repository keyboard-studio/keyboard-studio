// buildOutputBundle — the one place the shipped artifacts are assembled.
//
// Layered ON TOP of projectWorkingCopyForOutput rather than inside it. That
// function is shared with the GitHub fork+PR path (Options A and B), and
// compiled artifacts must not reach a community PR (spec §12, criteria SS1). So
// the compile and the `build/` staging happen here, in the download path only.
//
// Pipeline:
//   projectWorkingCopyForOutput()   carve + assignments + identity + descriptor
//                                   + id rename  (shared with the PR path)
//     -> ensurePackageFiles()       welcome/readme/LICENSE the descriptor lists
//     -> compile()                  the projected .kmn, under its final id
//     -> stage build/<id>.{kmx,kvk,js}
//
// WHY RECOMPILE instead of reusing the preview's `stage.compileResult`: the
// preview compiled `stage.vfs`, while the output projection is built from the
// store's baseVfs and carries the assignments and the final keyboard id. The two
// can differ. Shipping a package whose `.kmx` was built from different source
// than its own descriptor would be a silent correctness bug, and it is precisely
// the class of defect the descriptor's single-writer rule exists to prevent.
//
// This is NOT a second validation cycle (decision D3): it runs once per explicit
// download click and emits no live diagnostics into the editor.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import type { CompilerDiagnostic, VirtualFS } from "@keyboard-studio/contracts";
import { projectWorkingCopyForOutput, zipProjectedVfs } from "./serializeWorkingCopy.ts";
import { getBuildKmp, getCompile, getEnsurePackageFiles } from "./services.ts";

/** The compiled artifacts, keyed the way `buildKmp` expects them. */
export interface OutputArtifacts {
  kmx: Uint8Array;
  kvk?: Uint8Array;
  js?: Uint8Array;
}

export interface OutputBundle {
  /** The projected working copy, with `build/` staged. */
  vfs: VirtualFS;
  keyboardId: string;
  displayName: string;
  /** Release version, already bumped on the adapt track. */
  version: string;
  /** Compiled artifacts, for the package builder. */
  artifacts: OutputArtifacts;
  /** Diagnostics from the output compile. */
  compileDiagnostics: CompilerDiagnostic[];
  /** Projection warnings, plus any doc stub this call had to synthesize. */
  warnings: string[];
}

/**
 * Thrown when the bundle cannot be assembled. Carries the compile diagnostics so
 * the caller can render *why* rather than a bare "download failed".
 */
export class OutputBundleError extends Error {
  readonly diagnostics: CompilerDiagnostic[];
  constructor(message: string, diagnostics: CompilerDiagnostic[] = []) {
    super(message);
    this.name = "OutputBundleError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Project, complete, and compile the working copy for output.
 *
 * Returns `null` when the working copy is not instantiated — the same contract
 * `projectWorkingCopyForOutput` uses, so callers keep their existing
 * "nothing to download" guard.
 *
 * Throws {@link OutputBundleError} when the projection succeeded but the compile
 * produced no `.kmx`. That is a real failure with a real cause (a dangling asset
 * reference, a syntax error), and the diagnostics say which.
 */
export async function buildOutputBundle(): Promise<OutputBundle | null> {
  const projected = await projectWorkingCopyForOutput();
  if (projected === null) return null;

  const { vfs, keyboardId, displayName, version } = projected;
  const warnings = [...projected.warnings];

  // The descriptor lists welcome.htm / readme.htm; the adapt track has neither.
  // Report what had to be synthesized — a silently generated file is how the
  // missing descriptor stayed invisible for as long as it did.
  try {
    const ensurePackageFiles = await getEnsurePackageFiles();
    // No copyright holder is plumbed: `IdentityPatch` does not carry one (only
    // the projection's own input shape does), so the stub falls back to the
    // display name rather than inventing a store field for it here.
    const { created } = ensurePackageFiles({ vfs, displayName });
    if (created.length > 0) {
      devLog.info("[output] synthesized package files:", created);
      warnings.push(
        `[package] generated missing package files: ${created.join(", ")}`,
      );
    }
  } catch (err: unknown) {
    // Non-fatal: if the files already exist the package builds anyway, and if
    // they do not the package builder reports the missing member by name.
    devLog.warn("[output] ensurePackageFiles unavailable:", err);
  }

  // Compile the PROJECTED copy under its FINAL id.
  const compile = await getCompile();
  const result = await compile(vfs, keyboardId);
  const compileDiagnostics = result.diagnostics;

  const pick = (ext: string): Uint8Array | undefined =>
    result.artifacts.find((a) => a.filename.toLowerCase().endsWith(ext))?.data;

  const kmx = pick(".kmx");
  if (kmx === undefined) {
    // Deliberately NOT stripping dangling asset stores to force artifacts out,
    // the way the live preview does. The preview needs none of those assets and
    // strips them to render something; a shipped keyboard that silently lost its
    // declared visual keyboard or icon is worse than a clear error.
    throw new OutputBundleError(
      "The keyboard did not compile, so no installable package could be built.",
      compileDiagnostics,
    );
  }

  const kvk = pick(".kvk");
  const js = pick(".js");

  // Stage into `build/`, where the descriptor's `..\build\<id>.*` members point.
  vfs.set(`build/${keyboardId}.kmx`, kmx, true);
  if (kvk !== undefined) vfs.set(`build/${keyboardId}.kvk`, kvk, true);
  if (js !== undefined) vfs.set(`build/${keyboardId}.js`, js, true);

  return {
    vfs,
    keyboardId,
    displayName,
    version,
    artifacts: { kmx, ...(kvk !== undefined ? { kvk } : {}), ...(js !== undefined ? { js } : {}) },
    compileDiagnostics,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// The two downloads
// ---------------------------------------------------------------------------

export interface DownloadResult {
  bytes: Uint8Array;
  /** Filename to offer, already including the version where applicable. */
  filename: string;
  warnings: string[];
}

/**
 * Build the installable `.kmp` — the PRIMARY download.
 *
 * A user double-clicks this and the keyboard installs on Keyman for Windows,
 * macOS, Linux, iOS, or Android. No Keyman Developer, no unzipping, no compile.
 *
 * Returns `null` when the working copy is not instantiated. Throws
 * {@link OutputBundleError} with diagnostics when the compile or the packaging
 * failed — the caller renders those and leaves the source `.zip` available, so a
 * failed package never dead-ends the author.
 */
export async function buildKmpForDownload(): Promise<DownloadResult | null> {
  const bundle = await buildOutputBundle();
  if (bundle === null) return null;

  const buildKmp = await getBuildKmp();
  const result = await buildKmp(bundle.vfs, bundle.keyboardId, bundle.artifacts);

  if (!result.success || result.bytes.byteLength === 0) {
    throw new OutputBundleError("Could not build the installable package.", [
      ...bundle.compileDiagnostics.filter(
        (d) => d.severity === "error" || d.severity === "fatal",
      ),
      ...result.diagnostics,
    ]);
  }

  return {
    bytes: result.bytes,
    // Deliberately unversioned, matching how Keyman packages are distributed:
    // the version lives inside kmp.json, and Keyman shows it at install time.
    filename: result.filename,
    warnings: bundle.warnings,
  };
}

/**
 * Build the source `.zip` — the SECONDARY download, for editing or contributing.
 *
 * Unlike {@link serializeWorkingCopy} (which projects source only, and which the
 * decision-audit comparisons depend on staying that way), this includes the
 * compiled `build/` artifacts, so the shipped descriptor's `..\build\<id>.*`
 * references actually resolve and the project opens cleanly in Keyman Developer.
 * Spec §12 always claimed the archive carried them; until now it did not.
 *
 * The `.kmp` itself is NOT included — it is its own download.
 */
export async function buildSourceZipForDownload(): Promise<DownloadResult | null> {
  const bundle = await buildOutputBundle();
  if (bundle === null) return null;

  const bytes = await zipProjectedVfs(bundle.vfs);

  return {
    bytes,
    filename: `${bundle.keyboardId}-${bundle.version}.zip`,
    warnings: bundle.warnings,
  };
}
