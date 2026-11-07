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
 * - Per-file seeding: copy/adapt seed from the live preview
 *   (`useDocsPreview`), open seeds from the carried VFS text, else the
 *   `start*` slice, else the preview. Never blank on adapt/open; copy
 *   never inherits base prose (ruling A).
 * - HISTORY.md and LICENSE.md always ship (serialize steps 5c/5d +
 *   `ensurePackageFiles`), so they never render "(absent)" even on Open,
 *   where the loader keeps them out of the VFS — their preview falls back
 *   to the start slice, then to the generated render (`renderHistoryMd` /
 *   `licenseMd`, the same renderers the download uses).
 * - Edits are written to the working-copy store's authored-* fields on
 *   Continue (and when switching files), and recorded as the `welcome-htm`
 *   decision — the output pipeline applies them at projection step 0b
 *   and again at serialize step 5c, so they survive into the download.
 *   A Continue with no edits records nothing, so the golden-walk trace
 *   is unchanged for an untouched step.
 */

import { lazy, Suspense, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  licenseMd,
  renderHistoryMd,
  resolvePublishVersion,
  type HistoryLineage,
} from "@keyboard-studio/engine";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { useIsNarrow } from "../../hooks/useViewport.ts";
import { useHasTestBuilds } from "../../stores/testingStore.ts";
import { BREAKPOINTS } from "../../ui/breakpoints.ts";
import { useDocsPreview } from "../../hooks/useDocsPreview.ts";
import { useDocMemberStates } from "../../hooks/useDocMemberStates.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { isOpenedWithDescriptor } from "../../lib/openMode.ts";
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
import { WELCOME_PAGE_PATH, FLAT_WELCOME_PATH } from "../../lib/welcomeFolder.ts";
import { completeHtmlStep, type HtmlContinueResult } from "../../lib/htmlStepCompletion.ts";
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

