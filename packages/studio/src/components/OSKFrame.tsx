// React wrapper around the /osk-frame.html iframe. Owns the iframe ref,
// drives postMessage commands from the parent state, surfaces incoming
// text + ready/error events back up via useOskChannel.
//
// The iframe is mounted unconditionally (even before a keyboard is picked)
// so KMW's init() runs once and stays warm. Hiding & re-creating the iframe
// would reset KMW context on every selection — expensive.

import { useEffect, useRef } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { isExcludedScript } from "../lib/excludedScriptFamilies.ts";
import type { Stage } from "../hooks/useKeyboardArtifact.ts";
import { useOskChannel } from "../hooks/useOskChannel.ts";
import type { OskMode } from "./OskModeToggle.tsx";
import { PreviewPaneOverlay } from "./PreviewPaneOverlay.tsx";
import { UnsupportedScriptStub } from "./UnsupportedScriptStub.tsx";

export interface OSKFrameProps {
  baseKeyboard: BaseKeyboard | null;
  oskMode: OskMode;
  /** Lifted from useKeyboardArtifact in the parent (PreviewShell). */
  stage: Stage;
  /** Retry callback from useKeyboardArtifact in the parent. */
  retry: () => void;
  onTextChange?: (text: string) => void;
}

export function OSKFrame({
  baseKeyboard,
  oskMode,
  stage,
  retry,
  onTextChange,
}: OSKFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const channel = useOskChannel(iframeRef);

  // Pull stable references out of the channel — the returned object's
  // identity changes on every render even though `send` is useCallback-ed
  // and the booleans are primitives. Depending on the object directly
  // re-fires these effects every render and spams the iframe with
  // duplicate SET_KEYBOARD messages.
  const { send, engineReady, textValue } = channel;

  useEffect(() => {
    if (onTextChange) onTextChange(textValue);
  }, [textValue, onTextChange]);

  useEffect(() => {
    if (stage.kind !== "ready") return;
    if (!engineReady) return;
    if (!baseKeyboard) return;
    if (!stage.jsBlobUrl) return;
    send({
      type: "SET_KEYBOARD",
      jsUrl: stage.jsBlobUrl,
      keyboardId: baseKeyboard.id,
      ...(stage.fontFaceUrl !== undefined ? { fontFaceUrl: stage.fontFaceUrl } : {}),
      ...(stage.fontFaceFamily !== undefined ? { fontFaceFamily: stage.fontFaceFamily } : {}),
      ...(stage.keyboardCssUrls !== undefined && stage.keyboardCssUrls.length > 0
        ? { keyboardCssUrls: stage.keyboardCssUrls }
        : {}),
    });
  }, [stage, engineReady, baseKeyboard, send]);

  useEffect(() => {
    if (!engineReady) return;
    send({ type: "SET_OSK_MODE", mode: oskMode });
  }, [oskMode, engineReady, send]);

  if (baseKeyboard !== null && isExcludedScript(baseKeyboard.script)) {
    return <UnsupportedScriptStub script={baseKeyboard.script} />;
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: 380,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #283040",
        background: "#0d1117",
      }}
    >
      <iframe
        ref={iframeRef}
        src="/osk-frame.html"
        title="On-screen keyboard preview"
        // allow-same-origin is required for the postMessage source check
        // and for KMW's relative .js fetches in dev. Production will move
        // KMW assets behind a stricter CSP.
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: "100%",
          height: 560,
          border: "0",
          display: "block",
          background: "#14191f",
        }}
        aria-busy={stage.kind !== "ready" && stage.kind !== "idle"}
      />
      <PreviewPaneOverlay stage={stage} onRetry={retry} />
      {channel.engineError !== null && (
        <div
          style={{
            position: "absolute",
            bottom: 6,
            left: 6,
            right: 6,
            fontSize: 11,
            padding: "6px 10px",
            background: "rgba(240,184,110,0.12)",
            color: "#f0b86e",
            border: "1px solid rgba(240,184,110,0.4)",
            borderRadius: 6,
            fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
          }}
        >
          KMW: {channel.engineError}
        </div>
      )}
    </div>
  );
}
