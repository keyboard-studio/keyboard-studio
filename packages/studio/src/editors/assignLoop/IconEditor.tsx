/**
 * IconEditor — keyboard icon editor step (after Documentation, before Package).
 *
 * A modern reimagining of TIKE's bitmap editor (not a port). Three options,
 * chosen up front — Keep is the default when the template has an icon:
 * - Keep icon: the template's `.ico` passes through byte-for-byte
 * - Edit source icon: the template's icon loaded into the pixel editor
 * - Create icon: a blank white canvas to draw on
 * The editor itself is a big pixel editor at 48×48 — the largest size an
 * .ico entry ever needs — shown large with hard pixels (what you draw is
 * what ships). Import-first for Edit/Create: drag-drop or pick SVG/PNG/ICO
 * (SVG <text> rasterizes as-is, per Matthew's ruling).
 * - Pixel editing with pen, eraser, line, fill, box, circle
 * - Text tool with a low-res-friendly monospace font (crisp at 16×16)
 * - Live multi-size preview (16 / 32 / 48 px)
 * - 1-bit transparency via the alpha channel + AND mask on ICO encode
 *
 * Matthew's rulings (2026-11-03, revised 2026-11-06):
 * - Unskippable step; three options, Keep the default when a source icon
 *   exists; the editor works at 48px — no high-res working canvas, just
 *   big pixels
 * - Hand-rolled ICO codec (icoCodec.ts), no new dependencies
 *
 * On Continue: passes { iconIcoBase64, iconPngDataUrl } via onComplete.
 * Keep passes the source bytes through; Edit/Create encode the working
 * canvas at 16 / 32 / 48. The output pipeline writes the .ico file into
 * the package.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import {
  decodeIco,
  encodeIco,
  icoToBase64,
  rasterizeImage,
  resample,
  type DecodedIconImage,
} from "./icoCodec.ts";
import {
  ICON_PALETTE,
  ICON_SIZE,
  type PixelBuffer,
  createBlankIcon,
  drawCircle,
  drawLine,
  drawRect,
  drawText,
  floodFill,
  getPixel,
  setPixel,
  type Rgba,
  type ToolId,
} from "./iconTools.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PREVIEW_SIZES = [16, 32, 48];

function clonePixels(px: PixelBuffer): PixelBuffer {
  return new Uint8ClampedArray(px);
}

function rgbaToCss(c: Rgba): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(2)})`;
}

const TOOL_IDS: ToolId[] = [
  "pen",
  "eraser",
  "line",
  "fill",
  "box",
  "boxFill",
  "circle",
  "circleFill",
  "text",
  "picker",
];

/** The three options: keep, edit, or create. */
type IconMode = "keep" | "edit" | "create";

/** A usable source icon: original bytes + largest entry at 48×48. */
type SourceIcon = {
  bytes: Uint8Array;
  pixels48: PixelBuffer;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToolButton({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "6px 10px",
        fontSize: 13,
        borderRadius: 6,
        border: active
          ? "2px solid var(--app-accent)"
          : "1px solid var(--app-border)",
        background: active ? "var(--app-accent-bg)" : "var(--app-surface)",
        color: "var(--app-text)",
        cursor: "pointer",
        minWidth: 44,
      }}
    >
      {label}
    </button>
  );
}

