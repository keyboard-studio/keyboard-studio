// useStartDocProfile — lazy, per-base-id cache of StartDocumentationProfile
// (spec 079 FR-008, contracts/studio-surfaces.md §1).
//
// The classifier is only ever asked about the FOCUSED/PREVIEWED base — never
// the whole gallery (see StartBrowserServiceWithDocProfile's own doc comment in
// the engine) — so this hook exposes a `request(startId)` action rather than
// eagerly resolving every base a caller might render. `request` is a no-op for
// an id that is already cached or already in flight, which is what makes
// re-focusing a previously-seen suggestion card free (no refetch).
//
// A component-local cache (not a store slice): the CONFIRMED base's profile is
// what workingCopyStore.startDocProfile carries forward (written by the caller
// via setStartDocProfile at selection) — this hook only serves the exploratory
// preview surface (suggestion cards) before that commitment happens.

import { useCallback, useEffect, useRef, useState } from "react";
import type { StartDocumentationProfile } from "@keyboard-studio/contracts";
import { getStartDocProfile } from "../lib/services.ts";

const UNKNOWN_PROFILE: StartDocumentationProfile = {
  level: "unknown",
  members: [],
  welcomeConvention: "absent",
  hasUsableDescription: false,
  welcomeImages: [],
};

export interface UseStartDocProfileResult {
  /** Every base id resolved so far, keyed by id. Missing key = not yet requested (or still in flight). */
  profiles: Readonly<Record<string, StartDocumentationProfile>>;
  /**
   * Ask for `startId`'s profile. Fires the (lazy, cached-in-the-engine) fetch
   * at most once per id for this hook instance; safe to call on every render
   * (e.g. from an effect keyed on the focused base) since it no-ops once a
   * result is cached or a fetch is already in flight.
   */
  request: (startId: string) => void;
}

/**
 * Component-scoped cache of {@link StartDocumentationProfile} by base id, fed by
 * `getStartDocProfile` (services.ts). See the module doc above for scope.
 */
export function useStartDocProfile(): UseStartDocProfileResult {
  const [profiles, setProfiles] = useState<Readonly<Record<string, StartDocumentationProfile>>>({});
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const inFlightRef = useRef<Set<string>>(new Set());
  // Guards a resolved fetch from writing into an unmounted component — a
  // focus change that outlives the component (rare, but a fast unmount while
  // the network round-trip is still pending is not impossible).
  const liveRef = useRef(true);
  useEffect(() => {
    return () => {
      liveRef.current = false;
    };
  }, []);

  const request = useCallback((startId: string) => {
    if (profilesRef.current[startId] !== undefined) return;
    if (inFlightRef.current.has(startId)) return;
    inFlightRef.current.add(startId);
    getStartDocProfile(startId).then(
      (profile) => {
        inFlightRef.current.delete(startId);
        if (!liveRef.current) return;
        setProfiles((prev) => ({ ...prev, [startId]: profile }));
      },
      () => {
        // getStartDocProfile is contracted to resolve to a "unknown" profile
        // rather than reject (see the engine's getDocProfile doc), but a
        // rejection is handled the same way defensively — cache "unknown" so
        // a transient failure does not retry on every re-render.
        inFlightRef.current.delete(startId);
        if (!liveRef.current) return;
        setProfiles((prev) => ({ ...prev, [startId]: UNKNOWN_PROFILE }));
      },
    );
  }, []);

  return { profiles, request };
}
