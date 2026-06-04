// Studio root — renders the live-preview shell. The two-pane survey/preview
// split lives inside <PreviewShell />. When the survey UI lands (#48), it
// replaces the picker-only left pane.

import { PreviewShell } from "./components/PreviewShell.tsx";

export function StudioShell() {
  return <PreviewShell />;
}
