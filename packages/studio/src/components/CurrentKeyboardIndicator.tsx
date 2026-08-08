// CurrentKeyboardIndicator — top-bar affordance that (a) always names the
// keyboard currently being worked on and (b) drops down to switch to another
// of the author's keyboards. Motivating request: "we need to improve the
// distinction between keyboards and clarity about which keyboard is being
// worked."
//
// TWO SOURCES, ON PURPOSE, NOT A THIRD.
//
// The current keyboard's NAME comes from `deriveProjectLabel`
// (lib/projectLabel.ts, FR-041) — the ONE label precedence, read off the same
// live stores `StudioFooter.tsx` already reads. Adding a second live-store
// derivation here (rather than reusing that one) is exactly what
// projectLabel.ts's header forbids.
//
// The DROPDOWN CONTENTS — the author's OTHER keyboards to switch to — come
// from `listDrafts()` (lib/draftPersistence.ts), the same "My keyboards"
// index `MyKeyboardsList.tsx` reads, filtered to resumable (non-`submitted`)
// rows, plus a fixed row that hands off to `#profile` ("Manage all
// keyboards…"). A `submitted` project has no resume path, so it is reached
// via the profile page rather than shown as a dead option here.
//
// TWO RIVAL ACTIVE-PROJECT POINTERS (OUT OF SCOPE TO UNIFY).
//
// This codebase has TWO active-project pointers that can disagree:
// `ks.draft.active` (lib/draftPersistence.ts) and `ks.studio.activeProject`
// (lib/draftAutosave.ts, the one StudioShell.tsx imports). This component
// never reads either pointer to decide "what is current" — it derives the
// current project's KEY the same way draftPersistence.ts's own `saveDraft`
// caller does, straight off the live working-copy store
// (`deriveProjectKeyFromWorkingCopy({ identity, baseKeyboard })`), so it can
// never disagree with its own displayed name. WHEN THE AUTHOR SWITCHES
// PROJECTS via this control's dropdown, `handleChange` goes through the
// shared `switchActiveProject()` helper (lib/switchActiveProject.ts), which
// re-pins BOTH pointers to the newly-resumed project (FINDING 4 fix) — but
// this component still never READS either pointer itself, and the two
// engines otherwise remain genuinely un-unified; that unification stays
// explicitly out of scope (see the report this component shipped with).
//
// STALENESS.
//
// `listDrafts()` is a plain localStorage snapshot — no store, no `storage`
// listener (see its own docstring in draftPersistence.ts). This component
// re-reads it on mount and on every `hashchange` (the same idiom
// `StudioShell.tsx`'s own `useRoute()` uses) — cheap, and it covers the
// common "switched away, renamed/saved something, came back" path. It does
// NOT cover a change made in another tab, or made in THIS tab without a hash
// change, until the next `hashchange` fires. The CURRENT keyboard's own
// displayed name carries none of this staleness: it is a live store
// subscription, so a rename is reflected on the very next render, well
// inside the 300 ms validator cycle.
//
// RENDER CONTRACT.
//
// This control is present for the WHOLE survey, including the part of Phase A
// that runs before a base keyboard exists — that is the point of it: an author
// mid-wizard needs to see which keyboard they are working on and be able to
// switch away, and the questions that come before base selection are the ones
// where "which keyboard is this?" is least obvious.
//
// So it does NOT take `StudioFooter.tsx`'s FR-040 gate ("no project, no row").
// The footer names a project's PROGRESS, which genuinely does not exist yet;
// this control is a persistent switcher whose current-value slot happens to be
// empty until the project is named. When `deriveProjectLabel` returns `null`
// the trigger shows `nav.currentKeyboard.none` and the dropdown still offers
// every other keyboard plus "Manage all keyboards…" — an author who opened the
// wizard by mistake can leave through it, which a hidden control cannot do.
//
// The caller is still expected to gate on `active !== "welcome"`, matching
// every other NavBar control (`AccountControl`, `UnfinishedGalleryIndicator`):
// the welcome screen is where you CHOOSE a keyboard, so a switcher there would
// duplicate the screen's own job.

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { deriveProjectLabel } from "../lib/projectLabel.ts";
import {
  listDrafts,
  deriveProjectKeyFromWorkingCopy,
  type ProjectIndexEntry,
} from "../lib/draftPersistence.ts";
import { navigateTo } from "../lib/navigate.ts";
import { switchActiveProject } from "../lib/switchActiveProject.ts";
import { SelectMenu, type SelectMenuOption } from "../ui/SelectMenu.tsx";

const LABEL_ID = "nav-current-keyboard-label";

/**
 * Sentinel option value for the fixed "Manage all keyboards…" row. Never a
 * real project key: draftPersistence.ts's keys come off
 * `identity.keyboardId` / `baseKeyboard.id`, both non-empty author/base
 * identifiers, so this token cannot collide with one.
 */
const MANAGE_ALL_VALUE = "__manage-all__";

/**
 * Fallback key for the (in practice unreachable) case where a current label
 * exists but `deriveProjectKeyFromWorkingCopy` returns null — see the
 * `currentProjectKey` comment below. Kept distinct from `MANAGE_ALL_VALUE` so
 * the two sentinels can never be confused if both somehow appeared together.
 */
const UNKEYED_CURRENT_VALUE = "__current-unkeyed__";

/**
 * Caps the visible label so this control plus the four other NavBar right-
 * group controls (and the tab row it now sits beside — see the insertion
 * diff) never wrap or overflow NavBar's hard `height: 48`. Same "cap +
 * ellipsis" convention as `StudioFooter.tsx`'s project-label span, sized for
 * a compact NavBar slot rather than a full-width footer.
 */
