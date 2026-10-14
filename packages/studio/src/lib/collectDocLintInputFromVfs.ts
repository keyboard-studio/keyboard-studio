// collectDocLintInputFromVfs — build a DocLintInput from a bare VFS
// (spec 084, plan §4, task T5.1).
//
// Foreign mode only. A foreign package ships real files, so the six
// documentation members are read directly from the VFS at their projected
// paths (contracts docMemberPath) — simpler than the authored mode's
// rendered-docs projection, which exists because an authored project's
// members are still being written. Everything else delegates to the
// existing collectDocLintInput(), so holder parsing, &TARGETS parsing,
// layer-id collection, and the version rule are shared, never duplicated.
//
// Pure: it reads only the VFS it is handed. Absent files are tolerated
// throughout — an absent member is simply not a key in `members`, an
// absent .kps/.kvks/touch layout contributes null, and a missing .kmn
// yields the collectDocLintInput defaults (version "1.0", no targets,
// no holders from the .kmn). A foreign package may be partial (a preview
// fetch can omit packaging assets), and a partial package must still be
// judgable: the doc checks return no findings for members they are not
// given, rather than inventing failures for files that were not fetched.

import type { DocLintInput, DocMemberId, VirtualFS } from "@keyboard-studio/contracts";
import { DOC_MEMBER_IDS, docMemberPath } from "@keyboard-studio/contracts";

import { collectDocLintInput, keyboardVersionFromKmn } from "./collectDocLintInput.ts";
import { findKmnPath } from "./findKmnPath.ts";
import { findTouchLayoutPath } from "./findTouchLayoutPath.ts";
import { readVfsText } from "./vfsText.ts";

export function collectDocLintInputFromVfs(
  vfs: VirtualFS,
  keyboardId: string,
  displayName: string,
): DocLintInput {
  const kmnPath = findKmnPath(vfs);
  const kmnText = kmnPath !== undefined ? (readVfsText(vfs, kmnPath) ?? null) : null;

  // The package source file: source/<id>.kps. Fall back to any .kps under
  // source/ (the authored path's own lookup shape) only when the id-named
  // file is absent — a package whose .kps carries a package id different
  // from the keyboard id still has its copyright holder read.
  const paths = vfs.list();
  const kpsPath =
    paths.find((p) => p === `source/${keyboardId}.kps`) ??
    paths.find((p) => p.startsWith("source/") && p.toLowerCase().endsWith(".kps"));
  const kpsText = kpsPath !== undefined ? (readVfsText(vfs, kpsPath) ?? null) : null;

  const kvksText = readVfsText(vfs, `source/${keyboardId}.kvks`) ?? null;

  const touchPath = findTouchLayoutPath(vfs);
  const touchLayoutJson =
    touchPath !== undefined ? (readVfsText(vfs, touchPath) ?? null) : null;

  const members: Partial<Record<DocMemberId, string>> = {};
  for (const member of DOC_MEMBER_IDS) {
    const text = readVfsText(vfs, docMemberPath(member, keyboardId));
    if (text !== undefined) members[member] = text;
  }

  return collectDocLintInput({
    keyboardId,
    displayName,
    keyboardVersion: keyboardVersionFromKmn(kmnText),
    kmnText,
    kpsText,
    kvksText,
    touchLayoutJson,
    members,
    // deletedFilenames is [] by construction in collectDocLintInput: this
    // VFS is a read-only snapshot, and no file in it was deleted by anyone.
  });
}
