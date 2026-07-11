// see spec.md §12 — zip serialization of the virtual FS for download

import { zipSync, type Zippable } from "fflate";
import type { OutputService, VirtualFS } from "@keyboard-studio/contracts";

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
3. Copy the contents of this zip into \`release/<first-letter>/<your-keyboard-id>/\`
4. Commit and push your branch
5. Open a pull request from your fork to \`keyboard-studio/keyboards:master\`

## Option B — Email submission

Email the zip archive to keymanhelp@sil.org with the subject:
"New keyboard submission: <your-keyboard-id>"

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

/**
 * Serialize a {@link VirtualFS} snapshot to a `.zip` archive.
 *
 * Per spec §12:
 *   - All entries (source AND compiled artifacts) are included.
 *   - `NEXT_STEPS.md` is injected, explaining how to submit to keymanapp/keyboards.
 *   - Binary entries are stored uncompressed (level 0).
 *   - Text entries are deflated (level 6).
 *
 * Implements {@link OutputService.toZip}.
 */
export async function toZip(fs: VirtualFS): Promise<Uint8Array> {
  const files: Zippable = {};

  for (const entry of fs.entries()) {
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
