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
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  onKeyTap?: (keyId: string) => void
): OskChannelResult {
  const [lastEvent, setLastEvent] = useState<OskEvent | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [textValue, setTextValue] = useState("");

  // Keep the iframe ref stable in the listener closure without re-registering.
  const iframeRefRef = useRef(iframeRef);
  iframeRefRef.current = iframeRef;

  // Keep the latest onKeyTap callback in a ref so repeated taps of the same
  // key always invoke the current callback without re-registering the listener.
  const onKeyTapRef = useRef(onKeyTap);
  onKeyTapRef.current = onKeyTap;

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
        case "KEY_TAPPED":
          onKeyTapRef.current?.(oskEvent.keyId);
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

  return { send, lastEvent, engineReady, engineError, textValue };
}
