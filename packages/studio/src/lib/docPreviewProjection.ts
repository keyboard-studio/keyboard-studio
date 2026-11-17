/**
 * How the Documentation step's preview gets the projected working copy.
 *
 * The step (HtmlEditor, rendered from the question registry's welcome-htm
 * renderer) cannot import `serializeWorkingCopy` itself: that module reaches
 * the decision-log store, which reaches the question registry, which reaches
 * the step again — a runtime cycle `depcruise` forbids. So the shell, which
 * already imports the projection, supplies it through this context. Anywhere
 * without a provider (tests, other hosts) the preview simply has no assets.
 */

import { createContext } from "react";
import type { VirtualFS } from "@keyboard-studio/contracts";

export type DocPreviewProjector = () => Promise<{ vfs: VirtualFS } | null>;

export const DocPreviewProjectionContext = createContext<DocPreviewProjector | null>(null);
