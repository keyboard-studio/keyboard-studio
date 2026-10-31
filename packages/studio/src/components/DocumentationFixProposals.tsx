// DocumentationFixProposals — issue #1908: the deterministic Layer C fixes
// for an ADAPTATION's inherited welcome/help pages, offered to the author at
// the docs (Phase F) step as confirmable proposals — the #504 posture:
// never applied silently, every answer recorded in the working copy
// (`docFixProposals`), and every answer reversible (clearing the record is
// the undo; declining leaves the inherited bytes and their findings exactly
// as they were).
//
// Adapt track only: the copy track carries no inherited prose (spec 102
// FR-032 / spec 080 FR-007), so there is nothing here to propose — the
// component renders nothing unless the working copy is an adaptation with
// inherited welcome/help text. A row appears while its finding is live, and
// stays visible after it is answered so the author can revisit the choice.

import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { expectedPagename, normalizeDocBody, parsePagename } from "@keymanapp/keyboard-lint";
import type { DocFixProposals } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDocumentationFindings } from "../hooks/useDocumentationFindings.ts";

const PAGENAME_CODE = "KM_LINT_PHP_PAGENAME_FORMAT";
const BODY_PARITY_CODE = "KM_LINT_PHP_HTM_BODY_MISMATCH";
const OSK_IMAGE_CODE = "KM_LINT_PHP_OSK_IMAGE_UNCONSTRAINED";

const KB_CSS_PATH_RE = /^source\/(?:help|welcome)\/kb\.css$/i;

interface BodyDifference {
  welcome: string;
  help: string;
}

/** A short window around the first place two normalized bodies diverge — the summary-form diff the author decides from. */
function firstBodyDifference(welcomeBody: string, helpBody: string): BodyDifference {
  let i = 0;
  const limit = Math.min(welcomeBody.length, helpBody.length);
  while (i < limit && welcomeBody[i] === helpBody[i]) i += 1;
  const from = Math.max(0, i - 40);
  return {
    welcome: welcomeBody.slice(from, i + 80),
    help: helpBody.slice(from, i + 80),
  };
}

const rowStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 4,
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const buttonRowStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };

