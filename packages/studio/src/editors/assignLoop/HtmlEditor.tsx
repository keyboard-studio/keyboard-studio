/**
 * HtmlEditor — Documentation editor step (after Help & Tips, Phase F).
 *
 * Edits the keyboard's documentation files — HTML for `welcome.htm`,
 * `readme.htm` and the help `.php` body, Markdown for `README.md` —
 * with a file selector over all six shipped doc members
 * (specs/html-editor). `HISTORY.md` and `LICENSE.md` are shown read-only:
 * HISTORY.md is re-rendered on every production from the history-entry
 * decision and LICENSE.md is renderer-owned, so offering them as editable
 * would be a dead edit.
 *
 * Features:
 * - TipTap WYSIWYG as primary mode (lazy-loaded, never in the main chunk)
 * - Monaco code as secondary mode; read-only preview as a third view
 * - File chooser: a narrow folder-grouped tree at the left on desktop
 *   (tabs on narrow viewports, via `useIsNarrow(tabletMax)` — a two-pane
 *   layout that needs the room); the tree groups the `source/` files and
 *   lists the root files below.
 * - Per-file seeding: copy seeds from the live preview (`useDocsPreview`);
 *   open seeds from the file only (the `start*Text` slices are read-only
 *   seeds for the render paths), and a page with no file is not editable.
 *   Copy never inherits base prose (ruling A).
 * - HISTORY.md and LICENSE.md always ship (serialize steps 5c/5d +
 *   `ensurePackageFiles`), so they never render "(absent)" even on Open,
 *   where the loader keeps them out of the VFS — their preview falls back
 *   to the start slice, then to the generated render (`renderHistoryMd` /
 *   `licenseMd`, the same renderers the download uses).
 * - Copy: edits are written to the working-copy store's authored-* fields on
 *   Continue (and when switching files), and recorded as the `welcome-htm`
 *   decision — the output pipeline applies them at projection step 0b
 *   and again at serialize step 5c, so they survive into the download.
 *   A Continue with no edits records nothing, so the golden-walk trace
 *   is unchanged for an untouched step.
 * - On a keyboard opened for update the file is the truth: the editor seeds
 *   from it only, each edited page is written into its file (one undo record
 *   per page, through the apply host) on file switch and Continue; Continue
 *   waits and stays if a write is refused. The decision keeps only the page
 *   names (lib/docsOpenCommit). An edit typed over text the file no longer
 *   holds is dropped with a note.
 */

import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  licenseMd,
  renderHistoryMd,
  resolvePublishVersion,
  type HistoryLineage,
} from "@keyboard-studio/engine";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { useIsNarrow } from "../../hooks/useViewport.ts";
import { BREAKPOINTS } from "../../ui/breakpoints.ts";
import { useDocsPreview } from "../../hooks/useDocsPreview.ts";
import { useDocMemberStates } from "../../hooks/useDocMemberStates.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { isLiveOpen } from "../../lib/openMode.ts";
import { useApplyOnOpen } from "../../components/OpenApplyHost.tsx";
import { resolveOutputKeyboardId } from "../../lib/outputKeyboardId.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import {
  extractOpaqueBlocks,
  joinHtmlDocument,
  joinPhpPage,
  opaqueBlocksRoundTrip,
  phpPageRoundTrips,
  restoreOpaqueBlocks,
  splitHtmlDocument,
  splitPhpPage,
  type EditableDocMember,
} from "../../lib/authoredDocs.ts";
import { completeHtmlStep, type HtmlContinueResult } from "../../lib/htmlStepCompletion.ts";
import { commitDocPagesOnOpen, readOpenDocText, type DocsCommitResult } from "../../lib/docsOpenCommit.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import type { DocMemberId } from "@keyboard-studio/contracts";

// Lazy-load both panes so neither TipTap nor Monaco lands in the main chunk.
const HtmlCodePane = lazy(() =>
  import("./HtmlCodePane.tsx").then((m) => ({ default: m.HtmlCodePane })),
);
const HtmlRichTextPane = lazy(() =>
  import("./HtmlRichTextPane.tsx").then((m) => ({ default: m.HtmlRichTextPane })),
);

// ---------------------------------------------------------------------------
// Member table
// ---------------------------------------------------------------------------

type SelectorMember = EditableDocMember | "history-md" | "license-md";

const SELECTOR_MEMBERS: readonly SelectorMember[] = [
  "welcome-htm",
  "readme-htm",
  "readme-md",
  "help-php",
  "history-md",
  "license-md",
];