const MAX_LABEL_WIDTH = 180;

/**
 * Ellipsizes a (possibly long) keyboard name to `MAX_LABEL_WIDTH`, with the
 * full name available as a tooltip (`title`). Used for BOTH the trigger's
 * current-value display and every open-list row via `renderOptionLabel`, so
 * a long name never blows out either the collapsed control or the popup.
 */
function truncatedLabel(text: string): ReactNode {
  return (
    <span
      title={text}
      style={{
        display: "inline-block",
        maxWidth: MAX_LABEL_WIDTH,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        verticalAlign: "bottom",
      }}
    >
      {text}
    </span>
  );
}

export function CurrentKeyboardIndicator() {
  const { t } = useLingui();

  // ---------------------------------------------------------------------------
  // The current keyboard — live stores, the ONE label precedence (FR-041).
  // Same three selectors StudioFooter.tsx reads, for the same reason: a
  // rename must show up immediately, not after the next `listDrafts()`
  // snapshot.
  // ---------------------------------------------------------------------------
  const scaffoldSpec = useSurveySessionStore((s) => s.scaffoldSpec);
  const identity = useWorkingCopyStore((s) => s.identity);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);

  const currentLabel = useMemo(
    () => deriveProjectLabel({ scaffoldSpec, identity, baseKeyboard }),
    [scaffoldSpec, identity, baseKeyboard],
  );

  // In practice non-null whenever `currentLabel` is non-null: Track 1's
  // `project_name` step (the FIRST tier of FR-041's precedence) runs AFTER
  // base selection, and Track 2 sets `identity.keyboardId` at instantiation —
  // before either tier can be non-blank there is always a `baseKeyboard`,
  // hence always a key. The `UNKEYED_CURRENT_VALUE` fallback exists only so
  // this can never hand `SelectMenu` a `value` matching zero options, not
  // because this path is expected to be exercised.
  const currentProjectKey = useMemo(
    () => deriveProjectKeyFromWorkingCopy({ identity, baseKeyboard }) ?? UNKEYED_CURRENT_VALUE,
    [identity, baseKeyboard],
  );

  // ---------------------------------------------------------------------------
  // The switch-to list — the "My keyboards" index. See the module header for
  // the staleness window this snapshot carries.
  // ---------------------------------------------------------------------------
  const [entries, setEntries] = useState<ProjectIndexEntry[]>(() => listDrafts());

  const refresh = useCallback((): void => {
    setEntries(listDrafts());
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("hashchange", refresh);
    return () => window.removeEventListener("hashchange", refresh);
  }, [refresh]);

  const untitledLabel = t({ id: "profile.myKeyboards.untitled", message: "Untitled keyboard" });
  const manageAllLabel = t({
    id: "nav.currentKeyboard.manageAll",
    message: "Manage all keyboards…",
  });
  // Distinct from `untitledLabel` on purpose: "Untitled keyboard" describes a
  // keyboard that exists and has no name (a real index row can be in that
  // state), whereas this is the pre-instantiation slot — there is no keyboard
  // yet at all.
  const noKeyboardLabel = t({ id: "nav.currentKeyboard.none", message: "No keyboard yet" });

  const options: SelectMenuOption[] = useMemo(() => {
    const resumableOthers = entries
      .filter((entry) => entry.status !== "submitted" && entry.projectKey !== currentProjectKey)
      .map((entry) => ({
        value: entry.projectKey,
        label: entry.label ?? untitledLabel,
      }));
    return [
      // The CURRENT project's own row always uses the live label derived
      // above, never whatever `listDrafts()` last snapshotted for it — see
      // the module header's staleness note. Before a keyboard exists the slot
      // is named rather than dropped, so the trigger always has a value to
      // display (see RENDER CONTRACT).
      { value: currentProjectKey, label: currentLabel ?? noKeyboardLabel },
      ...resumableOthers,
      { value: MANAGE_ALL_VALUE, label: manageAllLabel },
    ];
  }, [entries, currentProjectKey, currentLabel, untitledLabel, noKeyboardLabel, manageAllLabel]);

  function handleChange(next: string): void {
    if (next === currentProjectKey) return; // no-op: already the current keyboard
    if (next === MANAGE_ALL_VALUE) {
      navigateTo("profile");
      return;
    }
    // Same shared primitive `MyKeyboardsList.tsx`'s `handleResume` uses
    // (lib/switchActiveProject.ts) — applies the draft, re-pins BOTH draft
    // engines' active-project pointers, and only navigates once that
    // actually happened. A corrupt/wrong-shaped record leaves the author
    // exactly where they were rather than dropping them into an empty
    // wizard.
    switchActiveProject(next);
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <span id={LABEL_ID}>
        <Trans id="nav.currentKeyboard.label">Keyboard</Trans>
      </span>
      <SelectMenu
        id="nav-current-keyboard-select"
        ariaLabelledby={LABEL_ID}
        value={currentProjectKey}
        onChange={handleChange}
        options={options}
        renderOptionLabel={(opt) => truncatedLabel(opt.label)}
        style={{ width: MAX_LABEL_WIDTH + 40 }}
        // onChange here resumes a different project and navigates — a real
        // side effect, not just picking a value (see SelectMenu.tsx's
        // commitMode doc comment). SelectMenu's default "onHighlight" mode
        // (selection-follows-focus) would resume/navigate on every single
        // ArrowDown/ArrowUp keypress before the user ever committed — opt
        // into "onExplicitSelect" so arrow keys only move the highlight and
        // the switch only happens on Enter/Space/click.
        commitMode="onExplicitSelect"
      />
    </span>
  );
}
