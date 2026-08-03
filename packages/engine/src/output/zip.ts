// see spec.md §12 — zip serialization of the virtual FS for download
//
// ARCHIVE SHAPE, AND ONE OPEN QUESTION FOR THE KEYMAN TEAM (specs/053, FR-020)
//
// The archive root IS the keyboard's directory content (`source/<id>.kmn`,
// `<id>.kps`, `build/…`), and `NEXT_STEPS.md` has always been injected beside it.
// There is therefore no existing "beside, not inside" position in this archive:
// studio metadata and keyboard files share the root.
//
// FR-020 asks for the decision record to sit beside the keyboard's directory
// rather than inside it. What ships is the closest thing this layout allows — a
// clearly-named `.studio/` prefix at the root, excluded from the pull-request
// commit by `isSidecarPath` (see ./sidecar.ts) and named in NEXT_STEPS.md as
// not-to-be-copied. The keyboard's own files are byte-identical to a hand-authored
// submission either way, which is the property SC-008 actually turns on.
//
// DEFERRED, deliberately: making the separation POSITIONAL — nesting the keyboard
// under `<id>/` so the metadata is a true sibling — changes the shape of every
// archive the studio has ever emitted and of the copy instructions people already
// follow. That is a Keyman-team-facing call, not one to make inside this feature.
// See specs/053-decision-audit/research.md D-07 and plan.md's Summary.

import { zipSync, type Zippable } from "fflate";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { DecisionRecord, OutputService, VirtualFS } from "@keyboard-studio/contracts";
import { addDecisionRecordSidecar } from "../decision-audit/sidecar.js";
import { STUDIO_METADATA_PREFIX } from "./sidecar.js";

// TextEncoder is global in Node 20+ and all modern browsers but absent from
// the engine's lib.es2022-only tsconfig; cast through unknown.
const enc = new (
  globalThis as unknown as { TextEncoder: new () => { encode(s: string): Uint8Array } }
).TextEncoder();

const NEXT_STEPS_MD = `# Next Steps

Your keyboard has been packaged and is ready to submit to the Keyman keyboard repository.

## Option A — Submit via GitHub (recommended)

1. Fork \`keyboard-studio/keyboards\` at https://github.com/keyboard-studio/keyboards
2. Create a branch: \`git checkout -b add/<your-keyboard-id>\`
3. Copy the keyboard files into \`release/<first-letter>/<your-keyboard-id>/\`.
   Do not copy \`NEXT_STEPS.md\` or the \`${STUDIO_METADATA_PREFIX}\` folder — see "Studio metadata" below.
4. Commit and push your branch
5. Open a pull request from your fork to \`keyboard-studio/keyboards:master\`

## Option B — Email submission

Email the zip archive to keymanhelp@sil.org with the subject:
"New keyboard submission: <your-keyboard-id>"

## Studio metadata (not part of the keyboard)

This file and everything under \`${STUDIO_METADATA_PREFIX}\` were added by keyboard-studio
for you, not for the keyboard repository. Do not copy them into
\`release/<first-letter>/<your-keyboard-id>/\` — the keyboard's directory should look
exactly as it would if you had written it by hand.

- \`${STUDIO_METADATA_PREFIX}decision-record.json\` — the record of the decisions you made while
  authoring, and what each one changed in the source. Useful for picking the work
  up again later, or for answering a reviewer's question about why something is
  the way it is.

## Resources

- Keyman keyboard contribution guide: https://help.keyman.com/developer/keyboards/
- keyboard-studio documentation: https://github.com/keyboard-studio/keyboard-studio
`;

/**
 * Clamp a VirtualFS key to a safe, root-relative archive entry name.
 *
 * VFS keys are used verbatim as zip entry names, and a sibling-store path
 * lifted out of a `.kmn` header (e.g. `store(&DISPLAYMAP) '..\..\..\x'`) can
 * carry `..` / absolute / drive-letter segments. Writing those unmodified
 * produces a zip-slip entry that escapes the extraction directory on naive
 * extractors. Normalising POSIX-style — backslashes to slashes, resolving `.`
 * and `..`, dropping any leading `/` or drive letter, and clamping `..` at the
 * root so it can never rise above it — neutralises the traversal while leaving
 * ordinary clean keys (the overwhelming common case) byte-identical.
 */
function safeEntryName(path: string): string {
  const segments: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segments.length > 0) segments.pop();
      continue;
    }
    // Strip a Windows drive prefix on the first segment (e.g. "C:").
    if (segments.length === 0 && /^[A-Za-z]:$/.test(part)) continue;
    segments.push(part);
  }
  return segments.join("/");
}

export interface ToZipOptions {
  /**
   * Decision record to package as studio metadata (specs/053-decision-audit
   * FR-020). Omitted for a session that recorded nothing; the archive is then
   * byte-for-byte what it was before the feature existed.
   */
  decisionRecord?: DecisionRecord;
}

/**
 * Serialize a {@link VirtualFS} snapshot to a `.zip` archive.
 *
 * Per spec §12:
 *   - All entries (source AND compiled artifacts) are included.
 *   - `NEXT_STEPS.md` is injected, explaining how to submit to keymanapp/keyboards.
 *   - Binary entries are stored uncompressed (level 0).
 *   - Text entries are deflated (level 6).
 *
 * A supplied `decisionRecord` is written through `addDecisionRecordSidecar` onto
 * a DETACHED copy of the entry list — the caller's projected VFS is the live
 * working copy's projection, and packaging must not mutate it. Routing through
 * that writer rather than adding the file here keeps the record's path and its
 * serialization in one place, so the packaged bytes and the persisted record
 * cannot be different renderings of the same data.
 *
 * Implements {@link OutputService.toZip} — the extra options parameter is
 * optional, so this stays assignable to the locked service signature.
 */
export async function toZip(fs: VirtualFS, opts: ToZipOptions = {}): Promise<Uint8Array> {
  const files: Zippable = {};

  const source =
    opts.decisionRecord === undefined
      ? fs
      : addDecisionRecordSidecar(createVirtualFS(fs.entries()), opts.decisionRecord);

  for (const entry of source.entries()) {
    const bytes: Uint8Array =
      typeof entry.content === "string"
        ? enc.encode(entry.content)
        : entry.content;
    const name = safeEntryName(entry.path);
    if (name === "") continue; // path resolved to nothing outside the root — drop it
    files[name] = entry.isBinary
      ? [bytes, { level: 0 }]
      : [bytes, { level: 6 }];
  }

  // Always inject NEXT_STEPS.md (spec §12 "Download .zip" requirement)
  files["NEXT_STEPS.md"] = [enc.encode(NEXT_STEPS_MD), { level: 6 }];

  return zipSync(files);
}

/** Alias for {@link toZip} — matches the name used in issue #46 acceptance criteria. */
export const serializeToZip: OutputService["toZip"] = toZip;
