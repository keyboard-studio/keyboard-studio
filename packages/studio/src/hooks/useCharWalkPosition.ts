// useCharWalkPosition — bind a gallery's character walk to the shared
// within-step position model (see lib/stepWalk.ts).
//
// The two assignment-loop galleries (MechanismGallery — desktop/Phase C,
// TouchGallery — touch/Phase E) each walk a fixed character list one stop at a
// time, and each held its position in plain `useState`. Two consequences the
// author reported:
//
//   1. every tab switch unmounts the gallery, so the position was lost and the
//      walk restarted at the first (uncovered) character; and
//   2. the whole stage was ONE footer dot, so there was no way back into the
//      middle of it — the row could not say "you are on the eighth of twelve".
//
// This hook is the shared binding for both, extracted for the same reason
// `usePositionalCharNav` was: the two galleries must not drift on walk
// semantics, and a position model that behaved differently between desktop and
// touch would be worse than none.
//
// THREE JOBS, and the ordering between them is load-bearing:
//
//   PUBLISH POSITIONS — one stop per character, with `done` from the caller's own
//     coverage predicate. The gallery is the only thing that knows what "covered"
//     means for its surface, so it is passed in rather than re-derived.
//
//   PUBLISH THE CURSOR — whenever the gallery's own position changes, so the
//     footer's "you are here" marker tracks the walk during ordinary forward
//     navigation, not just after a jump.
//
//   APPLY AN EXTERNAL CURSOR — a footer dot activated for a character in the step
//     the author is ALREADY on changes no route and no step, so nothing remounts
//     and the gallery's own arrival read never re-runs. This effect is what makes
//     that jump land.
//
// The publish-cursor and apply-cursor effects could ping-pong; they do not,
// because publish sets the store to exactly the gallery's current position, after
// which apply finds them equal and stands down. The ARRIVAL position (first
// mount) is deliberately NOT this hook's job — the caller's own
// currentChar-sync effect resolves it via `cursorCharIn`, because that effect
// already owns "which character should this be" and a second writer racing it
// would be the drift this hook exists to prevent.

import { useEffect, useMemo } from "react";
import { useStepWalkStore } from "../stores/stepWalkStore.ts";
import {
  charToPositionToken,
  charWalkLabel,
  cursorCharIn,
  type StepWalkPositions,
} from "../lib/stepWalk.ts";

export interface UseCharWalkPositionOptions {
  /** Manifest step id this walk belongs to ("mechanisms" / "touch"). */
  stepId: string;
  /** The ordered character list the gallery walks — the SAME list it hands `usePositionalCharNav`. */
  list: readonly string[];
  /** Where the gallery is now, or null before its list has settled. */
  currentChar: string | null;
  /** The gallery's position setter. Called with a literal value, never an updater. */
  setCurrentChar: (char: string | null) => void;
  /**
   * Is this character settled on this surface? Whatever the gallery's own
   * coverage/configured notion is — a mechanism assigned, a touch key
   * configured. Called once per character per publish.
   */
  isDone: (char: string) => boolean;
}

export function useCharWalkPosition({
  stepId,
  list,
  currentChar,
  setCurrentChar,
  isDone,
}: UseCharWalkPositionOptions): void {
  const publishStepWalk = useStepWalkStore((s) => s.publishStepWalk);
  const setStepCursor = useStepWalkStore((s) => s.setStepCursor);
  const externalCursor = useStepWalkStore((s) => s.cursors[stepId]);

  // A stable primitive proxy for `list`, the same `join("\0")` idiom both
  // galleries already use for their own list-keyed effects — the array identity
  // changes on every render, the contents rarely do.
  const listKey = list.join("\0");

  const positions: StepWalkPositions = useMemo(
    () =>
      list.map((char) => ({
        id: charToPositionToken(char),
        label: charWalkLabel(char),
        done: isDone(char),
        // Every inventory character is required work (spec 061 A1: "all letters
        // have to be handled at some point"). Declared by the publisher, per
        // FR-007 — though note lib/outstandingWork.ts deliberately counts a
        // gallery's characters from the coverage gate rather than from this
        // walk, because the walk is session-scoped and absent after a reload
        // (FR-013). This flag is what makes the declaration honest at the
        // vocabulary level, not what the count is read from.
        required: true,
      })),
    // `isDone` closes over the gallery's live assignment state, so it must be a
    // dependency: a character becoming covered has to re-publish, or its dot
    // would never fill in. `listKey` stands in for `list` (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listKey, isDone],
  );

  useEffect(() => {
    publishStepWalk(stepId, positions);
  }, [stepId, positions, publishStepWalk]);

  useEffect(() => {
    if (currentChar === null) return;
    setStepCursor(stepId, charToPositionToken(currentChar));
  }, [stepId, currentChar, setStepCursor]);

  useEffect(() => {
    const requested = cursorCharIn(externalCursor, list);
    // Absent, not a character token, or naming a character this walk no longer
    // holds — nothing to honour. Already there is likewise nothing to do (and is
    // the common case, since the publish effect above keeps them in step).
    if (requested === null) return;
    if (currentChar !== null && requested.normalize("NFC") === currentChar.normalize("NFC")) return;
    setCurrentChar(requested);
    // Deliberately keyed on the cursor alone: re-running when `currentChar`
    // changes would fight the gallery's own Next/Back the moment the publish
    // effect above had not yet caught up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalCursor, listKey]);
}
