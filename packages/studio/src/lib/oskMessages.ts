// postMessage bridge type definitions for the osk-frame.html iframe.
// Host → frame commands; frame → host events.
// These mirror the KMW bootstrap contract defined by km-keyman.

// ---------------------------------------------------------------------------
// Commands: host → frame
// ---------------------------------------------------------------------------

export interface SetKeyboardCommand {
  type: "SET_KEYBOARD";
  /** MUST be a blob: URL; the frame rejects anything else. */
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
  /**
   * BCP47 language tag the compiled keyboard declares (e.g. "ewo", "ha-Latn").
   * Used to register the KMW keyboard stub and activate it under the correct
   * language. Defaults to "en" inside the frame if omitted, which fails for any
   * non-English keyboard with "Cannot find the <id> keyboard for English".
   */
  bcp47?: string;
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

export interface KeyTappedEvent {
  type: "KEY_TAPPED";
  keyId: string;
}

export type OskEvent =
  | EngineReadyEvent
  | EngineErrorEvent
  | TextUpdatedEvent
  | KeyTappedEvent;

// ---------------------------------------------------------------------------
// Type guard — validates that an unknown postMessage payload is an OskEvent.
// ---------------------------------------------------------------------------

export function isOskEvent(data: unknown): data is OskEvent {
  if (typeof data !== "object" || data === null) return false;
  const t = (data as Record<string, unknown>)["type"];
  return t === "ENGINE_READY" || t === "ENGINE_ERROR" || t === "TEXT_UPDATED" || t === "KEY_TAPPED";
}
