// Sprint-1 stub — superseded by scaffold-over-IR (#238).
// Delete this file entirely when #238 lands.

import type { VirtualFS } from "@keyboard-studio/contracts";

// Single-quoted strings in keyboard files have no escape sequence;
// U+2019 RIGHT SINGLE QUOTATION MARK is the safe typographic substitute.
function escapeQuote(s: string): string {
  return s.replace(/'/g, "’");
}

/**
 * Directly replaces the display name, copyright text, and/or version number
 * stored as plain-text metadata lines at the top of a keyboard source file.
 *
 * Only the three lines explicitly provided in `identity` are changed.
 * Everything else in the file — keyboard rules, other metadata, comments —
 * is left exactly as-is.
 *
 * @param vfs        The in-memory file system holding the keyboard source files.
 * @param keyboardId The keyboard identifier; the file read is `source/<id>.kmn`.
 * @param identity   Fields to update. Omit a field to leave that line unchanged.
 *
 * Note: any straight single quote (') in a provided string is replaced with
 * RIGHT SINGLE QUOTATION MARK (U+2019) — KMN single-quoted strings have no
 * escape sequence; U+2019 is the safe typographic substitute.
 *
 * @throws if the keyboard source file is not present in `vfs`.
 */
export function applyIdentityStubMutation(
  vfs: VirtualFS,
  keyboardId: string,
  identity: { name?: string; copyright?: string; version?: string }
): void {
  const path = `source/${keyboardId}.kmn`;
  const entry = vfs.get(path);
  if (entry === undefined) {
    throw new Error(
      `stub-mutator: keyboard file not found in VirtualFS: ${path}`
    );
  }
  if (typeof entry.content !== "string") {
    throw new Error(
      `stub-mutator: keyboard file is binary, expected text: ${path}`
    );
  }

  const updated = entry.content
    .split("\n")
    .map((line) => {
      if (
        identity.name !== undefined &&
        /^\s*store\s*\(\s*&NAME\s*\)/i.test(line)
      ) {
        return `store(&NAME) '${escapeQuote(identity.name)}'`;
      }
      if (
        identity.copyright !== undefined &&
        /^\s*store\s*\(\s*&COPYRIGHT\s*\)/i.test(line)
      ) {
        return `store(&COPYRIGHT) '${escapeQuote(identity.copyright)}'`;
      }
      if (
        identity.version !== undefined &&
        /^\s*store\s*\(\s*&KEYBOARDVERSION\s*\)/i.test(line)
      ) {
        return `store(&KEYBOARDVERSION) '${escapeQuote(identity.version)}'`;
      }
      return line;
    })
    .join("\n");

  vfs.set(path, updated);
}