export function DocumentationFixProposals(): React.ReactElement | null {
  const { t } = useLingui();
  const isAdaptation = useWorkingCopyStore((s) => s.instantiationMode === "adapt-existing");
  const proposals = useWorkingCopyStore((s) => s.docFixProposals);
  const setProposals = useWorkingCopyStore((s) => s.setDocFixProposals);
  const startWelcomeHtmText = useWorkingCopyStore((s) => s.startWelcomeHtmText);
  const startHelpPhpText = useWorkingCopyStore((s) => s.startHelpPhpText);
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const startDocCssTexts = useWorkingCopyStore((s) => s.startDocCssTexts);
  const displayName = useWorkingCopyStore(
    (s) => s.identity?.displayName ?? s.startKeyboard?.displayName ?? "",
  );
  const findings = useDocumentationFindings();
  const [canonical, setCanonical] = useState<"welcome" | "help">("welcome");

  if (!isAdaptation) return null;
  if (startWelcomeHtmText === null && startHelpPhpText === null) return null;

  const codes = new Set(findings.map((f) => f.code));
  // A kb.css counts as present when it is resident in the start VFS or
  // carried by the startDocCssTexts slice — on the adapt path the loader
  // delivers the pages' stylesheets fetch-don't-write through the slice,
  // so the slice is where presence and the row's naming come from.
  const kbCssPaths = [
    ...new Set([
      ...(startVfs?.list("source/") ?? []).filter((p) => KB_CSS_PATH_RE.test(p)),
      ...(startDocCssTexts ?? []).map((entry) => entry.path).filter((p) => KB_CSS_PATH_RE.test(p)),
    ]),
  ];
  const showPagename = codes.has(PAGENAME_CODE) || proposals?.pagename !== undefined;
  const showBodySync = codes.has(BODY_PARITY_CODE) || proposals?.bodySync !== undefined;
  // The kb.css proposal activates only when a kb.css is actually in the
  // working copy; an already-recorded answer keeps its row so it stays
  // reversible.
  const showImageWidth =
    (codes.has(OSK_IMAGE_CODE) && kbCssPaths.length > 0) || proposals?.imageWidth !== undefined;
  if (!showPagename && !showBodySync && !showImageWidth) return null;

  const record = (patch: Partial<DocFixProposals>): void =>
    setProposals({ ...(proposals ?? {}), ...patch });
  const clear = (key: keyof DocFixProposals): void => {
    const next: DocFixProposals = { ...(proposals ?? {}) };
    delete next[key];
    setProposals(Object.keys(next).length > 0 ? next : null);
  };

  const currentPagename = startHelpPhpText !== null ? parsePagename(startHelpPhpText) : null;
  const currentName = currentPagename ?? "";
  const expected = expectedPagename(displayName);
  const welcomeBody = startWelcomeHtmText !== null ? normalizeDocBody(startWelcomeHtmText) : "";
  const helpBody = startHelpPhpText !== null ? normalizeDocBody(startHelpPhpText) : "";
  const difference = firstBodyDifference(welcomeBody, helpBody);
  const welcomeSnippet = difference.welcome;
  const helpSnippet = difference.help;
  const kbCssList = kbCssPaths.join(", ");
  const imageFinding = findings.find((f) => f.code === OSK_IMAGE_CODE);
  const imageFindingMessage = imageFinding?.message ?? "";

  return (
    <section
      aria-label={t({ id: "editor.help.docFixProposals.heading", message: "Suggested fixes for the inherited pages" })}
      style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <h3 style={{ font: "600 13px var(--app-font)", margin: 0 }}>
        <Trans id="editor.help.docFixProposals.heading">Suggested fixes for the inherited pages</Trans>
      </h3>
      <p style={{ margin: 0, fontSize: 12 }}>
        <Trans id="editor.help.docFixProposals.intro">
          These fixes are never applied without your say-so. Accepting one records your answer and
          updates the pages this keyboard ships; declining leaves the inherited pages unchanged.
        </Trans>
      </p>

      {showPagename && (
        <div style={rowStyle} data-testid="doc-fix-pagename">
          <strong>
            <Trans id="editor.help.docFixProposals.pagename.title">Page name</Trans>
          </strong>
          <span>
            <Trans id="editor.help.docFixProposals.pagename.detail">
              The help page is named “{currentName}”. The expected name for this keyboard
              is “{expected}”.
            </Trans>
          </span>
          {proposals?.pagename === "accepted" ? (
            <div style={buttonRowStyle}>
              <span>
                <Trans id="editor.help.docFixProposals.pagename.applied">
                  Applied — the shipped help page will use the expected name.
                </Trans>
              </span>
              <button type="button" onClick={() => clear("pagename")}>
                <Trans id="editor.help.docFixProposals.undo">Undo</Trans>
              </button>
            </div>
          ) : proposals?.pagename === "declined" ? (
            <div style={buttonRowStyle}>
              <span>
                <Trans id="editor.help.docFixProposals.pagename.declined">
                  Declined — the inherited page name stays as it is.
                </Trans>
              </span>
              <button type="button" onClick={() => clear("pagename")}>
                <Trans id="editor.help.docFixProposals.changeAnswer">Change answer</Trans>
              </button>
            </div>
          ) : (
            <div style={buttonRowStyle}>
              <button type="button" onClick={() => record({ pagename: "accepted" })}>
                <Trans id="editor.help.docFixProposals.pagename.apply">Use the expected name</Trans>
              </button>
              <button type="button" onClick={() => record({ pagename: "declined" })}>
                <Trans id="editor.help.docFixProposals.decline">Decline</Trans>
              </button>
            </div>
          )}
        </div>
      )}

      {showBodySync && (
        <div style={rowStyle} data-testid="doc-fix-body-sync">
          <strong>
            <Trans id="editor.help.docFixProposals.bodySync.title">Welcome and help page text</Trans>
          </strong>
          <span>
            <Trans id="editor.help.docFixProposals.bodySync.detail">
              The welcome page and the help page carry different text. First difference — welcome: “
              {welcomeSnippet}” · help: “{helpSnippet}”
            </Trans>
          </span>
          {proposals?.bodySync === "welcome" || proposals?.bodySync === "help" ? (
            <div style={buttonRowStyle}>
              <span>
                {proposals.bodySync === "welcome" ? (
                  <Trans id="editor.help.docFixProposals.bodySync.appliedWelcome">
                    Applied — the help page now carries the welcome page's text.
                  </Trans>
                ) : (
                  <Trans id="editor.help.docFixProposals.bodySync.appliedHelp">
                    Applied — the welcome page now carries the help page's text.
                  </Trans>
                )}
              </span>
              <button type="button" onClick={() => clear("bodySync")}>
                <Trans id="editor.help.docFixProposals.undo">Undo</Trans>
              </button>
            </div>
          ) : proposals?.bodySync === "declined" ? (
            <div style={buttonRowStyle}>
              <span>
                <Trans id="editor.help.docFixProposals.bodySync.declined">
                  Declined — the two pages keep their different text.
                </Trans>
              </span>
              <button type="button" onClick={() => clear("bodySync")}>
                <Trans id="editor.help.docFixProposals.changeAnswer">Change answer</Trans>
              </button>
            </div>
          ) : (
            <>
              <div style={buttonRowStyle} role="radiogroup" aria-label={t({ id: "editor.help.docFixProposals.bodySync.canonicalLabel", message: "Which page's text should both pages carry?" })}>
                <label>
                  <input
                    type="radio"
                    name="doc-fix-body-canonical"
                    checked={canonical === "welcome"}
                    onChange={() => setCanonical("welcome")}
                  />{" "}
                  <Trans id="editor.help.docFixProposals.bodySync.welcomeCanonical">
                    Use the welcome page's text
                  </Trans>
                </label>
                <label>
                  <input
                    type="radio"
                    name="doc-fix-body-canonical"
                    checked={canonical === "help"}
                    onChange={() => setCanonical("help")}
                  />{" "}
                  <Trans id="editor.help.docFixProposals.bodySync.helpCanonical">
                    Use the help page's text
                  </Trans>
                </label>
              </div>
              <div style={buttonRowStyle}>
                <button type="button" onClick={() => record({ bodySync: canonical })}>
                  <Trans id="editor.help.docFixProposals.bodySync.apply">Make both pages match</Trans>
                </button>
                <button type="button" onClick={() => record({ bodySync: "declined" })}>
                  <Trans id="editor.help.docFixProposals.decline">Decline</Trans>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {showImageWidth && (
        <div style={rowStyle} data-testid="doc-fix-image-width">
          <strong>
            <Trans id="editor.help.docFixProposals.imageWidth.title">Image width</Trans>
          </strong>
          <span>
            <Trans id="editor.help.docFixProposals.imageWidth.detail">
              Some images on the help pages have no width limit and can overflow the page. Adding an
              “img” rule with “max-width: 100%” to kb.css ({kbCssList}) limits every image
              to the page width.
            </Trans>
          </span>
          {imageFinding !== undefined && (
            <span style={{ fontSize: 12 }}>{imageFindingMessage}</span>
          )}
          {proposals?.imageWidth === "accepted" ? (
            <div style={buttonRowStyle}>
              <span>
                <Trans id="editor.help.docFixProposals.imageWidth.applied">
                  Applied — the shipped kb.css will carry the image width rule.
                </Trans>
              </span>
              <button type="button" onClick={() => clear("imageWidth")}>
                <Trans id="editor.help.docFixProposals.undo">Undo</Trans>
              </button>
            </div>
          ) : proposals?.imageWidth === "declined" ? (
            <div style={buttonRowStyle}>
              <span>
                <Trans id="editor.help.docFixProposals.imageWidth.declined">
                  Declined — kb.css stays as it is.
                </Trans>
              </span>
              <button type="button" onClick={() => clear("imageWidth")}>
                <Trans id="editor.help.docFixProposals.changeAnswer">Change answer</Trans>
              </button>
            </div>
          ) : (
            <div style={buttonRowStyle}>
              <button type="button" onClick={() => record({ imageWidth: "accepted" })}>
                <Trans id="editor.help.docFixProposals.imageWidth.apply">Add the width rule</Trans>
              </button>
              <button type="button" onClick={() => record({ imageWidth: "declined" })}>
                <Trans id="editor.help.docFixProposals.decline">Decline</Trans>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
