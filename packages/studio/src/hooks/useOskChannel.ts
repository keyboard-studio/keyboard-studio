import { useCallback, useEffect, useRef, useState } from "react";
import type { OskCommand, OskEvent } from "../lib/oskMessages.js";
import { isOskEvent } from "../lib/oskMessages.js";

export interface OskChannelResult {
  send: (cmd: OskCommand) => void;
  lastEvent: OskEvent | null;
  engineReady: boolean;
  engineError: string | null;
  textValue: string;
  /** Frame document's natural height (CONTENT_HEIGHT), or null until reported. */
  contentHeight: number | null;
  /** KEYBOARD_ACTIVE count: 0 until the first keyboard is typeable. */
  keyboardActivations: number;
}

/**
 * Manages the postMessage bridge between the host page and the osk-frame.html
 * iframe. Registers a single window "message" listener; validates that
 * incoming messages originate from the expected iframe contentWindow before
 * accepting them. Cleans up on unmount.
 *
 * NEVER import the WASM module on the main thread — all KMW interaction goes
 * through this bridge.
 */
export function useOskChannel(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
): OskChannelResult {
  const [lastEvent, setLastEvent] = useState<OskEvent | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [textValue, setTextValue] = useState("");
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [keyboardActivations, setKeyboardActivations] = useState(0);

  // Keep the iframe ref stable in the listener closure without re-registering.
  const iframeRefRef = useRef(iframeRef);
  iframeRefRef.current = iframeRef;

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      const frame = iframeRefRef.current.current;
      // Security: only accept messages from OUR iframe's window.
      if (!frame || event.source !== frame.contentWindow) return;

      if (!isOskEvent(event.data)) return;

      setLastEvent(event.data);

      switch (event.data.type) {
        case "ENGINE_READY":
          setEngineReady(true);
          setEngineError(null);
          break;
        case "ENGINE_ERROR":
          setEngineError(event.data.message);
          break;
        case "KEYBOARD_ACTIVE":
          setKeyboardActivations((n) => n + 1);
          // #1905: a KEYBOARD_ACTIVE means the latest keyboard loaded and is
          // typeable, so any earlier ENGINE_ERROR is stale — it belonged to a
          // superseded load (e.g. a recompile whose blob was revoked before
          // KMW's script tag fetched it). Without this the red banner sticks
          // forever over a working keyboard. A genuine failure of the latest
          // load still surfaces: it posts ENGINE_ERROR with no following
          // KEYBOARD_ACTIVE.
          setEngineError(null);
          break;
        case "TEXT_UPDATED":
          setTextValue(event.data.value);
          break;
        case "CONTENT_HEIGHT":
          setContentHeight(event.data.height);
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []); // Single registration — iframeRef identity changes are handled via iframeRefRef.

  const send = useCallback((cmd: OskCommand): void => {
    const frame = iframeRefRef.current.current;
    if (!frame || !frame.contentWindow) return;
    // Scoped to our own origin — the frame is same-origin-relative
    // (src="/osk-frame.html") in every deployment, so this never needs a
    // hardcoded value.
    frame.contentWindow.postMessage(cmd, window.location.origin);
  }, []);

  return {
    send,
    lastEvent,
    engineReady,
    engineError,
    textValue,
    contentHeight,
    keyboardActivations,
  };
}
