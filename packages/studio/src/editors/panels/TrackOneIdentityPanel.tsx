// TrackOneIdentityPanel — identity-edit control for Track 1 (new keyboard
// from a base). Lets the author set the display name and keyboard id before
// downloading.
//
// Placement: rendered in PreviewShell's left pane when
// instantiationMode === "new-from-base", below the scaffold mode toggle and
// above the KMN editor. Hidden (or made read-only) for Track 2
// (adapt-existing) because identity is preserved from the loaded keyboard.
//
// Behaviour:
//   - Seeded from baseKeyboard.id / baseKeyboard.displayName on first mount
//     (or from the existing identity patch if the user already set one).
//   - On every change, calls setIdentity({ displayName, keyboardId }) so the
//     projection layer immediately picks up displayName (spacebar caption) and
//     serializeWorkingCopy picks up keyboardId (zip filename).
//   - Keyboard id is validated live via validateKeyboardId (§10 Layer A check #1).
//   - A non-blocking warning is shown below the form when keyboardId still
//     matches the base keyboard's id (download will work, but the user should
//     change it before submitting to the community repo).

import { useEffect, useRef, useState } from "react";
import { validateKeyboardId } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { TextField, Label, ErrorText } from "../../ui/index.ts";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrackOneIdentityPanel() {
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const identity = useWorkingCopyStore((s) => s.identity);
  const setIdentity = useWorkingCopyStore((s) => s.setIdentity);

  // Local controlled state — mirrors the store with a round-trip:
  // store → local (seeded), local → store (on change).
  const [displayName, setDisplayName] = useState<string>("");
  const [keyboardId, setKeyboardId] = useState<string>("");

  // Track whether the user has interacted with each field yet (so we don't
  // show errors on pristine fields).
  const [idTouched, setIdTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  // Seed from store whenever the working copy is (re-)instantiated.
  // We guard with a ref to avoid re-seeding after the user has already typed.
  const seededForBaseRef = useRef<string | null>(null);

  useEffect(() => {
    if (baseKeyboard === null) return;
    if (seededForBaseRef.current === baseKeyboard.id) return; // already seeded for this base

    // Seed from the store's identity patch first; fall back to base metadata.
    const seedId = identity?.keyboardId ?? baseKeyboard.id;
    const seedName = identity?.displayName ?? baseKeyboard.displayName;

    setKeyboardId(seedId);
    setDisplayName(seedName);
    setIdTouched(false);
    setNameTouched(false);
    seededForBaseRef.current = baseKeyboard.id;
  }, [baseKeyboard, identity]);

  // Only render for Track 1.
  if (instantiationMode !== "new-from-base" || baseKeyboard === null) {
    return null;
  }

  const idValidation = validateKeyboardId(keyboardId.trim());
  const idError = idValidation.valid ? null : (idValidation.reason ?? "invalid keyboard id");
  const isIdValid = idValidation.valid;
  const isIdUntouched = keyboardId.trim() === baseKeyboard.id;

  // Propagate to the store on display-name change.
  function handleDisplayNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.currentTarget.value;
    setDisplayName(next);
    setNameTouched(true);
    setIdentity({
      ...identity,
      displayName: next,
    });
  }

  // Propagate to the store on keyboard-id change.
  function handleKeyboardIdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.currentTarget.value;
    setKeyboardId(next);
    setIdTouched(true);
    const trimmed = next.trim();
    const validationError = validateKeyboardId(trimmed);
    if (validationError.valid) {
      setIdentity({
        ...identity,
        keyboardId: trimmed,
      });
    }
    // When the field is invalid we do NOT call setIdentity so the store retains
    // the last valid value (or undefined). The validation error is shown inline.
  }

  return (
    <section
      aria-label="Name your keyboard"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        background: "#161b22",
        border: "1px solid #283040",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#7ee787",
          fontWeight: 700,
        }}
      >
        Name your keyboard
      </div>

      {/* Display name */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {/* one-off: hint #9aa7b8 — Label default is #e6edf3; override via style passthrough */}
        <Label
          htmlFor="identity-display-name"
          style={{ fontSize: 12, color: "#9aa7b8", fontWeight: 600, marginBottom: 0 }}
        >
          Display name
        </Label>
        {/* one-off: input border #283040 — TextField BORDER is #30363d; override via style passthrough */}
        <TextField
          id="identity-display-name"
          value={displayName}
          onChange={handleDisplayNameChange}
          placeholder="e.g. Hausa (SIL)"
          autoComplete="off"
          aria-describedby="identity-display-name-hint"
          style={{ border: "1px solid #283040", fontSize: 13 }}
        />
        {/* one-off: hint #9aa7b8 — ErrorText hint renders var(--app-text-muted), not #9aa7b8 */}
        <div
          id="identity-display-name-hint"
          style={{ fontSize: 11, color: "#9aa7b8", lineHeight: 1.4 }}
        >
          Shown on the spacebar in the on-screen keyboard.
        </div>
        {nameTouched && displayName.trim().length === 0 && (
          <ErrorText tone="error">
            Display name cannot be empty.
          </ErrorText>
        )}
      </div>

      {/* Keyboard id */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {/* one-off: hint #9aa7b8 — Label default is #e6edf3; override via style passthrough */}
        <Label
          htmlFor="identity-keyboard-id"
          style={{ fontSize: 12, color: "#9aa7b8", fontWeight: 600, marginBottom: 0 }}
        >
          Keyboard ID
        </Label>
        {/* one-off: input border #283040 — TextField BORDER is #30363d; override via style passthrough */}
        <TextField
          id="identity-keyboard-id"
          mono
          error={idTouched && !isIdValid}
          value={keyboardId}
          onChange={handleKeyboardIdChange}
          onBlur={() => setIdTouched(true)}
          placeholder="e.g. ha_sil"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={
            idTouched && !isIdValid
              ? "identity-id-error"
              : isIdUntouched
                ? "identity-id-base-warn"
                : "identity-id-hint"
          }
          aria-invalid={idTouched && !isIdValid}
          style={{
            border: `1px solid ${idTouched && !isIdValid ? "#7a2a2a" : "#283040"}`,
            fontSize: 13,
          }}
        />
        {idTouched && !isIdValid ? (
          <div id="identity-id-error">
            <ErrorText tone="error">{idError}</ErrorText>
          </div>
        ) : isIdUntouched ? (
          // one-off: role=status + #d29922 advisory — no ErrorText tone matches
          // (ErrorText "warning" gives role="alert"; "hint" gives var(--app-text-muted)).
          // Preserved inline to avoid behavioral diff on role and color.
          <div
            id="identity-id-base-warn"
            role="status"
            aria-live="polite"
            style={{ fontSize: 12, color: "#d29922", lineHeight: 1.4 }}
          >
            [WARN] This is still the base keyboard&rsquo;s id. Set a unique id
            before submitting to the community repository.
          </div>
        ) : (
          // one-off: hint #9aa7b8 — ErrorText hint renders var(--app-text-muted), not #9aa7b8
          <div
            id="identity-id-hint"
            style={{ fontSize: 11, color: "#9aa7b8", lineHeight: 1.4 }}
          >
            1&ndash;255 chars; no spaces, parens, brackets, or commas. Used as
            the zip filename.
          </div>
        )}
      </div>
    </section>
  );
}
