// postMessage bridge type definitions for the osk-frame.html iframe.
// Host → frame commands; frame → host events.
// These mirror the KMW bootstrap contract defined by km-keyman.

// ---------------------------------------------------------------------------
// Commands: host → frame
// ---------------------------------------------------------------------------

export interface SetKeyboardCommand {
  type: "SET_KEYBOARD";
  jsUrl: string;
  keyboardId: string;
  /** Blob URL for the OSK font file. Injected as @font-face before KMW loads the keyboard. */
  fontFaceUrl?: string;
  /** CSS font-family string, must exactly match the .kvks fontname (e.g. "Andika Afr"). */
  fontFaceFamily?: string;
  /**
   * Blob URLs for per-keyboard CSS files declared in the .kps. Injected as
   * <style> tags inside the OSK iframe AFTER the @font-face and BEFORE
   * addKeyboards() so the compiled keyboard's `.kmw-keyboard-<id>` rules
   * apply to the rendered OSK.
   */
  keyboardCssUrls?: string[];
}

export interface SetOskModeCommand {
  type: "SET_OSK_MODE";
  mode: "desktop" | "touch";
}

export type OskCommand = SetKeyboardCommand | SetOskModeCommand;

// ---------------------------------------------------------------------------
// Events: frame → host
// ---------------------------------------------------------------------------

export interface EngineReadyEvent {
  type: "ENGINE_READY";
}

export interface EngineErrorEvent {
  type: "ENGINE_ERROR";
  message: string;
}

export interface TextUpdatedEvent {
  type: "TEXT_UPDATED";
  value: string;
}

export type OskEvent =
  | EngineReadyEvent
  | EngineErrorEvent
  | TextUpdatedEvent;

// ---------------------------------------------------------------------------
// Type guard — validates that an unknown postMessage payload is an OskEvent.
// ---------------------------------------------------------------------------

export function isOskEvent(data: unknown): data is OskEvent {
  if (typeof data !== "object" || data === null) return false;
  const t = (data as Record<string, unknown>)["type"];
  return t === "ENGINE_READY" || t === "ENGINE_ERROR" || t === "TEXT_UPDATED";
}