/** Small canvas showing the icon at a target size (pixelated = honest). */
function SizePreview({
  pixels,
  size,
  label,
}: {
  pixels: PixelBuffer;
  size: number;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const src = document.createElement("canvas");
    src.width = ICON_SIZE;
    src.height = ICON_SIZE;
    const sctx = src.getContext("2d");
    if (!sctx) return;
    sctx.putImageData(new ImageData(pixels, ICON_SIZE, ICON_SIZE), 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(src, 0, 0, size, size);
  }, [pixels, size]);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        style={{
          width: size,
          height: size,
          border: "1px solid var(--app-border)",
          borderRadius: 4,
          background:
            "repeating-conic-gradient(var(--app-surface) 0% 25%, var(--app-backdrop) 0% 50%) 0 0 / 16px 16px",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={ref}
          width={size}
          height={size}
          style={{ width: size, height: size, display: "block" }}
        />
      </div>
      <span style={{ fontSize: 11, color: "var(--app-text-muted)" }}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function IconEditor({ onComplete, onBack }: EditorStepProps) {
  const { t } = useLingui();
  const startVfs = useWorkingCopyStore((s) => s.startVfs);

  // The three options — Keep is the default when the template has an icon.
  // The source icon is found on mount; until then the step shows loading.
  const [sourceIcon, setSourceIcon] = useState<SourceIcon | null>(null);
  const [sourceChecked, setSourceChecked] = useState(false);
  const [mode, setMode] = useState<IconMode>("create");
  const [pixels, setPixels] = useState<PixelBuffer>(() => createBlankIcon());
  const [tool, setTool] = useState<ToolId>("pen");
  const [color, setColor] = useState<Rgba>([0, 0, 0, 255]);
  const [textSize, setTextSize] = useState(8);
  // Undo history kept as one atomic state (stack + index move together).
  const [history, setHistory] = useState<{
    stack: PixelBuffer[];
    index: number;
  }>(() => ({ stack: [createBlankIcon()], index: 0 }));
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragSnapshot, setDragSnapshot] = useState<PixelBuffer | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState<string | null>(null);
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Focus the text input when the placement overlay opens.
  useEffect(() => {
    if (textDraft !== null) textInputRef.current?.focus();
  }, [textDraft]);

  // -- Paint the working buffer to the display canvas -----------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.putImageData(new ImageData(pixels, ICON_SIZE, ICON_SIZE), 0, 0);
  }, [pixels]);

  // -- Find the template's icon (decides which options exist) --------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let found: SourceIcon | null = null;
      if (startVfs) {
        try {
          const icoPaths = startVfs
            .list()
            .filter((p) => p.toLowerCase().endsWith(".ico"));
          for (const p of icoPaths) {
            const entry = startVfs.get(p);
            if (!entry || typeof entry.content === "string") continue;
            try {
              const decoded = await decodeIco(entry.content);
              found = {
                bytes: entry.content,
                pixels48: resample(decoded, ICON_SIZE, ICON_SIZE),
              };
              break;
            } catch {
              // Try the next .ico file.
            }
          }
        } catch {
          // No usable source icon — only Create is offered.
        }
      }
      if (cancelled) return;
      setSourceIcon(found);
      setSourceChecked(true);
      if (found) {
        setMode("keep");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushHistory = useCallback((px: PixelBuffer) => {
    setHistory((h) => {
      const next = h.stack.slice(0, h.index + 1);
      next.push(clonePixels(px));
      // Cap history at 30 snapshots (~270KB worst case at 48×48).
      const trimmed =
        next.length > 30 ? next.slice(next.length - 30) : next;
      return { stack: trimmed, index: trimmed.length - 1 };
    });
  }, []);

  const undo = () => {
    if (history.index <= 0) return;
    const next = history.index - 1;
    const entry = history.stack[next];
    if (!entry) return;
    setHistory({ stack: history.stack, index: next });
    setPixels(clonePixels(entry));
  };

  const canUndo = history.index > 0;

  const applyPixels = useCallback(
    (next: PixelBuffer) => {
      setPixels(next);
      pushHistory(next);
    },
    [pushHistory],
  );

  // -- Option switching ------------------------------------------------------
  // Each option starts from its own canvas; switching resets the canvas
  // (and its undo history) to that option's start.
  const selectMode = (next: IconMode) => {
    setMode(next);
    if (next === "edit" && sourceIcon) {
      const start = clonePixels(sourceIcon.pixels48);
      setPixels(start);
      setHistory({ stack: [clonePixels(start)], index: 0 });
    } else if (next === "create") {
      const start = createBlankIcon();
      setPixels(start);
      setHistory({ stack: [clonePixels(start)], index: 0 });
    }
  };

  // -- Pointer handling ------------------------------------------------------
  const toPixel = (e: React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - rect.left) / rect.width) * ICON_SIZE),
      y: Math.floor(((e.clientY - rect.top) / rect.height) * ICON_SIZE),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = toPixel(e);

    if (tool === "picker") {
      setColor(getPixel(pixels, x, y));
      return;
    }
    if (tool === "fill") {
      const next = clonePixels(pixels);
      floodFill(next, x, y, color);
      applyPixels(next);
      return;
    }
    if (tool === "text") {
      setTextPos({ x, y });
      setTextDraft("");
      return;
    }
    // Drag tools: pen, eraser, line, box, boxFill, circle, circleFill.
    setDragging(true);
    setDragStart({ x, y });
    setDragSnapshot(clonePixels(pixels));
    if (tool === "pen" || tool === "eraser") {
      const next = clonePixels(pixels);
      setPixel(next, x, y, tool === "eraser" ? [0, 0, 0, 0] : color);
      setPixels(next);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragStart || !dragSnapshot) return;
    const { x, y } = toPixel(e);
    const c = tool === "eraser" ? ([0, 0, 0, 0] as Rgba) : color;

    if (tool === "pen" || tool === "eraser") {
      const next = clonePixels(pixels);
      drawLine(next, dragStart.x, dragStart.y, x, y, c);
      setPixels(next);
      setDragStart({ x, y });
      return;
    }
    // Shape preview: restore snapshot, draw shape from dragStart to cursor.
    const next = clonePixels(dragSnapshot);
    if (tool === "line") {
      drawLine(next, dragStart.x, dragStart.y, x, y, c);
    } else if (tool === "box" || tool === "boxFill") {
      drawRect(next, dragStart.x, dragStart.y, x, y, c, tool === "boxFill");
    } else if (tool === "circle" || tool === "circleFill") {
      const r = Math.hypot(x - dragStart.x, y - dragStart.y);
      drawCircle(next, dragStart.x, dragStart.y, r, c, tool === "circleFill");
    }
    setPixels(next);
  };

  const handlePointerUp = () => {
    if (dragging) {
      // Commit the drag as one undo step.
      pushHistory(pixels);
    }
    setDragging(false);
    setDragStart(null);
    setDragSnapshot(null);
  };

  const commitText = () => {
    if (textPos === null || !textDraft) {
      setTextDraft(null);
      setTextPos(null);
      return;
    }
    const next = clonePixels(pixels);
    drawText(next, textDraft, textPos.x, textPos.y, color, textSize);
    applyPixels(next);
    setTextDraft(null);
    setTextPos(null);
  };

  // -- Import ----------------------------------------------------------------
  const handleImportFile = async (file: File) => {
    setImportError(null);
    try {
      const name = file.name.toLowerCase();
      let decoded: DecodedIconImage;
      if (name.endsWith(".ico")) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        decoded = await decodeIco(bytes);
      } else if (
        name.endsWith(".svg") ||
        name.endsWith(".png") ||
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".webp")
      ) {
        decoded = await rasterizeImage(file, ICON_SIZE);
      } else {
        throw new Error(
          t({
            id: "editor.assignLoop.icon.import.unsupported",
            message: "Unsupported file type — use SVG, PNG, or ICO.",
          }),
        );
      }
      const px =
        decoded.width === ICON_SIZE && decoded.height === ICON_SIZE
          ? decoded.pixels
          : resample(decoded, ICON_SIZE, ICON_SIZE);
      applyPixels(px);
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : t({
              id: "editor.assignLoop.icon.import.failed",
              message: "Could not read that image.",
            }),
      );
    }
  };

  const handleContinue = () => {
    if (mode === "keep" && sourceIcon) {
      // Keep: the template's .ico passes through byte-for-byte; the PNG
      // comes from the 48px preview pixels.
      const canvas = document.createElement("canvas");
      canvas.width = ICON_SIZE;
      canvas.height = ICON_SIZE;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.putImageData(
          new ImageData(sourceIcon.pixels48, ICON_SIZE, ICON_SIZE),
          0,
          0,
        );
      }
      onComplete({
        iconIcoBase64: icoToBase64(sourceIcon.bytes),
        iconPngDataUrl: canvas.toDataURL("image/png"),
      });
      return;
    }
    // Edit / Create: encode the working canvas at 16 / 32 / 48.
    const ico = encodeIco(
      { width: ICON_SIZE, height: ICON_SIZE, pixels },
      [16, 32, 48],
    );
    // 48px PNG data URL for easy preview/storage downstream.
    const canvas = document.createElement("canvas");
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.putImageData(new ImageData(pixels, ICON_SIZE, ICON_SIZE), 0, 0);
    }
    onComplete({
      iconIcoBase64: icoToBase64(ico),
      iconPngDataUrl: canvas.toDataURL("image/png"),
    });
  };

  // Footer nav (spec 081, #2527): Back / Continue publish to the footer
  // instead of rendering in the in-body bar. Test ids match the StudioShell
  // mock, so the tracks test keeps finding icon-continue in the footer.
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "editor.assignLoop.icon.back", message: "Back" }),
            onClick: onBack,
            testId: "icon-back",
          },
        }
      : {}),
    forward: {
      label: t({ id: "editor.assignLoop.icon.continue", message: "Continue" }),
      onClick: handleContinue,
      testId: "icon-continue",
    },
  });

  const toolLabel = (id: ToolId): string => {
    switch (id) {
      case "pen":
        return t({ id: "editor.assignLoop.icon.tool.pen", message: "Pen" });
      case "eraser":
        return t({ id: "editor.assignLoop.icon.tool.eraser", message: "Eraser" });
      case "line":
        return t({ id: "editor.assignLoop.icon.tool.line", message: "Line" });
      case "fill":
        return t({ id: "editor.assignLoop.icon.tool.fill", message: "Fill" });
      case "box":
        return t({ id: "editor.assignLoop.icon.tool.box", message: "Box" });
      case "boxFill":
        return t({
          id: "editor.assignLoop.icon.tool.boxFill",
          message: "Filled box",
        });
      case "circle":
        return t({ id: "editor.assignLoop.icon.tool.circle", message: "Circle" });
      case "circleFill":
        return t({
          id: "editor.assignLoop.icon.tool.circleFill",
          message: "Filled circle",
        });
      case "text":
        return t({ id: "editor.assignLoop.icon.tool.text", message: "Text" });
      case "picker":
        return t({ id: "editor.assignLoop.icon.tool.picker", message: "Picker" });
    }
  };

  // Until the template's icon is found (or not), the options can't be
  // chosen — show loading instead of the editor.
  if (!sourceChecked) {
    return (
      <div style={{ padding: 24, color: "var(--app-text-muted)", fontSize: 14 }}>
        {t({ id: "editor.assignLoop.icon.loading", message: "Loading icon…" })}
      </div>
    );
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
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) void handleImportFile(f);
      }}
    >
      <h1 style={{ margin: 0, fontSize: 20, color: "var(--app-text)" }}>
        {t({ id: "editor.assignLoop.icon.title", message: "Keyboard icon" })}
      </h1>
      <p style={{ margin: 0, fontSize: 13, color: "var(--app-text-muted)" }}>
        {sourceIcon
          ? t({
              id: "editor.assignLoop.icon.description",
              message:
                "Keep the template's icon, edit it pixel by pixel, or draw a new one from a blank white canvas — the preview shows how it looks at real sizes.",
            })
          : t({
              id: "editor.assignLoop.icon.descriptionNoSource",
              message:
                "Draw a new icon for your keyboard from a blank white canvas, pixel by pixel — the preview shows how it looks at real sizes.",
            })}
      </p>

      {/* The three options — Keep is the default when a source icon exists. */}
      <div
        role="group"
        aria-label={t({
          id: "editor.assignLoop.icon.modeGroup",
          message: "What to do with the icon",
        })}
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        {sourceIcon && (
          <ToolButton
            active={mode === "keep"}
            label={t({
              id: "editor.assignLoop.icon.mode.keep",
              message: "Keep icon",
            })}
            title={t({
              id: "editor.assignLoop.icon.mode.keep",
              message: "Keep icon",
            })}
            onClick={() => selectMode("keep")}
          />
        )}
        {sourceIcon && (
          <ToolButton
            active={mode === "edit"}
            label={t({
              id: "editor.assignLoop.icon.mode.edit",
              message: "Edit source icon",
            })}
            title={t({
              id: "editor.assignLoop.icon.mode.edit",
              message: "Edit source icon",
            })}
            onClick={() => selectMode("edit")}
          />
        )}
        <ToolButton
          active={mode === "create"}
          label={t({
            id: "editor.assignLoop.icon.mode.create",
            message: "Create icon",
          })}
          title={t({
            id: "editor.assignLoop.icon.mode.create",
            message: "Create icon",
          })}
          onClick={() => selectMode("create")}
        />
      </div>

      {mode === "keep" && sourceIcon ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--app-text-muted)" }}>
            {t({
              id: "editor.assignLoop.icon.keepNote",
              message: "The template's icon will be kept unchanged.",
            })}
          </p>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
            {PREVIEW_SIZES.map((s) => (
              <SizePreview
                key={s}
                pixels={sourceIcon.pixels48}
                size={s}
                label={`${s}×${s}`}
              />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {/* Editor column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Toolbar */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TOOL_IDS.map((id) => (
              <ToolButton
                key={id}
                active={tool === id}
                label={toolLabel(id)}
                title={toolLabel(id)}
                onClick={() => setTool(id)}
              />
            ))}
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              title={t({ id: "editor.assignLoop.icon.undo", message: "Undo" })}
              style={{
                padding: "6px 10px",
                fontSize: 13,
                borderRadius: 6,
                border: "1px solid var(--app-border)",
                background: "var(--app-surface)",
                color: "var(--app-text)",
                cursor: canUndo ? "pointer" : "default",
                opacity: canUndo ? 1 : 0.4,
              }}
            >
              {t({ id: "editor.assignLoop.icon.undo", message: "Undo" })}
            </button>
          </div>

          {/* Text size (only for text tool) */}
          {tool === "text" && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--app-text)",
              }}
            >
              {t({
                id: "editor.assignLoop.icon.textSize",
                message: "Text size",
              })}
              <input
                type="range"
                min={5}
                max={16}
                step={1}
                value={textSize}
                onChange={(e) => setTextSize(Number(e.target.value))}
              />
              <span>{textSize}px</span>
            </label>
          )}

          {/* Canvas: 48 working pixels shown 10×, so each pixel is big. */}
          <div
            style={{
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              background:
                "repeating-conic-gradient(var(--app-surface) 0% 25%, var(--app-backdrop) 0% 50%) 0 0 / 32px 32px",
              width: 480,
              height: 480,
              touchAction: "none",
              cursor: "crosshair",
              position: "relative",
            }}
          >
            <canvas
              ref={canvasRef}
              width={ICON_SIZE}
              height={ICON_SIZE}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{
                width: 480,
                height: 480,
                display: "block",
                imageRendering: "pixelated",
              }}
            />
            {/* Text placement overlay */}
            {textDraft !== null && textPos !== null && (
              <div
                style={{
                  position: "absolute",
                  left: textPos.x * 10,
                  top: textPos.y * 10,
                  background: "var(--app-surface)",
                  border: "1px solid var(--app-accent)",
                  borderRadius: 6,
                  padding: 8,
                  display: "flex",
                  gap: 8,
                  zIndex: 2,
                }}
              >
                <input
                  ref={textInputRef}
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitText();
                    if (e.key === "Escape") {
                      setTextDraft(null);
                      setTextPos(null);
                    }
                  }}
                  placeholder={t({
                    id: "editor.assignLoop.icon.textPlaceholder",
                    message: "Type text…",
                  })}
                  style={{
                    fontSize: 14,
                    padding: "6px 8px",
                    borderRadius: 4,
                    border: "1px solid var(--app-border)",
                    background: "var(--app-backdrop)",
                    color: "var(--app-text)",
                  }}
                />
                <button
                  type="button"
                  onClick={commitText}
                  style={{
                    padding: "6px 12px",
                    fontSize: 13,
                    borderRadius: 4,
                    border: "1px solid var(--app-accent)",
                    background: "var(--app-accent-bg)",
                    color: "var(--app-text)",
                    cursor: "pointer",
                  }}
                >
                  {t({ id: "editor.assignLoop.icon.textOk", message: "OK" })}
                </button>
              </div>
            )}
          </div>

          {/* Palette */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxWidth: 480 }}>
            {ICON_PALETTE.map((entry) => (
              <button
                key={entry.name}
                type="button"
                title={entry.name}
                aria-pressed={
                  color[0] === entry.rgba[0] &&
                  color[1] === entry.rgba[1] &&
                  color[2] === entry.rgba[2] &&
                  color[3] === entry.rgba[3]
                }
                onClick={() => setColor(entry.rgba)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border:
                    color[0] === entry.rgba[0] &&
                    color[1] === entry.rgba[1] &&
                    color[2] === entry.rgba[2] &&
                    color[3] === entry.rgba[3]
                      ? "2px solid var(--app-accent)"
                      : "1px solid var(--app-border)",
                  background:
                    entry.rgba[3] === 0
                      ? "repeating-conic-gradient(var(--app-surface) 0% 25%, var(--app-backdrop) 0% 50%) 0 0 / 12px 12px"
                      : rgbaToCss(entry.rgba),
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        {/* Side column: import + previews */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 220 }}
        >
          <div>
            <h2
              style={{
                margin: "0 0 8px",
                fontSize: 14,
                color: "var(--app-text)",
              }}
            >
              {t({ id: "editor.assignLoop.icon.importTitle", message: "Import" })}
            </h2>
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 12,
                color: "var(--app-text-muted)",
              }}
            >
              {t({
                id: "editor.assignLoop.icon.importHint",
                message: "Drop an SVG, PNG, or ICO file anywhere here, or",
              })}{" "}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--app-accent)",
                  cursor: "pointer",
                  fontSize: 12,
                  textDecoration: "underline",
                }}
              >
                {t({
                  id: "editor.assignLoop.icon.importBrowse",
                  message: "browse",
                })}
              </button>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".svg,.png,.ico,.jpg,.jpeg,.webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportFile(f);
                e.target.value = "";
              }}
            />
            {importError && (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--app-danger)" }}>
                {importError}
              </p>
            )}
          </div>

          <div>
            <h2
              style={{
                margin: "0 0 8px",
                fontSize: 14,
                color: "var(--app-text)",
              }}
            >
              {t({ id: "editor.assignLoop.icon.previewTitle", message: "Preview" })}
            </h2>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
              {PREVIEW_SIZES.map((s) => (
                <SizePreview
                  key={s}
                  pixels={pixels}
                  size={s}
                  label={`${s}×${s}`}
                />
              ))}
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
