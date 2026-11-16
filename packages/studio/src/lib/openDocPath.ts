// openDocPath -- where a documentation page's file lives in an opened keyboard (pure; no store reads).
// The one path source for the editor seed, the preview, the apply and the help-gap check.

import type { WelcomeConvention } from "@keyboard-studio/contracts";
import { docMemberPath, type EditableDocMember } from "./authoredDocs.ts";
import { FLAT_WELCOME_PATH, WELCOME_PAGE_PATH } from "./welcomeFolder.ts";

/**
 * The file a page lives at in the opened keyboard: the welcome page at the folder
 * path or the flat one, whichever the file has (the convention says where a page
 * that is not there yet is created).
 */
export function openDocPath(
  member: EditableDocMember,
  keyboardId: string,
  startVfs: { get(path: string): unknown } | null | undefined,
  convention: WelcomeConvention | null,
): string {
  if (member !== "welcome-htm") return docMemberPath(member, keyboardId);
  if (startVfs?.get(WELCOME_PAGE_PATH) !== undefined) return WELCOME_PAGE_PATH;
  if (startVfs?.get(FLAT_WELCOME_PATH) !== undefined) return FLAT_WELCOME_PATH;
  return convention === "flat" ? FLAT_WELCOME_PATH : WELCOME_PAGE_PATH;
}

