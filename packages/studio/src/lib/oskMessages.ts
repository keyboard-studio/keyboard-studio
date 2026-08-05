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
  mode: "desktop" | "touch" | "tablet";
}

/**
 * Push localized UI strings into the frame. The frame is a static
 * /osk-frame.html document with no access to the studio's Lingui catalogs,
 * so its user-facing chrome (the input placeholder and the idle "pick a
 * keyboard" status prompt) is supplied by the host, which does have `t`.
 * Sent on frame load and whenever the active locale changes.
 */
export interface SetStringsCommand {
  type: "SET_STRINGS";
  strings: {
    /** Placeholder for the type-here textarea. */
    placeholder?: string;
    /** Status line shown once the engine is up but no keyboard is active yet. */
    statusReady?: string;
  };
}

export type OskCommand = SetKeyboardCommand | SetOskModeCommand | SetStringsCommand;

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
