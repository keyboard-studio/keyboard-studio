// openIdentityCommit -- the copyright holder and the project link on a keyboard
// opened for update are written into the files when answered (spec 111
// FR-041/FR-042/FR-012/FR-030; constitution Article III).
//
// On Open the answers are written into the files now instead of being kept in an
// overlay for output to write later. One `files` change, one undo record:
//   - copyright holder (the attribution patch reaches the sink): the `.kmn`
//     `&COPYRIGHT` store and the `.kps` `<Info><Copyright>`, in place. Each file
//     is decided on its own text: a file already naming the holder is left as it
//     is; otherwise its notice keeps its own prefix style and start year and the
//     end year becomes the current year (a year-less notice stays year-less).
//     `LICENSE.md` is not touched.
//   - project link (the step completion calls `commitOpenProjectLink`): the `.kps`
//     `<Info><WebSite>`, in place; a cleared link removes the element. Driven by
//     the `help-project-url` decision itself, and only when the author answered it
//     (a proposal the author never confirmed is not written), so it does not
//     depend on the welcome paragraph.
// The decision stays a record. Copy never comes through here. No timers.

import { createVirtualFS, effectiveHolder, type Attribution } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import {
  applyIdentityStubMutation,
  packageAttributionFields,
  patchOpenKpsInfo,
  resolveInheritedHolders,
} from "@keyboard-studio/engine";
import { getDecisionSnapshot } from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { captureDecisionRollback } from "./decisionJournal.ts";
import { isLiveOpen } from "./openMode.ts";
import { applyThroughOpenSeam, handOverToOpenApplyHost } from "./openApplyNotifier.ts";
import type { OpenApplyResult, OpenChange } from "./openApply/types.ts";
import { readVfsText } from "./vfsText.ts";

const textOrNull = (vfs: Parameters<typeof readVfsText>[0], path: string): string | null => readVfsText(vfs, path) ?? null;

export interface OpenIdentityWrite {
  /** The answered holder. */
  holder?: string;
  /** The notice to state when a file has none of its own to restyle. */
  fallbackNotice?: string;
  /** The project link; blank clears `<WebSite>`. */
  websiteUrl?: string;
}

/** The decisions each kind of write covers: what is taken back when it is not applied. */
const COPYRIGHT_DECISION_IDS = ["copyright-holder", "author-name"] as const;
const LINK_DECISION_IDS = ["help-project-url"] as const;

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

