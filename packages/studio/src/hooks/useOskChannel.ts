import { useCallback, useEffect, useRef, useState } from "react";
import type { OskCommand, OskEvent } from "../lib/oskMessages.js";
import { isOskEvent } from "../lib/oskMessages.js";

export interface OskChannelResult {
  send: (cmd: OskCommand) => void;
  lastEvent: OskEvent | null;
  engineReady: boolean;
  engineError: string | null;
  textValue: string;
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
  iframeRef: React.RefObject<HTMLIFrameElement | null>
): OskChannelResult {
  const [lastEvent, setLastEvent] = useState<OskEvent | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [textValue, setTextValue] = useState("");

  // Keep the iframe ref stable in the listener closure without re-registering.
  const iframeRefRef = useRef(iframeRef);
  iframeRefRef.current = iframeRef;

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      const frame = iframeRefRef.current.current;
      // Security: only accept messages from OUR iframe's window.
      if (!frame || event.source !== frame.contentWindow) return;

      if (!isOskEvent(event.data)) return;

      const oskEvent = event.data;
      setLastEvent(oskEvent);

      switch (oskEvent.type) {
        case "ENGINE_READY":
          setEngineReady(true);
          setEngineError(null);
          break;
        case "ENGINE_ERROR":
          setEngineError(oskEvent.message);
          break;
        case "TEXT_UPDATED":
          setTextValue(oskEvent.value);
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
    // [TEMP] targetOrigin is "*" for dev; tighten to app origin in production build.
    frame.contentWindow.postMessage(cmd, "*");
  }, []);

  return { send, lastEvent, engineReady, engineError, textValue };
}
