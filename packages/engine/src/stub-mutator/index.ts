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
 * INSERT behaviour for `name`: if no `store(&NAME) '...'` line exists, the
 * line is INSERTED after the last system-store line (i.e. the last line
 * matching `store(&...)`) and before the `begin` directive. If neither a
 * system-store line nor a begin directive is found, the line is prepended.
 * This ensures keyboards that omit &NAME receive the user's display name
 * rather than silently leaving the store absent.
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

  const lines = entry.content.split("\n");

  // Rewrite lines for name/copyright/version if the store already exists.
  let nameFound = false;
  const rewritten = lines.map((line) => {
    if (
      identity.name !== undefined &&
      /^\s*store\s*\(\s*&NAME\s*\)/i.test(line)
    ) {
      nameFound = true;
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
  });

  // INSERT store(&NAME) when a name was requested but no &NAME store existed.
  if (identity.name !== undefined && !nameFound) {
    const newNameLine = `store(&NAME) '${escapeQuote(identity.name)}'`;

    // Find insertion point: after the last system-store line.
    let insertAfter = -1;
    for (let i = 0; i < rewritten.length; i++) {
      if (/^\s*store\s*\(\s*&/i.test(rewritten[i] ?? "")) {
        insertAfter = i;
      }
    }

    if (insertAfter >= 0) {
      rewritten.splice(insertAfter + 1, 0, newNameLine);
    } else {
      // No system stores found — fall back to inserting before the begin line.
      const beginIdx = rewritten.findIndex((l) =>
        /^\s*begin\b/i.test(l)
      );
      if (beginIdx >= 0) {
        rewritten.splice(beginIdx, 0, newNameLine);
      } else {
        // No begin line either — prepend as a last resort.
        rewritten.unshift(newNameLine);
      }
    }
  }

  vfs.set(path, rewritten.join("\n"));
}

const TARGETS_ANY = "store(&TARGETS) 'any'";

/**
 * Sets the keyboard's target platforms to `'any'` (product owner ruling,
 * 2026-11-07). Every produced keyboard ships desktop and touch, the two
 * outputs that adapt per OS, so no keyboard picks individual platforms. It
 * also gives every keyboard a web build, which the preview and the Layout
 * tab simulate; a `'windows'`-only keyboard compiles to `.kmx` alone.
 *
 * Every existing `store(&TARGETS)` line is rewritten in place. When there is
 * none, the line is inserted after the last system-store line, or before
 * `begin`, or prepended — the same placement as an inserted `&NAME`. A file
 * that already says exactly `'any'` is left byte-identical.
 *
 * @throws if the keyboard source file is not present in `vfs` or is binary.
 */
export function applyTargetsAnyMutation(vfs: VirtualFS, keyboardId: string): void {
  const path = `source/${keyboardId}.kmn`;
  const entry = vfs.get(path);
  if (entry === undefined) {
    throw new Error(`stub-mutator: keyboard file not found in VirtualFS: ${path}`);
  }
  if (typeof entry.content !== "string") {
    throw new Error(`stub-mutator: keyboard file is binary, expected text: ${path}`);
  }

  const lines = entry.content.split("\n");
  const isTargets = (line: string): boolean => /^\s*store\s*\(\s*&TARGETS\s*\)/i.test(line);
  if (lines.some(isTargets)) {
    const next = lines.map((line) =>
      isTargets(line) && !/^\s*store\s*\(\s*&TARGETS\s*\)\s*'any'\s*$/i.test(line.replace(/\r$/, ""))
        ? `${TARGETS_ANY}${line.endsWith("\r") ? "\r" : ""}`
        : line,
    );
    vfs.set(path, next.join("\n"));
    return;
  }

  const inserted = entry.content.includes("\r\n") ? `${TARGETS_ANY}\r` : TARGETS_ANY;
  let insertAfter = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*store\s*\(\s*&/i.test(lines[i] ?? "")) insertAfter = i;
  }
  if (insertAfter >= 0) {
    lines.splice(insertAfter + 1, 0, inserted);
  } else {
    const beginIdx = lines.findIndex((l) => /^\s*begin\b/i.test(l));
    if (beginIdx >= 0) lines.splice(beginIdx, 0, inserted);
    else lines.unshift(inserted);
  }
  vfs.set(path, lines.join("\n"));
}