const normalised = (s: string): string => ` ${s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/** True when the notice names the holder as whole words (case, spacing and punctuation aside). */
function names(notice: string, holder: string): boolean {
  return normalised(notice).includes(normalised(holder));
}

/**
 * The notice a file should carry for `holder`, or undefined to leave the file as it
 * is. A file that already names the holder is left alone. Otherwise its own
 * notice is restyled: the prefix (`©`, `Copyright ©`, ...) stays, a year or range
 * keeps its start and ends at the current year (a single year the same as now
 * stays one year), and a year-less notice stays year-less. A file with no notice
 * takes `fallback`.
 */
export function openNoticeFor(existing: string | undefined, holder: string, fallback: string, now: Date): string | undefined {
  if (existing === undefined || existing.trim() === "") return fallback;
  if (names(existing, holder)) return undefined;
  const m = /^(\s*(?:copyright\b\s*)?(?:\(c\)|©)?\s*)(\d{4}(?:\s*[-–,]\s*\d{4})*)?/i.exec(existing);
  const prefix = m?.[1] ?? "";
  const years = m?.[2];
  if (years === undefined) return `${prefix}${holder}`;
  const year = now.getFullYear();
  const start = Number(/\d{4}/.exec(years)![0]);
  const dash = /[-–]/.exec(years)?.[0] ?? "-";
  const token = start >= year ? String(start) : `${start}${dash}${year}`;
  const sep = /^\s*/.exec(existing.slice(m![0].length))![0] || " ";
  return `${prefix}${token}${sep}${holder}`;
}

/** The notice an answered holder puts on a keyboard that has none, or null when there is nothing to state. */
function fallbackNoticeFor(attribution: Attribution): string | null {
  if (effectiveHolder(attribution) === "") return null;
  const { startLicenseText, startHolderOverride, startVfs } = useWorkingCopyStore.getState();
  const license = startLicenseText ?? (startVfs !== null ? textOrNull(startVfs, "LICENSE.md") : null);
  const { inherited } = resolveInheritedHolders(license ?? undefined, startHolderOverride ?? undefined);
  return packageAttributionFields(attribution, inherited).copyrightLine ?? null;
}

/** What an attribution answer asks the files to say, or null when it asks nothing. */
export function openCopyrightWriteFor(attribution: Attribution): OpenIdentityWrite | null {
  const fallback = fallbackNoticeFor(attribution);
  return fallback === null ? null : { holder: effectiveHolder(attribution), fallbackNotice: fallback };
}

/** What the recorded project-link answer asks the descriptor to say, or null when the author has not answered it. */
export function openLinkWriteFor(): OpenIdentityWrite | null {
  const record = getDecisionSnapshot()["help-project-url"];
  if (record === undefined || record.provenance !== "asked") return null;
  const value = typeof record.value === "string" ? record.value : "";
  // The first line is the home page; a second line (the help page) is not a descriptor field.
  const home = value.split("\n").map((l) => l.trim()).find((l) => l !== "") ?? "";
  return { websiteUrl: home };
}

export type OpenIdentityChange = { change: OpenChange } | { reason: string };

/**
 * The `files` change that writes `write` into the opened keyboard, or the reason it
 * cannot be written. Built from the files as they are now; a file that already says
 * it is left byte-identical (the seam then reports `unchanged`). `now` fixes the
 * year a changed notice ends at.
 */
export function buildOpenIdentityChange(write: OpenIdentityWrite, now: Date = new Date()): OpenIdentityChange {
  const { startVfs, startKeyboard } = useWorkingCopyStore.getState();
  if (startVfs === null || startKeyboard === null) return { reason: "No keyboard is open." };
  const kpsPath = `source/${startKeyboard.id}.kps`;
  const kps = textOrNull(startVfs, kpsPath);
  if (kps === null) return { reason: "The keyboard has no readable package descriptor to write into." };
  const kmnPath = `source/${startKeyboard.id}.kmn`;
  const kmn = write.holder !== undefined ? textOrNull(startVfs, kmnPath) : null;

  const kpsExisting = /<Copyright\b[^>]*>([^<]*)<\/Copyright\s*>/i.exec(kps)?.[1];
  const kpsNotice =
    write.holder !== undefined
      ? openNoticeFor(kpsExisting === undefined ? undefined : unescapeXml(kpsExisting), write.holder, write.fallbackNotice ?? "", now)
      : undefined;
  const patched = patchOpenKpsInfo(kps, {
    ...(kpsNotice !== undefined && kpsNotice !== "" ? { copyright: kpsNotice } : {}),
    ...(write.websiteUrl !== undefined ? { websiteUrl: write.websiteUrl } : {}),
  });
  if (patched.unwritable.includes("no <Info> block")) {
    return { reason: "The keyboard's package descriptor has no <Info> block to write into." };
  }
  const files: Record<string, string | null> = { [kpsPath]: patched.text };

  // The descriptor's change stands even when the .kmn cannot take its half: the
  // missing source is reported, never swallowed.
  if (write.holder !== undefined && kmn === null) {
    devLog.warn(`[open-apply] ${kmnPath} is not readable; the copyright notice was written to the descriptor only`);
  }
  if (write.holder !== undefined && kmn !== null) {
    const m = /^\s*store\s*\(\s*&COPYRIGHT\s*\)\s*(?:'([^']*)'|"([^"]*)")/im.exec(kmn);
    const kmnExisting = m === null ? undefined : (m[1] ?? m[2]);
    const kmnNotice = openNoticeFor(kmnExisting, write.holder, write.fallbackNotice ?? "", now);
    if (kmnNotice !== undefined && kmnNotice !== "") {
      const scratch = createVirtualFS([{ path: kmnPath, content: kmn, isBinary: false }]);
      applyIdentityStubMutation(scratch, startKeyboard.id, { copyright: kmnNotice }, { open: true });
      files[kmnPath] = textOrNull(scratch, kmnPath) ?? kmn;
    }
  }

  return {
    change:
      write.holder !== undefined
        ? { kind: "files", files, label: "Copyright holder", labelKey: "copyright" }
        : { kind: "files", files, label: "Project link", labelKey: "project-link" },
  };
}

/**
 * Apply an identity write through the seam. On failure the decisions the write
 * covers are taken back and the host (when mounted) tells the author; with no host
 * the failure is logged. `onApplied` runs when a handed-over write lands later,
 * `onNotApplied` when it does not.
 */
export function commitOpenIdentityWrite(
  write: OpenIdentityWrite,
  decisionIds: readonly string[],
  hooks: { onApplied?: () => void; onNotApplied?: () => void },
): OpenApplyResult {
  const built = buildOpenIdentityChange(write);
  const result: OpenApplyResult =
    "change" in built ? applyThroughOpenSeam(built.change) : { status: "failed", reason: built.reason };
  if (result.status === "applied" || result.status === "unchanged") return result;
  const rollback = captureDecisionRollback(decisionIds) ?? (() => {});
  const onNotApplied = (): void => {
    rollback();
    hooks.onNotApplied?.();
  };
  const build = (): OpenChange | null => {
    if (!isLiveOpen(useWorkingCopyStore.getState())) return null;
    const again = buildOpenIdentityChange(write);
    return "change" in again ? again.change : null;
  };
  if (!handOverToOpenApplyHost({ build, onNotApplied, ...(hooks.onApplied !== undefined ? { onApplied: hooks.onApplied } : {}) })) {
    devLog.warn(`[open-apply] the copyright holder or project link was not written to the files: ${result.status === "failed" ? result.reason : result.status}`);
    onNotApplied();
  }
  return result;
}

/** The attribution answer on Open: written now; the decisions it covers go back when it is not applied. */
export function commitOpenCopyright(
  attribution: Attribution,
  hooks: { onApplied?: () => void; onNotApplied?: () => void },
): OpenApplyResult | undefined {
  const write = openCopyrightWriteFor(attribution);
  return write === null ? undefined : commitOpenIdentityWrite(write, COPYRIGHT_DECISION_IDS, hooks);
}

/**
 * The recorded project-link answer on Open, called when a step completes. Returns
 * undefined off Open or when the author has not answered it. The overlay's copy of
 * the link follows the file: it is dropped when the write fails and put back when a
 * handed-over write lands.
 */
export function commitOpenProjectLink(): OpenApplyResult | undefined {
  if (!isLiveOpen(useWorkingCopyStore.getState())) return undefined;
  const write = openLinkWriteFor();
  if (write === null) return undefined;
  const setLinkInOverlay = (home: string | undefined): void => {
    const wc = useWorkingCopyStore.getState();
    if (wc.helpDocs === null) return;
    const { projectHomeUrl: _home, projectHelpUrl: _help, ...rest } = wc.helpDocs;
    wc.setHelpDocs({ ...rest, ...(home !== undefined && home !== "" ? { projectHomeUrl: home } : {}) });
  };
  const hooks = {
    onApplied: () => setLinkInOverlay(write.websiteUrl),
    onNotApplied: () => setLinkInOverlay(undefined),
  };
  const result = commitOpenIdentityWrite(write, LINK_DECISION_IDS, hooks);
  if (result.status === "failed" || result.status === "needs-consent" || result.status === "declined") {
    setLinkInOverlay(undefined);
  }
  return result;
}
