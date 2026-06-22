// ResizeHandle — shared drag-handle divider used by PreviewScreen and OutputScreen.
// Renders the vertical separator div with hover highlighting and pointer-capture
// for resizing the two-pane layout.

interface ResizeHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  hovered: boolean;
  onHoverChange: (hovered: boolean) => void;
}

export function ResizeHandle({ onPointerDown, hovered, onHoverChange }: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-label="Resize panes"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      style={{
        width: 6,
        flexShrink: 0,
        background: hovered ? "#3d5070" : "#283040",
        cursor: "col-resize",
        userSelect: "none",
        transition: "background 120ms ease",
      }}
    />
  );
}
