// CarveHostSelector — T018 (spec 076 FR-023, amendment A3).
//
// Host-layout selector for carved combinations. Mounted by the Behaviours
// step test pane (076 phase-5 location — that pane does not exist in the
// codebase yet, so this component is self-contained and ready to mount).
//
// WHAT IT DOES
// ------------
// - Options: the keyboard's likely hosts from `useLikelyHostLayouts`
//   (FR-023 order: layout_family answer → bcp47 region → default five) PLUS
//   a "blocked" entry (`BLOCKED_HOST_ID`).
// - Selecting a host shows what that host would produce for the carved
//   combination (`lookupHostOutput`, keyed by key+modifiers generally — the
//   same lookup the later `swallowUndefined` phase reuses). Selecting
//   "blocked" shows the uniform suppression outcome: nothing.
// - The `HOST_GUESS_CAPTION` honesty caption sits beside the selector: the
//   shown layouts are a best guess, not sight of the typists' machines.
//
// COPY
// ----
// Kept factual and symmetric (A2): each side states its own outcome. The
// expanded per-disposition consequence copy belongs to T019; this surface
// never carries the retired slogan ("Allow means unpredictable; Block means
// predictable" must appear nowhere).
//
// KEYMANWEB LOUD-BLOCK FLASH
// --------------------------
// There is no KeymanWeb simulation path in the studio yet, and no beep/flash
// mechanism (the only beep trace is the 🔔 label in irToCarveNodes). The
// `loud` prop therefore renders a CSS-pulse stub with a TODO marking the
// hook point for the real KeymanWeb flash — no player is invented here.

import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import {
  BLOCKED_HOST_ID,
  DEADKEY,
  HOST_GUESS_CAPTION,
  HOST_LAYOUTS,
  lookupHostOutput,
} from "../../lib/referenceHostLayouts.ts";
import type { HostLayoutId } from "../../lib/referenceHostLayouts.ts";
import { useLikelyHostLayouts } from "../../lib/layoutFamily.ts";

/** A carved combination, expressed as key+modifiers for the host lookup. */
export interface CarvedComboInput {
  /** Keyman positional vkey id, e.g. "K_4" (the same ids the IR carries). */
  key: string;
  /** Raw IR modifier tokens, e.g. ["RALT"] or ["SHIFT"]. */
  modifiers: readonly string[];
  /** Human-readable label, e.g. "AltGr+4"; falls back to `key`. */
  label?: string | undefined;
}

export interface CarveHostSelectorProps {
  combo: CarvedComboInput;
  /** The keyboard's bcp47 tag; drives likely-host resolution. */
  bcp47?: string | undefined;
  /**
   * True when the carved combo's disposition is a loud block (`nul beep`):
   * selecting "blocked" renders the flash stub. (A2 symmetry: the flash is
   * the loud form's demonstration, not a verdict on the choice.)
   */
  loud?: boolean | undefined;
}

type Selection = HostLayoutId | typeof BLOCKED_HOST_ID;

function isSelection(value: string): value is Selection {
  return value === BLOCKED_HOST_ID || value in HOST_LAYOUTS;
}

export function CarveHostSelector({ combo, bcp47, loud = false }: CarveHostSelectorProps) {
  const { hosts } = useLikelyHostLayouts(bcp47);
  const [selected, setSelected] = useState<string>(hosts[0]?.id ?? "us");

  const comboLabel = combo.label ?? combo.key;
  // The <select> only offers likely-host ids and "blocked"; narrow defensively.
  const selection: Selection = isSelection(selected) ? selected : "us";

  return (
    <section data-testid="carve-host-selector">
      <label
        htmlFor="carve-host-select"
        style={{ font: "600 10.5px var(--app-font)", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--app-text-muted)" }}
      >
        <Trans id="carve.host-selector.label">Host layout</Trans>
      </label>
      <select
        id="carve-host-select"
        data-testid="carve-host-select"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{ display: "block", marginTop: 6, fontSize: 13, padding: "4px 8px" }}
      >
        {hosts.map((h) => (
          <option key={h.id} value={h.id}>
            {h.label}
          </option>
        ))}
        <option value={BLOCKED_HOST_ID}>
          <Trans id="carve.host-selector.blocked">Blocked (suppressed)</Trans>
        </option>
      </select>

      <div data-testid="carve-host-result" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
        {selection === BLOCKED_HOST_ID ? (
          <BlockedOutcome comboLabel={comboLabel} loud={loud} />
        ) : (
          <HostOutcome combo={combo} comboLabel={comboLabel} host={selection} />
        )}
      </div>

      <p
        data-testid="carve-host-caption"
        style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--app-text-muted)", lineHeight: 1.5 }}
      >
        {HOST_GUESS_CAPTION}
      </p>
    </section>
  );
}

function HostOutcome({
  combo,
  comboLabel,
  host,
}: {
  combo: CarvedComboInput;
  comboLabel: string;
  host: HostLayoutId;
}) {
  const output = lookupHostOutput(host, combo.key, combo.modifiers);
  const hostLabel = HOST_LAYOUTS[host].label;

  if (output === undefined) {
    return (
      <span>
        <Trans id="carve.host-selector.unknown">
          On {hostLabel}, pressing {comboLabel} is unknown in the reference data — shown as unknown, never guessed.
        </Trans>
      </span>
    );
  }
  if (output === DEADKEY) {
    return (
      <span>
        <Trans id="carve.host-selector.deadkey">
          On {hostLabel}, pressing {comboLabel} arms a host deadkey — it produces no character itself, but the next keystroke may.
        </Trans>
      </span>
    );
  }
  return (
    <span>
      <Trans id="carve.host-selector.output">
        On {hostLabel}, pressing {comboLabel} produces “{output}”.
      </Trans>
    </span>
  );
}

function BlockedOutcome({ comboLabel, loud }: { comboLabel: string; loud: boolean }) {
  return (
    <span>
      <Trans id="carve.host-selector.blocked-outcome">
        Blocked: {comboLabel} produces nothing — the keystroke is suppressed on every machine.
      </Trans>
      {loud && (
        <span
          data-testid="carve-host-flash"
          title="loud block"
          style={{ display: "inline-block", marginLeft: 8, animation: "carve-host-flash-pulse 1s ease-in-out infinite" }}
        >
          {/* TODO (T018): KEYMANWEB FLASH HOOK — when the Behaviours step
              test pane gains a KeymanWeb simulation path, replace this CSS
              pulse with the real KeymanWeb loud-block flash call. Per the
              plan, on KeymanWeb the loud Block case flashes rather than
              beeping; this stub demonstrates the loud form without
              inventing a player. */}
          <style>{`@keyframes carve-host-flash-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }`}</style>
          🔔
        </span>
      )}
    </span>
  );
}
