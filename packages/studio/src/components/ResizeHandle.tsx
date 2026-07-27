// ResizeHandle — shared drag-handle divider used by PreviewScreen and OutputScreen.
// Renders the vertical separator div with hover highlighting and pointer-capture
// for resizing the two-pane layout. Hover state is local (purely visual).

import { useState } from "react";
import { useLingui } from "@lingui/react/macro";

interface ResizeHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function ResizeHandle({ onPointerDown }: ResizeHandleProps) {
  const { t } = useLingui();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="separator"
      aria-label={t({ id: "resizeHandle.ariaLabel", message: "Resize panes" })}
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