/* eslint-disable lingui/no-unlocalized-strings -- VFS paths, not UI copy. */
const MEMBER_PATH: Record<SelectorMember, string> = {
  "welcome-htm": "source/welcome/welcome.htm",
  "readme-htm": "source/readme.htm",
  "readme-md": "README.md",
  "help-php": "source/help/<keyboard id>.php",
  "history-md": "HISTORY.md",
  "license-md": "LICENSE.md",
};
/* eslint-enable lingui/no-unlocalized-strings */

const EDITABLE: ReadonlySet<SelectorMember> = new Set(["welcome-htm", "readme-htm", "readme-md", "help-php"]);

function isEditable(member: SelectorMember): member is EditableDocMember {
  return EDITABLE.has(member);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type EditorMode = "rich" | "code" | "preview";

export function HtmlEditor({ onComplete, onBack, hasTestBuilds = false }: EditorStepProps) {
  const { t } = useLingui();
  const preview = useDocsPreview();
  const memberStates = useDocMemberStates();

  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const identity = useWorkingCopyStore((s) => s.identity);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const startWelcomeConvention = useWorkingCopyStore((s) => s.startWelcomeConvention);
  const startHistoryMdText = useWorkingCopyStore((s) => s.startHistoryMdText);
  const startLicenseText = useWorkingCopyStore((s) => s.startLicenseText);
  const historyEntryState = useWorkingCopyStore((s) => s.historyEntryState);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const authoredWelcomeHtm = useWorkingCopyStore((s) => s.authoredWelcomeHtm);
  const authoredReadmeHtm = useWorkingCopyStore((s) => s.authoredReadmeHtm);
  const authoredReadmeMd = useWorkingCopyStore((s) => s.authoredReadmeMd);
  const authoredHelpPhp = useWorkingCopyStore((s) => s.authoredHelpPhp);
  const setAuthoredWelcomeHtm = useWorkingCopyStore((s) => s.setAuthoredWelcomeHtm);
  const setAuthoredReadmeHtm = useWorkingCopyStore((s) => s.setAuthoredReadmeHtm);
  const setAuthoredReadmeMd = useWorkingCopyStore((s) => s.setAuthoredReadmeMd);
  const setAuthoredHelpPhp = useWorkingCopyStore((s) => s.setAuthoredHelpPhp);

  const [selected, setSelected] = useState<SelectorMember>("welcome-htm");
  const [mode, setMode] = useState<EditorMode>("rich");
  // This visit's edits, per member (null = not edited this visit; the seed
  // below is shown until the author types). Switching back to an edited
  // file shows the edited text, never the seed again.
  // Each entry remembers the seed it was typed over: on Open the file is the truth,
  // so an edit made over text that has since changed (an undo, an accepted fix) is dropped.
  const [texts, setTexts] = useState<Partial<Record<EditableDocMember, { text: string; base: string }>>>({});
  // Remount key for the panes: bumped when a rich edit is refused (a
  // deleted opaque placeholder), restoring the last good text.
  const [generation, setGeneration] = useState(0);
  const [richWarning, setRichWarning] = useState<string | null>(null);
  // Pages whose in-progress edit was dropped because the file changed underneath it (Open).
  const [dropped, setDropped] = useState<EditableDocMember[]>([]);
  // Pages whose last write the host refused: the text is kept here and marked unsaved.
  const [unsaved, setUnsaved] = useState<EditableDocMember[]>([]);
  // Writes in flight (Open). The apply swaps the file's text before the page's in-progress entry
  // is cleared, so a page being written is never judged stale; writes run one after another.
  const inFlightRef = useRef<Set<EditableDocMember>>(new Set());
  const pendingRef = useRef<Promise<unknown>>(Promise.resolve());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // The latest edits for the event handlers (member switch, Continue), which
  // the footer nav may hold from an earlier render. Synced after commit, not
  // during render.
  const textsRef = useRef(texts);
  const seedsRef = useRef<Record<EditableDocMember, string> | null>(null);
  const openRef = useRef(false);
  useLayoutEffect(() => {
    textsRef.current = texts;
  }, [texts]);

  const applyOnOpen = useApplyOnOpen();
  // A keyboard opened for update: the files are the truth (the id is the opened keyboard's own).
  const isOpen = useWorkingCopyStore((s) => isLiveOpen(s));
  const keyboardId = isOpen ? (startKeyboard?.id ?? "") : resolveOutputKeyboardId(identity, startKeyboard);
  const openText = (member: EditableDocMember): string | undefined =>
    readOpenDocText(member, keyboardId, startVfs, startWelcomeConvention);

  // -- Seeding (specs/html-editor §3) ---------------------------------------
  // Copy/adapt seed from the live preview (track guards + inheritance
  // already applied there), an authored override winning. Open seeds from the
  // file only (the start*Text slices are read-only seeds for the render paths).
  const seeds = useMemo(() => {
    // On Open each page is its file's text (a page with no file is not edited, so its seed is
    // never used); the start*Text slices are read-only seeds for the render paths only.
    const fromFile = (member: EditableDocMember): string => readOpenDocText(member, keyboardId, startVfs, startWelcomeConvention) ?? "";
    const result: Record<EditableDocMember, string> = isOpen
      ? {
          "welcome-htm": fromFile("welcome-htm"),
          "readme-htm": fromFile("readme-htm"),
          "readme-md": fromFile("readme-md"),
          "help-php": fromFile("help-php"),
        }
      : {
          "welcome-htm": authoredWelcomeHtm ?? preview.welcomeHtm,
          "readme-htm": authoredReadmeHtm ?? preview.readmeHtm,
          "readme-md": authoredReadmeMd ?? preview.readmeMd,
          "help-php": authoredHelpPhp ?? preview.helpPhp,
        };
    return result;
    // Preview object identity changes per render; its members are the seed inputs.
  }, [
    isOpen,
    startVfs,
    startWelcomeConvention,
    keyboardId,
    authoredWelcomeHtm,
    authoredReadmeHtm,
    authoredReadmeMd,
    authoredHelpPhp,
    preview.welcomeHtm,
    preview.readmeHtm,
    preview.readmeMd,
    preview.helpPhp,
  ]);

  useLayoutEffect(() => {
    seedsRef.current = seeds;
    openRef.current = isOpen;
  }, [seeds, isOpen]);

  const currentText = (member: EditableDocMember): string => {
    const entry = texts[member];
    return entry !== undefined && (!isOpen || entry.base === seeds[member]) ? entry.text : seeds[member];
  };

  const setMemberText = (member: EditableDocMember, text: string) => {
    setDropped([]);
    setTexts((prev) => ({ ...prev, [member]: { text, base: seeds[member] } }));
  };

  // This visit's edits that still stand, as plain text (on Open, only those typed over the file as it is now).
  const standingEdits = (): Partial<Record<EditableDocMember, string>> => {
    const out: Partial<Record<EditableDocMember, string>> = {};
    for (const [member, entry] of Object.entries(textsRef.current) as Array<[EditableDocMember, { text: string; base: string }]>) {
      if (openRef.current && seedsRef.current?.[member] !== entry.base) continue;
      out[member] = entry.text;
    }
    return out;
  };

  // On Open an edit typed over text the file no longer holds (an undo, an accepted fix) is dropped,
  // and the author is told which page it was.
  useEffect(() => {
    if (!isOpen) return;
    const stale = (Object.keys(texts) as EditableDocMember[]).filter(
      (m) => texts[m]?.base !== seeds[m] && !inFlightRef.current.has(m),
    );
    if (stale.length === 0) return;
    setTexts((prev) => {
      const next = { ...prev };
      for (const m of stale) delete next[m];
      return next;
    });
    setDropped((prev) => [...new Set([...prev, ...stale])]);
    setUnsaved((prev) => prev.filter((m) => !stale.includes(m)));
  }, [isOpen, seeds, texts]);

  // The panes reseed when the file's text changes under them on Open (an undo).
  const fileStamp = (member: EditableDocMember): string => {
    if (!isOpen) return "";
    let h = 2166136261;
    for (let i = 0; i < seeds[member].length; i++) h = Math.imul(h ^ seeds[member].charCodeAt(i), 16777619);
    return String(h >>> 0);
  };

  // -- Presence (projected VFS) ----------------------------------------------
  // HISTORY.md and LICENSE.md ship in every package, so they never render
  // "(absent)" — even on Open, where the loader deliberately keeps them out
  // of the VFS (LICENSE.md lives only in the `startLicenseText` slice;
  // HISTORY.md in the `startHistoryMdText` slice). Presence is therefore:
  // carried VFS text, or the start slice, or the generated render — and the
  // last of those always holds: serialize step 5c renders HISTORY.md on
  // every production, and step 5d + `ensurePackageFiles` write LICENSE.md
  // when absent. The VFS text and slices are still the preview's first
  // sources (see `readOnlyText` below); only presence never depends on them.
  // Any other member on Open: absent from the opened VFS with no start
  // slice is genuinely absent — shown as absent, never offered as a dead file.
  const present = (member: SelectorMember): boolean => {
    if (member === "history-md" || member === "license-md") {
      if (startVfs !== null && readVfsText(startVfs, MEMBER_PATH[member]) !== undefined) return true;
      if (member === "history-md" ? startHistoryMdText !== null : startLicenseText !== null) return true;
      return true; // generated render — serialize steps 5c/5d
    }
    if (!isOpen) return true;
    // On Open a page is present when the keyboard has its file; a slice alone is not a page here.
    return isEditable(member) && openText(member) !== undefined;
  };

  const memberName = (member: SelectorMember): string => {
    switch (member) {
      case "welcome-htm":
        return t({ id: "editor.assignLoop.html.member.welcomeHtm", message: "Welcome page" });
      case "readme-htm":
        return t({ id: "editor.assignLoop.html.member.readmeHtm", message: "Package details page" });
      case "readme-md":
        return t({ id: "editor.assignLoop.html.member.readmeMd", message: "Package README" });
      case "help-php":
        return t({ id: "editor.assignLoop.html.member.helpPhp", message: "Online help page" });
      case "history-md":
        return t({ id: "editor.assignLoop.html.member.historyMd", message: "Version history" });
      case "license-md":
        return t({ id: "editor.assignLoop.html.member.licenseMd", message: "License" });
    }
  };

  // -- Rich-edit plumbing -----------------------------------------------------
  // The rich pane edits a body fragment with opaque placeholders; this
  // converts its output back to the member's full text. Returns null when
  // the edit cannot be saved exactly (a placeholder was deleted) — the
  // caller then refuses the edit and restores the last good text.
  const richToFullText = (member: EditableDocMember, richHtml: string): string | null => {
    if (member === "readme-md") return richHtml;
    const full = currentText(member);
    if (member === "help-php") {
      const split = splitPhpPage(full);
      const { fragments } = extractOpaqueBlocks(split.body);
      const restored = restoreOpaqueBlocks(richHtml, fragments);
      if (!restored.ok) return null;
      return joinPhpPage({ header: split.header, body: restored.text });
    }
    const doc = splitHtmlDocument(full);
    const { fragments } = extractOpaqueBlocks(doc.body);
    const restored = restoreOpaqueBlocks(richHtml, fragments);
    if (!restored.ok) return null;
    return joinHtmlDocument({ prefix: doc.prefix, body: restored.text, suffix: doc.suffix });
  };

  // The rich pane's input: the editable body with opaque placeholders.
  const richValue = (member: EditableDocMember): string => {
    if (member === "readme-md") return currentText(member);
    const full = currentText(member);
    if (member === "help-php") return extractOpaqueBlocks(splitPhpPage(full).body).body;
    return extractOpaqueBlocks(splitHtmlDocument(full).body).body;
  };

  // A file whose PHP or style blocks cannot round-trip exactly is
  // code-mode-only, with a visible note — never a silent mangle, never a
  // dropped block. For an .htm page this catches a body that already
  // carries a `data-doc-fragment` span: it would collide with the
  // placeholders and every rich edit would be refused.
  const codeOnlyReason = (member: EditableDocMember): string | null => {
    if (member === "readme-md") return null;
    const full = currentText(member);
    if (member !== "help-php") {
      if (opaqueBlocksRoundTrip(splitHtmlDocument(full).body)) return null;
      return t({
        id: "editor.assignLoop.html.htm.fragmentsUnpreserved",
        message: "This page's embedded code or style blocks cannot be preserved exactly, so it is code-only.",
      });
    }
    if (!phpPageRoundTrips(full)) {
      return t({
        id: "editor.assignLoop.html.php.headerUnpreserved",
        message: "This help page's PHP header cannot be preserved exactly, so it is code-only.",
      });
    }
    if (!opaqueBlocksRoundTrip(splitPhpPage(full).body)) {
      return t({
        id: "editor.assignLoop.html.php.fragmentsUnpreserved",
        message: "This help page's embedded PHP cannot be preserved exactly, so it is code-only.",
      });
    }
    return null;
  };

  const handleRichChange = (member: EditableDocMember, richHtml: string) => {
    const full = richToFullText(member, richHtml);
    if (full === null) {
      setRichWarning(
        t({
          id: "editor.assignLoop.html.rich.placeholderDeleted",
          message: "That edit removed a preserved PHP or style block, so it was not kept.",
        }),
      );
      // Remount the pane on the last good text.
      setGeneration((g) => g + 1);
      return;
    }
    setRichWarning(null);
    setMemberText(member, full);
  };

  // Open: each page goes into its file through the apply host (one undo record per page);
  // nothing is held in the store. A page the host refused keeps its text here.
  // Each run waits for the one before it and works out its edits when it starts, so a switch
  // followed at once by Continue never sends the same page twice (the host refuses a second
  // apply while one is waiting).
  const flushOpen = (): Promise<DocsCommitResult> => {
    const run = pendingRef.current.then(async (): Promise<DocsCommitResult> => {
      const snapshot = standingEdits();
      const pages = Object.keys(snapshot) as EditableDocMember[];
      if (pages.length === 0) return { written: [], refused: [] };
      for (const m of pages) inFlightRef.current.add(m);
      try {
        const wc = useWorkingCopyStore.getState();
        let result: DocsCommitResult;
        try {
          result = await commitDocPagesOnOpen({
            edits: snapshot,
            keyboardId: wc.startKeyboard?.id ?? "",
            startVfs: wc.startVfs,
            convention: wc.startWelcomeConvention,
            applyOnOpen,
          });
        } catch {
          // A throw is a refusal: nothing is known to be written, and the text stays.
          result = { written: [], refused: pages };
        }
        // A written page is the file's now: its in-progress text goes, so an undo reseeds from the file.
        // Text typed while the write was in flight differs from what was written: it is kept and
        // rebased onto the new file text, so it is not judged stale and goes out on the next flush.
        // The ref is updated at once so the next run does not see the page's old text.
        if (result.written.length > 0) {
          const settle = (
            prev: Partial<Record<EditableDocMember, { text: string; base: string }>>,
          ): Partial<Record<EditableDocMember, { text: string; base: string }>> => {
            const next = { ...prev };
            for (const m of result.written) {
              const written = snapshot[m];
              const entry = prev[m];
              if (entry === undefined || written === undefined || entry.text === written) delete next[m];
              else next[m] = { text: entry.text, base: written };
            }
            return next;
          };
          textsRef.current = settle(textsRef.current);
          setTexts(settle);
        }
        setUnsaved((prev) => [...prev.filter((m) => !pages.includes(m)), ...result.refused]);
        return result;
      } finally {
        for (const m of pages) inFlightRef.current.delete(m);
      }
    });
    pendingRef.current = run.catch(() => undefined);
    return run;
  };

  const flushToStore = (snapshot: Partial<Record<EditableDocMember, string>>) => {
    if (snapshot["welcome-htm"] !== undefined) setAuthoredWelcomeHtm(snapshot["welcome-htm"]);
    if (snapshot["readme-htm"] !== undefined) setAuthoredReadmeHtm(snapshot["readme-htm"]);
    if (snapshot["readme-md"] !== undefined) setAuthoredReadmeMd(snapshot["readme-md"]);
    if (snapshot["help-php"] !== undefined) setAuthoredHelpPhp(snapshot["help-php"]);
  };

  const selectMember = (member: SelectorMember) => {
    if (openRef.current) void flushOpen();
    else flushToStore(standingEdits());
    setDropped([]);
    setRichWarning(null);
    setSelected(member);
    if (!isEditable(member)) setMode("preview");
    else if (mode === "preview" && codeOnlyReason(member) === null) setMode("rich");
  };

  const handleContinue = async () => {
    if (openRef.current) {
      // Wait for the writes: if the host refused a page the author keeps the text and stays here.
      let result = await flushOpen();
      // An edit typed while a write was in flight is still standing: write that too.
      for (let i = 0; i < 3 && result.refused.length === 0 && Object.keys(standingEdits()).length > 0; i++) {
        result = await flushOpen();
      }
      if (result.refused.length > 0 || !mountedRef.current) return;
      onComplete({});
      return;
    }
    const snapshot = standingEdits();
    flushToStore(snapshot);
    const payload: HtmlContinueResult = {
      ...(snapshot["welcome-htm"] !== undefined ? { welcomeHtm: snapshot["welcome-htm"] } : {}),
      ...(snapshot["readme-htm"] !== undefined ? { readmeHtm: snapshot["readme-htm"] } : {}),
      ...(snapshot["readme-md"] !== undefined ? { readmeMd: snapshot["readme-md"] } : {}),
      ...(snapshot["help-php"] !== undefined ? { helpPhp: snapshot["help-php"] } : {}),
    };
    completeHtmlStep(payload);
    onComplete(payload);
  };

  // Footer nav (spec 081, #2527): Back / Continue publish to the footer
  // instead of rendering in the in-body bar. Test id is unchanged, so e2e
  // keeps finding html-continue in the footer.
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "editor.assignLoop.html.back", message: "Back" }),
            onClick: onBack,
            testId: "html-back",
          },
        }
      : {}),
    forward: {
      label: t({ id: "editor.assignLoop.html.continue", message: "Continue" }),
      onClick: () => void handleContinue(),
      testId: "html-continue",
    },
  });

  const selectedState = memberStates.find((s) => s.member === (selected as DocMemberId));
  const codeOnly = isEditable(selected) ? codeOnlyReason(selected) : null;
  const effectiveMode: EditorMode = codeOnly !== null && mode === "rich" ? "code" : mode;
  // Open: a page the keyboard has no file for is not edited here (the Help step's suggestion covers it).
  const absentOnOpen = isOpen && isEditable(selected) && !present(selected);

  // -- Read-only text (HISTORY.md / LICENSE.md) -------------------------------
  // Carried VFS text first, then the start slice (the loader's
  // fetch-don't-write path — on Open these files live ONLY there), then the
  // generated render, reusing the exact renderers serialize calls so the
  // preview cannot disagree with the download: `renderHistoryMd` with the
  // same inputs as serialize step 5c (mirroring
  // `useDocumentationFindings`' version derivation), and `licenseMd` with
  // a null holder, exactly as `ensurePackageFiles` writes it when no base
  // license exists (serialize step 5d).
  const isAdaptation = instantiationMode === "adapt-existing";
  const rawVersion = startIr?.header.version?.trim() || "1.0";
  const publishVersion = resolvePublishVersion({
    mode: isAdaptation ? "adapt-existing" : "new-from-base",
    rawVersion,
    hasTestBuilds,
  });
  const readOnlyText = useMemo((): string | null => {
    if (isEditable(selected)) return null;
    const vfsText = startVfs !== null ? readVfsText(startVfs, MEMBER_PATH[selected]) : undefined;
    if (selected === "history-md") {
      if (vfsText !== undefined) return vfsText;
      if (startHistoryMdText !== null) return startHistoryMdText;
      const lineage: HistoryLineage = {
        kind: isOpen ? "updated" : isAdaptation ? "adapted" : "created",
        id: keyboardId,
        version: rawVersion,
      };
      return renderHistoryMd(historyEntryState, {
        version: publishVersion,
        dateIso: new Date().toISOString().slice(0, 10),
        lineage,
        startHistoryText: null,
      });
    }
    // license-md
    if (vfsText !== undefined) return vfsText;
    if (startLicenseText !== null) return startLicenseText;
    return licenseMd(null, new Date().getFullYear());
  }, [
    selected,
    startVfs,
    startHistoryMdText,
    startLicenseText,
    historyEntryState,
    isOpen,
    isAdaptation,
    keyboardId,
    rawVersion,
    publishVersion,
  ]);

  const previewHtml = (): string => {
    if (!isEditable(selected)) return readOnlyText ?? "";
    if (selected === "help-php") return splitPhpPage(currentText(selected)).body;
    if (selected === "readme-md") return currentText(selected);
    return splitHtmlDocument(currentText(selected)).body;
  };

  // -- File chooser -----------------------------------------------------------
  // Desktop: a narrow folder-grouped tree at the left. Narrow viewports
  // (width <= tabletMax — a two-pane layout that needs the room, per the
  // `useViewport` vocabulary): the tab row, unchanged. Both render the same
  // buttons (`data-testid="html-file-<member>"`), so tests and e2e keep
  // finding them.
  const showTree = !useIsNarrow(BREAKPOINTS.tabletMax);
  const readOnlyLabel = t({ id: "editor.assignLoop.html.files.readOnly", message: "read-only" });
  const unsavedLabel = t({ id: "editor.assignLoop.html.files.unsaved", message: "unsaved" });
  const absentLabel = t({ id: "editor.assignLoop.html.files.absent", message: "absent" });
  const filesLabel = t({ id: "editor.assignLoop.html.files.label", message: "Documentation files" });

  // Path as shipped in the package. The tree groups by folder, so the
  // `source/` files show their path below the folder and the root files
  // show their full path.
  /* eslint-disable lingui/no-unlocalized-strings -- VFS paths, not UI copy. */
  const memberDisplayPath = (member: SelectorMember): string => {
    switch (member) {
      case "welcome-htm":
        return "welcome/welcome.htm";
      case "readme-htm":
        return "readme.htm";
      case "help-php":
        return `help/${keyboardId}.php`;
      case "readme-md":
        return "README.md";
      case "history-md":
        return "HISTORY.md";
      case "license-md":
        return "LICENSE.md";
    }
  };
  /* eslint-enable lingui/no-unlocalized-strings */

  const fileButton = (
    member: SelectorMember,
    role: "tab" | "treeitem",
    children: ReactNode,
    style: CSSProperties,
  ) => {
    const isPresent = present(member);
    return (
      <button
        key={member}
        type="button"
        role={role}
        aria-selected={selected === member}
        disabled={!isPresent}
        onClick={() => selectMember(member)}
        data-testid={`html-file-${member}`}
        style={{
          padding: "6px 12px",
          fontSize: 13,
          borderRadius: 6,
          border: `1px solid ${selected === member ? "var(--app-accent)" : "var(--app-border)"}`,
          background: selected === member ? "var(--app-accent-bg)" : "var(--app-surface)",
          color: isPresent ? "var(--app-text)" : "var(--app-text-muted)",
          cursor: isPresent ? "pointer" : "not-allowed",
          ...style,
        }}
      >
        {children}
      </button>
    );
  };

  const fileSuffixes = (member: SelectorMember) => (
    <>
      {!isEditable(member) && ` (${readOnlyLabel})`}
      {!present(member) && ` (${absentLabel})`}
      {isEditable(member) && unsaved.includes(member) && ` (${unsavedLabel})`}
    </>
  );

  const treeRow = (member: SelectorMember, indented: boolean) =>
    fileButton(
      member,
      "treeitem",
      <>
        <span
          style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {memberDisplayPath(member)}
        </span>
        <span style={{ display: "block", fontSize: 12, color: "var(--app-text-muted)" }}>
          {memberName(member)}
          {fileSuffixes(member)}
        </span>
      </>,
      {
        display: "block",
        width: "100%",
        textAlign: "left",
        border: `1px solid ${selected === member ? "var(--app-accent)" : "transparent"}`,
        background: selected === member ? "var(--app-accent-bg)" : "transparent",
        padding: "6px 8px",
        ...(indented ? { marginLeft: 12 } : {}),
      },
    );

  const treeSelector = (
    <div
      role="tree"
      aria-label={filesLabel}
      style={{
        flex: "0 0 240px",
        alignSelf: "flex-start",
        position: "sticky",
        top: 0,
        border: "1px solid var(--app-border)",
        borderRadius: 8,
        background: "var(--app-surface)",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-muted)", padding: "4px 8px 2px" }}>
        source/
      </div>
      {treeRow("welcome-htm", true)}
      {treeRow("readme-htm", true)}
      {treeRow("help-php", true)}
      {treeRow("readme-md", false)}
      {treeRow("history-md", false)}
      {treeRow("license-md", false)}
    </div>
  );

  const tabSelector = (
    <div
      style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      role="tablist"
      aria-label={filesLabel}
    >
      {SELECTOR_MEMBERS.map((member) =>
        fileButton(
          member,
          "tab",
          <>
            {memberName(member)}
            {fileSuffixes(member)}
          </>,
          {},
        ),
      )}
    </div>
  );

  // Warnings, mode toggle, and editor/preview for the selected file. Rendered
  // in the right column next to the tree on desktop, or full-width below the
  // tab row on narrow viewports.
  const bodyContent = (
    <>
      {selectedState !== undefined && selectedState.warnings.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--app-warning)" }}>{selectedState.warnings.join(" ")}</p>
      )}

      {!isEditable(selected) && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--app-text-muted)" }}>
          {selected === "history-md"
            ? t({
                id: "editor.assignLoop.html.readOnly.history",
                message:
                  "Version history is written from the history entry on every download, so it is shown here but edited through its own decision.",
              })
            : t({
                id: "editor.assignLoop.html.readOnly.license",
                message:
                  "The license is carried from the base keyboard (or generated with its holders), so it is shown here but not edited in this step.",
              })}
        </p>
      )}

      {absentOnOpen && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--app-text-muted)" }} data-testid="html-absent-note">
          {t({
            id: "editor.assignLoop.html.openAbsentUnavailable",
            message: `This keyboard has no ${{ page: memberName(selected) }} file, and creating a missing page is not available yet, so nothing is written here.`,
          })}
        </p>
      )}
      <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 13, color: "var(--app-warning)" }} data-testid="html-dropped-note">
        {dropped.length > 0
          ? t({
              id: "editor.assignLoop.html.editDropped",
              message: `The file changed, so your unsaved edit to ${{ pages: dropped.map(memberName).join(", ") }} was dropped.`,
            })
          : ""}
      </p>
      {!absentOnOpen && codeOnly !== null && <p style={{ margin: 0, fontSize: 13, color: "var(--app-warning)" }}>{codeOnly}</p>}
      {richWarning !== null && <p style={{ margin: 0, fontSize: 13, color: "var(--app-warning)" }}>{richWarning}</p>}

      {/* Mode toggle */}
      {isEditable(selected) && !absentOnOpen && (
        <div style={{ display: "flex", gap: 8 }}>
          {(
            [
              ["rich", t({ id: "editor.assignLoop.html.mode.rich", message: "Write" })],
              ["code", t({ id: "editor.assignLoop.html.mode.code", message: "Code" })],
              ["preview", t({ id: "editor.assignLoop.html.mode.preview", message: "Preview" })],
            ] as Array<[EditorMode, string]>
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={effectiveMode === m}
              disabled={m === "rich" && codeOnly !== null}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                borderRadius: 6,
                border: `1px solid ${effectiveMode === m ? "var(--app-accent)" : "var(--app-border)"}`,
                background: effectiveMode === m ? "var(--app-accent-bg)" : "var(--app-surface)",
                color: "var(--app-text)",
                cursor: m === "rich" && codeOnly !== null ? "not-allowed" : "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Editor / Preview */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {isEditable(selected) && !absentOnOpen && effectiveMode === "rich" && (
          <Suspense
            fallback={
              <div style={{ padding: 16, color: "var(--app-text-muted)", fontSize: 13 }}>
                {t({ id: "editor.assignLoop.html.rich.loading", message: "Loading editor…" })}
              </div>
            }
          >
            <HtmlRichTextPane
              key={`${selected}:${generation}:${isEditable(selected) ? fileStamp(selected) : ""}`}
              value={richValue(selected)}
              format={selected === "readme-md" ? "markdown" : "html"}
              onChange={(next) => handleRichChange(selected, next)}
            />
          </Suspense>
        )}

        {isEditable(selected) && !absentOnOpen && effectiveMode === "code" && (
          <div style={{ flex: 1, minHeight: 300, display: "flex", flexDirection: "column" }}>
            <Suspense
              fallback={
                <div style={{ padding: 16, color: "var(--app-text-muted)", fontSize: 13 }}>
                  {t({ id: "editor.assignLoop.html.code.loading", message: "Loading editor…" })}
                </div>
              }
            >
              <HtmlCodePane
                key={`${selected}:${generation}:${isEditable(selected) ? fileStamp(selected) : ""}`}
                initialText={currentText(selected)}
                language={selected === "readme-md" ? "markdown" : "html"}
                onApply={(next) => setMemberText(selected, next)}
              />
            </Suspense>
          </div>
        )}

        {!absentOnOpen && (effectiveMode === "preview" || !isEditable(selected)) && (
          <div
            style={{
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              background: "var(--app-background)",
              overflow: "auto",
              minHeight: 300,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--app-text-muted)", marginBottom: 12 }}>
              {t({ id: "editor.assignLoop.html.preview.label", message: "Preview" })}
            </div>
            {previewHtml().trim() === "" ? (
              <div style={{ color: "var(--app-text-muted)", fontSize: 13, fontStyle: "italic" }}>
                {t({
                  id: "editor.assignLoop.html.preview.empty",
                  message: "Nothing to preview yet.",
                })}
              </div>
            ) : selected === "readme-md" || !isEditable(selected) ? (
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--app-text)", margin: 0 }}>
                {previewHtml()}
              </pre>
            ) : (
              // The file is HTML by definition — render it directly.
              // This is the author's own document preview, not untrusted content.
              <div dangerouslySetInnerHTML={{ __html: previewHtml() }} />
            )}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 24,
        height: "100%",
        overflowY: "auto",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 20, color: "var(--app-text)" }}>
        {t({ id: "editor.assignLoop.html.title", message: "Documentation" })}
      </h1>
      <p style={{ margin: 0, fontSize: 13, color: "var(--app-text-muted)" }}>
        {t({
          id: "editor.assignLoop.html.description",
          message:
            "Edit the user documentation for your keyboard. Your edits override the generated pages in the downloaded package.",
        })}
      </p>

      {/* File chooser: narrow tree at the left on desktop, tab row on narrow viewports */}
      {showTree ? (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flex: 1, minHeight: 0 }}>
          {treeSelector}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minHeight: 0,
              // The tree row uses alignItems:"flex-start" so the file
              // tree stays compact (its own alignSelf:"flex-start");
              // without this the right column is content-height and
              // every flex:1 below it has no free space to grow into,
              // so the code pane bottoms out at its min-heights
              // (measured 2026-11-11: row 809px, column 345px, Monaco
              // wrapper exactly 200px). Stretch to the row instead.
              alignSelf: "stretch",
            }}
          >
            {bodyContent}
          </div>
        </div>
      ) : (
        <>
          {tabSelector}
          {bodyContent}
        </>
      )}
    </div>
  );
}
