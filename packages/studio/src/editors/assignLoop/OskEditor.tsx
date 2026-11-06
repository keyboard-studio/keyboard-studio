// OskEditor — minimal on-screen keyboard editor (Phase 2).
//
// Customization step after the Mechanical gallery: the underlying OSK is
// generated from the physical layout (generateKvksFromIR), and this editor
// lets the author make visual modifications — change key labels (free text),
// blank keys, and toggle display-underlying / 102nd-key.
//
// Matthew's rulings (2026-11-03):
// - Display label may differ from output "for understanding" (free text).
// - Blanking (empty label) a key WITH output is an ERROR — blocked + inline message.
// - Deadkey labels are free text, never raw `dk(...)` (generator handles defaults).
// - Out of scope: bitmap keys, BMP/PNG/HTML export, raw XML code tab.
//
// State: local KvksIR + undo history (past states). Edits go through commit
// functions that push the prior state — the touch builder's discipline
// (commit → undo batch), simplified for the OSK's flat key model.

import { useMemo, useState, lazy, Suspense } from "react";
import { useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { I18n, MessageDescriptor } from "@lingui/core";
import type { KvksIR } from "@keyboard-studio/contracts";
import {
  generateKvksFromIR,
  oskContinueResult,
  DESKTOP_GEOMETRY,
} from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import type { EditorStepProps } from "../../steps/types.ts";

// The Code tab pane. Lazy-loaded so the Monaco bundle never lands in the
// main chunk (same discipline as TouchCodePane).
const OskCodePane = lazy(() =>
  import("./OskCodePane.tsx").then((m) => ({ default: m.OskCodePane })),
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SelectedKey {
  vkey: string;
  shift: string;
}

// ---------------------------------------------------------------------------
// Helpers (pure)
// ---------------------------------------------------------------------------

/** Find a key in a KvksIR layer. */
function findKey(
  kvks: KvksIR,
  shift: string,
  vkey: string,
): { label: string; chars?: string } | undefined {
  const layer = kvks.layers.find((l) => l.shift === shift);
  return layer?.keys.find((k) => k.vkey === vkey);
}

/** Immutable label update. */
function withLabel(kvks: KvksIR, shift: string, vkey: string, label: string): KvksIR {
  return {
    ...kvks,
    layers: kvks.layers.map((l) =>
      l.shift !== shift
        ? l
        : {
            ...l,
            keys: l.keys.map((k) => (k.vkey === vkey ? { ...k, label } : k)),
          },
    ),
  };
}

/**
 * Shift-code display names for the layer switcher.
 *
 * Module-level msg() descriptors (resolved via i18n) because the Lingui
 * extractor cannot follow a `t` passed as a function parameter — the old
 * t({id, message}) calls here were invisible to `messages:extract` and the
 * drift lint flagged the four ids as removed.
 */
const SHIFT_DISPLAY_MSGS = {
  layerDefault: msg({
    id: "editor.assignLoop.osk.layerDefault",
    message: "Default",
  }),
  modShift: msg({ id: "editor.assignLoop.osk.modShift", message: "Shift" }),
  modCtrl: msg({ id: "editor.assignLoop.osk.modCtrl", message: "Ctrl" }),
  modAlt: msg({ id: "editor.assignLoop.osk.modAlt", message: "Alt" }),
} as const satisfies Record<string, MessageDescriptor>;

function shiftDisplayName(shift: string, i18n: I18n): string {
  if (shift === "") return i18n._(SHIFT_DISPLAY_MSGS.layerDefault);
  const parts: string[] = [];
  if (shift.includes("S"))
    parts.push(i18n._(SHIFT_DISPLAY_MSGS.modShift));
  if (shift.includes("C")) parts.push(i18n._(SHIFT_DISPLAY_MSGS.modCtrl));
  if (shift.includes("A")) parts.push(i18n._(SHIFT_DISPLAY_MSGS.modAlt));
  return parts.length > 0 ? parts.join("+") : shift;
}

// ---------------------------------------------------------------------------
// Semantic colors (from packages/studio/src/styles/colors.css — no literals)
// ---------------------------------------------------------------------------

const BG_CANVAS = "var(--app-surface)";
const BG_CARD = "var(--app-surface)";
const BORDER = "var(--app-border)";
const TEXT_MAIN = "var(--app-text)";
const TEXT_DIM = "var(--app-text-muted)";
const ACCENT = "var(--app-accent)";
const ACCENT_BG = "var(--app-accent-bg)";
const DANGER = "var(--app-danger)";
const DANGER_BG = "var(--app-danger-bg)";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OskEditor({ onComplete, onBack }: EditorStepProps) {
  const { t, i18n } = useLingui();
  const ir = useWorkingCopyStore((s) => s.ir);
  const kbdname = useWorkingCopyStore((s) => s.ir?.header.name ?? "keyboard");

  // Base KvksIR generated from the IR (the "reset" baseline).
  const baseKvks = useMemo<KvksIR | null>(() => {
    if (!ir) return null;
    try {
      return generateKvksFromIR(ir, kbdname);
    } catch {
      return null;
    }
  }, [ir, kbdname]);

  // Current (edited) KvksIR + undo history.
  const [kvks, setKvks] = useState<KvksIR | null>(baseKvks);
  const [history, setHistory] = useState<KvksIR[]>([]);
  const [activeTab, setActiveTab] = useState<"visual" | "code">("visual");
  const [activeShift, setActiveShift] = useState<string>("");
  const [selected, setSelected] = useState<SelectedKey | null>(null);
  const [labelDraft, setLabelDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Geometry lookup for the active layer's keys (before early return).
  const geomById = useMemo(() => {
    const m = new Map<string, { row: number; x: number; width: number }>();
    for (const g of DESKTOP_GEOMETRY) m.set(g.id, g);
    return m;
  }, []);

  // Sync when base regenerates (e.g. IR changes).
  const effectiveKvks = kvks ?? baseKvks;

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      if (prev) {
        setKvks(prev);
        setError(null);
      }
      return h.slice(0, -1);
    });
  };

  // Footer nav (spec 081, #2527): Back / Undo / Continue publish to the
  // footer instead of rendering in a sticky in-body bar. Called before the
  // no-keyboard early return, with the spec for the current render state —
  // the fallback has no Undo, so it publishes Back + Continue only. Undo
  // is the secondary slot, so it renders to the RIGHT of Back and Continue
  // (ruling 2026-11-06) and its appearing never moves them. Test ids are
  // unchanged, so e2e keeps finding osk-continue in the footer.
  usePublishStepNav(
    effectiveKvks === null
      ? {
          ...(onBack !== undefined
            ? {
                back: {
                  label: t({ id: "editor.assignLoop.osk.back", message: "Back" }),
                  onClick: onBack,
                  testId: "osk-back",
                },
              }
            : {}),
          forward: {
            label: t({ id: "editor.assignLoop.osk.continue", message: "Continue" }),
            onClick: () => {
              onComplete(oskContinueResult(null));
            },
            testId: "osk-continue",
          },
        }
      : {
          ...(onBack !== undefined
            ? {
                back: {
                  label: t({ id: "editor.assignLoop.osk.back", message: "Back" }),
                  onClick: onBack,
                  testId: "osk-back",
                },
              }
            : {}),
          secondary: {
            label: t({ id: "editor.assignLoop.osk.undo", message: "Undo" }),
            onClick: undo,
            testId: "osk-undo",
            disabled: history.length === 0,
          },
          forward: {
            label: t({ id: "editor.assignLoop.osk.continue", message: "Continue" }),
            onClick: () => {
              // The customized KvksIR emitted to .kvks XML (the lifted
              // product seam — the headless author calls the same function).
              onComplete(oskContinueResult(effectiveKvks));
            },
            testId: "osk-continue",
          },
        },
  );

  if (!effectiveKvks) {
    return (
      <div>
        <div style={{ padding: 24, color: TEXT_DIM }}>
          {t({ id: "editor.assignLoop.osk.noKeyboard", message: "No keyboard loaded." })}
        </div>
      </div>
    );
  }

  const layers = effectiveKvks.layers;
  const activeLayer = layers.find((l) => l.shift === activeShift) ?? layers[0];
  const effectiveShift = activeLayer?.shift ?? "";

  // Commit helper: push prior state to history, apply update.
  const commit = (next: KvksIR) => {
    setHistory((h) => [...h, effectiveKvks]);
    setKvks(next);
    setError(null);
  };

  const handleSelectKey = (vkey: string) => {
    const key = findKey(effectiveKvks, effectiveShift, vkey);
    setSelected({ vkey, shift: effectiveShift });
    setLabelDraft(key?.label ?? "");
    setError(null);
  };

  const handleLabelChange = (value: string) => {
    setLabelDraft(value);
    // Live validation: empty label + chars = error (Matthew's ruling).
    if (selected) {
      const key = findKey(effectiveKvks, selected.shift, selected.vkey);
      if (value.trim() === "" && key?.chars) {
        setError(
          t({
            id: "editor.assignLoop.osk.emptyLabelError",
            message:
              "A key with output cannot have an empty label. Enter a display character.",
          }),
        );
      } else {
        setError(null);
      }
    }
  };

  const handleApplyLabel = () => {
    if (!selected) return;
    const key = findKey(effectiveKvks, selected.shift, selected.vkey);
    // Block: empty label + output = error.
    if (labelDraft.trim() === "" && key?.chars) {
      setError(
        t({
          id: "editor.assignLoop.osk.emptyLabelError",
          message:
            "A key with output cannot have an empty label. Enter a display character.",
        }),
      );
      return;
    }
    commit(withLabel(effectiveKvks, selected.shift, selected.vkey, labelDraft));
  };

  const handleBlankKey = () => {
    if (!selected) return;
    const key = findKey(effectiveKvks, selected.shift, selected.vkey);
    // Block: cannot blank a key with output (Matthew's ruling).
    if (key?.chars) {
      setError(
        t({
          id: "editor.assignLoop.osk.blankBlockedError",
          message: "Cannot blank this key — it has output. Change the label instead.",
        }),
      );
      return;
    }
    commit(withLabel(effectiveKvks, selected.shift, selected.vkey, ""));
    setLabelDraft("");
  };

  const handleResetKey = () => {
    if (!selected || !baseKvks) return;
    const baseKey = findKey(baseKvks, selected.shift, selected.vkey);
    if (!baseKey) return;
    commit(
      withLabel(effectiveKvks, selected.shift, selected.vkey, baseKey.label),
    );
    setLabelDraft(baseKey.label);
  };

  const handleToggleDisplayUnderlying = (checked: boolean) => {
    commit({ ...effectiveKvks, displayUnderlying: checked });
  };

  const handleToggle102 = (checked: boolean) => {
    commit({ ...effectiveKvks, key102: checked });
  };

  const selectedKey = selected
    ? findKey(effectiveKvks, selected.shift, selected.vkey)
    : undefined;

  const rows: Array<Array<{ vkey: string; label: string; x: number; width: number }>> = [
    [],
    [],
    [],
    [],
  ];
  if (activeLayer) {
    for (const k of activeLayer.keys) {
      const g = geomById.get(k.vkey);
      if (!g) continue;
      const row = rows[g.row];
      if (row) row.push({ vkey: k.vkey, label: k.label, x: g.x, width: g.width });
    }
    for (const r of rows) r.sort((a, b) => a.x - b.x);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 24,
        height: "100%",
        overflowY: "auto",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 20, color: TEXT_MAIN }}>
        {t({ id: "editor.assignLoop.osk.title", message: "OnScreen Keyboard Label Editors" })}
      </h1>
      <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>
        {t({
          id: "editor.assignLoop.osk.description",
          message:
            "Customize the visual keyboard: click a key to change its label. Labels are free text and may differ from the key's output for clarity.",
        })}
      </p>

      {/* Visual / Code tabs */}
      <div style={{ display: "flex", gap: 8 }} role="tablist" aria-label={t({ id: "editor.assignLoop.osk.viewTabsLabel", message: "Editor view" })}>
        {(["visual", "code"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 6,
              border: `1px solid ${activeTab === tab ? ACCENT : BORDER}`,
              background: activeTab === tab ? ACCENT_BG : BG_CARD,
              color: TEXT_MAIN,
              cursor: "pointer",
            }}
          >
            {tab === "visual"
              ? t({ id: "editor.assignLoop.osk.tabVisual", message: "Visual" })
              : t({ id: "editor.assignLoop.osk.tabCode", message: "Code" })}
          </button>
        ))}
      </div>

      {activeTab === "code" ? (
        <div style={{ flex: 1, minHeight: 300, display: "flex", flexDirection: "column" }}>
          <Suspense fallback={<div style={{ padding: 24, color: TEXT_DIM }}>{t({ id: "editor.assignLoop.osk.code.loading", message: "Loading code editor…" })}</div>}>
            <OskCodePane kvks={effectiveKvks} onApply={commit} />
          </Suspense>
        </div>
      ) : (
      <>
      {/* Layer switcher */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="tablist" aria-label={t({ id: "editor.assignLoop.osk.layersLabel", message: "Keyboard layers" })}>
        {layers.map((l) => (
          <button
            key={l.shift}
            type="button"
            role="tab"
            aria-selected={l.shift === effectiveShift}
            onClick={() => {
              setActiveShift(l.shift);
              setSelected(null);
              setError(null);
            }}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 6,
              border: `1px solid ${l.shift === effectiveShift ? ACCENT : BORDER}`,
              background: l.shift === effectiveShift ? ACCENT_BG : BG_CARD,
              color: TEXT_MAIN,
              cursor: "pointer",
            }}
          >
            {shiftDisplayName(l.shift, i18n)}
          </button>
        ))}
      </div>

      {/* OSK canvas */}
      <div
        style={{
          background: BG_CANVAS,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: 16,
        }}
      >
        {rows.map((rowKeys, ri) => (
          <div key={ri} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
            {rowKeys.map(({ vkey, label, width }) => {
              const isSelected =
                selected?.vkey === vkey && selected?.shift === effectiveShift;
              const isBlank = label === "";
              return (
                <button
                  key={vkey}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={
                    isBlank
                      ? i18n._("editor.assignLoop.osk.keyAriaLabelBlank", { vkey })
                      : i18n._("editor.assignLoop.osk.keyAriaLabelLabeled", { vkey, label })
                  }
                  onClick={() => handleSelectKey(vkey)}
                  style={{
                    flex: `${width} 1 0`,
                    minWidth: 0,
                    minHeight: 48,
                    padding: "8px 4px",
                    fontSize: 16,
                    color: isBlank ? TEXT_DIM : TEXT_MAIN,
                    background: isSelected ? ACCENT_BG : BG_CARD,
                    border: isBlank
                      ? `2px dashed ${isSelected ? ACCENT : BORDER}`
                      : `2px solid ${isSelected ? ACCENT : BORDER}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isBlank ? "" : label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Selected key panel */}
      {selected && selectedKey && (
        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: 16,
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: 15, color: TEXT_MAIN }}>
            {i18n._("editor.assignLoop.osk.selectedKeyTitle", { vkey: selected.vkey })}
          </h2>
          {selectedKey.chars && (
            <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 8 }}>
              {i18n._("editor.assignLoop.osk.outputLabel", { chars: selectedKey.chars })}
            </div>
          )}
          <label
            style={{
              display: "block",
              fontSize: 13,
              color: TEXT_MAIN,
              marginBottom: 4,
            }}
          >
            {t({ id: "editor.assignLoop.osk.displayLabel", message: "Display label" })}
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => handleLabelChange(e.target.value)}
              style={{
                display: "block",
                width: "100%",
                maxWidth: 300,
                marginTop: 4,
                padding: "8px 10px",
                fontSize: 14,
                color: TEXT_MAIN,
                background: BG_CANVAS,
                border: `1px solid ${error ? DANGER : BORDER}`,
                borderRadius: 6,
              }}
            />
          </label>
          {error && (
            <div
              role="alert"
              style={{
                marginTop: 8,
                padding: "8px 12px",
                fontSize: 13,
                color: DANGER,
                background: DANGER_BG,
                border: `1px solid ${DANGER}`,
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleApplyLabel}
              disabled={error !== null}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                borderRadius: 6,
                border: `1px solid ${ACCENT}`,
                background: ACCENT_BG,
                color: TEXT_MAIN,
                cursor: error ? "not-allowed" : "pointer",
                opacity: error ? 0.5 : 1,
              }}
            >
              {t({ id: "editor.assignLoop.osk.applyLabel", message: "Apply label" })}
            </button>
            <button
              type="button"
              onClick={handleBlankKey}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                background: BG_CARD,
                color: TEXT_MAIN,
                cursor: "pointer",
              }}
            >
              {t({ id: "editor.assignLoop.osk.blankKey", message: "Blank key" })}
            </button>
            <button
              type="button"
              onClick={handleResetKey}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                background: BG_CARD,
                color: TEXT_DIM,
                cursor: "pointer",
              }}
            >
              {t({ id: "editor.assignLoop.osk.resetKey", message: "Reset" })}
            </button>
          </div>
        </div>
      )}

      {/* Toggles */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: TEXT_MAIN,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={effectiveKvks.displayUnderlying ?? false}
            onChange={(e) => handleToggleDisplayUnderlying(e.target.checked)}
          />
          {t({ id: "editor.assignLoop.osk.displayUnderlying", message: "Display underlying characters" })}
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: TEXT_MAIN,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={effectiveKvks.key102 ?? false}
            onChange={(e) => handleToggle102(e.target.checked)}
          />
          {t({ id: "editor.assignLoop.osk.include102", message: "Include 102nd key (ISO)" })}
        </label>
      </div>
      </>
      )}
    </div>
  );
}