export function HtmlEditor({ onComplete, onBack }: EditorStepProps) {
  const { t } = useLingui();
  const preview = useDocsPreview();
  const memberStates = useDocMemberStates();

  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const identity = useWorkingCopyStore((s) => s.identity);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const startWelcomeConvention = useWorkingCopyStore((s) => s.startWelcomeConvention);
  const startWelcomeHtmText = useWorkingCopyStore((s) => s.startWelcomeHtmText);
  const startHelpPhpText = useWorkingCopyStore((s) => s.startHelpPhpText);
  const startReadmeMdText = useWorkingCopyStore((s) => s.startReadmeMdText);
  const startHistoryMdText = useWorkingCopyStore((s) => s.startHistoryMdText);
  const startLicenseText = useWorkingCopyStore((s) => s.startLicenseText);
  const historyEntryState = useWorkingCopyStore((s) => s.historyEntryState);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const testBuildsExist = useHasTestBuilds();
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
  const [texts, setTexts] = useState<Partial<Record<EditableDocMember, string>>>({});
  // Remount key for the panes: bumped when a rich edit is refused (a
  // deleted opaque placeholder), restoring the last good text.
  const [generation, setGeneration] = useState(0);
  const [richWarning, setRichWarning] = useState<string | null>(null);
  const textsRef = useRef(texts);
  textsRef.current = texts;

  const keyboardId = resolveOutputKeyboardId(identity, startKeyboard);
  const isOpen = isOpenedWithDescriptor(instantiationMode, startVfs, keyboardId);

  // -- Seeding (specs/html-editor §3) ---------------------------------------
  // Copy/adapt seed from the live preview (track guards + inheritance
  // already applied there); open seeds from the carried VFS text, else the
  // start* slice, else the preview. An authored override always wins.
  const seeds = useMemo(() => {
    const openText = (path: string): string | undefined =>
      startVfs === null ? undefined : readVfsText(startVfs, path);
    const welcomeOpen =
      openText(WELCOME_PAGE_PATH) ??
      (startWelcomeConvention === "flat" ? openText(FLAT_WELCOME_PATH) : undefined);
    const result: Record<EditableDocMember, string> = {
      "welcome-htm":
        authoredWelcomeHtm ??
        (isOpen ? (welcomeOpen ?? startWelcomeHtmText ?? preview.welcomeHtm) : preview.welcomeHtm),
      "readme-htm":
        authoredReadmeHtm ?? (isOpen ? (openText("source/readme.htm") ?? preview.readmeHtm) : preview.readmeHtm),
      "readme-md":
        authoredReadmeMd ??
        // eslint-disable-next-line lingui/no-unlocalized-strings -- VFS path, not UI copy.
        (isOpen ? (openText("README.md") ?? startReadmeMdText ?? preview.readmeMd) : preview.readmeMd),
      "help-php":
        authoredHelpPhp ??
        (isOpen
          ? (openText(`source/help/${keyboardId}.php`) ?? startHelpPhpText ?? preview.helpPhp)
          : preview.helpPhp),
    };
    return result;
    // Preview object identity changes per render; its members are the seed inputs.
  }, [
    isOpen,
    startVfs,
    startWelcomeConvention,
    startWelcomeHtmText,
    startHelpPhpText,
    startReadmeMdText,
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

  const currentText = (member: EditableDocMember): string => texts[member] ?? seeds[member];

  const setMemberText = (member: EditableDocMember, text: string) => {
    setTexts((prev) => ({ ...prev, [member]: text }));
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
    if (startVfs === null) return false;
    const path =
      member === "welcome-htm"
        ? startWelcomeConvention === "flat"
          ? FLAT_WELCOME_PATH
          : WELCOME_PAGE_PATH
        : member === "help-php"
          ? `source/help/${keyboardId}.php`
          : MEMBER_PATH[member];
    if (readVfsText(startVfs, path) !== undefined) return true;
    if (member === "welcome-htm") return startWelcomeHtmText !== null;
    if (member === "help-php") return startHelpPhpText !== null;
    if (member === "readme-md") return startReadmeMdText !== null;
    return false;
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

  // A file whose PHP cannot round-trip exactly is code-mode-only, with a
  // visible note — never a silent mangle, never a dropped block.
  const codeOnlyReason = (member: EditableDocMember): string | null => {
    if (member !== "help-php") return null;
    const full = currentText(member);
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

  const flushToStore = (snapshot: Partial<Record<EditableDocMember, string>>) => {
    if (snapshot["welcome-htm"] !== undefined) setAuthoredWelcomeHtm(snapshot["welcome-htm"]);
    if (snapshot["readme-htm"] !== undefined) setAuthoredReadmeHtm(snapshot["readme-htm"]);
    if (snapshot["readme-md"] !== undefined) setAuthoredReadmeMd(snapshot["readme-md"]);
    if (snapshot["help-php"] !== undefined) setAuthoredHelpPhp(snapshot["help-php"]);
  };

  const selectMember = (member: SelectorMember) => {
    flushToStore(textsRef.current);
    setRichWarning(null);
    setSelected(member);
    if (!isEditable(member)) setMode("preview");
    else if (mode === "preview" && codeOnlyReason(member) === null) setMode("rich");
  };

  const handleContinue = () => {
    const snapshot = textsRef.current;
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
      onClick: handleContinue,
      testId: "html-continue",
    },
  });

  const selectedState = memberStates.find((s) => s.member === (selected as DocMemberId));
  const codeOnly = isEditable(selected) ? codeOnlyReason(selected) : null;
  const effectiveMode: EditorMode = codeOnly !== null && mode === "rich" ? "code" : mode;

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
    hasTestBuilds: testBuildsExist,
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

      {codeOnly !== null && <p style={{ margin: 0, fontSize: 13, color: "var(--app-warning)" }}>{codeOnly}</p>}
      {richWarning !== null && <p style={{ margin: 0, fontSize: 13, color: "var(--app-warning)" }}>{richWarning}</p>}

      {/* Mode toggle */}
      {isEditable(selected) && (
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
        {isEditable(selected) && effectiveMode === "rich" && (
          <Suspense
            fallback={
              <div style={{ padding: 16, color: "var(--app-text-muted)", fontSize: 13 }}>
                {t({ id: "editor.assignLoop.html.rich.loading", message: "Loading editor…" })}
              </div>
            }
          >
            <HtmlRichTextPane
              key={`${selected}:${generation}`}
              value={richValue(selected)}
              format={selected === "readme-md" ? "markdown" : "html"}
              onChange={(next) => handleRichChange(selected, next)}
            />
          </Suspense>
        )}

        {isEditable(selected) && effectiveMode === "code" && (
          <div style={{ flex: 1, minHeight: 300, display: "flex", flexDirection: "column" }}>
            <Suspense
              fallback={
                <div style={{ padding: 16, color: "var(--app-text-muted)", fontSize: 13 }}>
                  {t({ id: "editor.assignLoop.html.code.loading", message: "Loading editor…" })}
                </div>
              }
            >
              <HtmlCodePane
                key={`${selected}:${generation}`}
                initialText={currentText(selected)}
                language={selected === "readme-md" ? "markdown" : "html"}
                onApply={(next) => setMemberText(selected, next)}
              />
            </Suspense>
          </div>
        )}

        {(effectiveMode === "preview" || !isEditable(selected)) && (
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
