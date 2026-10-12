// Tests for MetadataCard's documentation-completeness badge (spec 080 FR-008,
// T035). The heading ("Selected keyboard") always renders; the badge is
// additive and only appears for a KNOWN level committed to the working copy
// for THIS card's base — "unknown" (or no profile at all) renders no badge.

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { StartKeyboard, StartDocumentationProfile } from "@keyboard-studio/contracts";
import { MetadataCard } from "./MetadataCard.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

const KB: StartKeyboard = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  script: "Latn",
  targets: ["windows"],
  displayName: "US English",
  version: "1.0",
};

const OTHER_KB: StartKeyboard = {
  id: "sil_euro_latin",
  path: "release/s/sil_euro_latin",
  script: "Latn",
  targets: ["windows"],
  displayName: "SIL Euro Latin",
  version: "1.0",
};

const MINIMAL_PROFILE: StartDocumentationProfile = {
  level: "minimal",
  members: ["welcome-htm"],
  welcomeConvention: "flat",
  hasUsableDescription: false,
  welcomeImages: [],
};

afterEach(() => {
  cleanup();
  useWorkingCopyStore.setState({ startKeyboard: null, startDocProfile: null });
});

describe("MetadataCard — documentation badge (spec 080 FR-008)", () => {
  it("renders no badge when the working copy has no doc profile committed", () => {
    render(<MetadataCard kb={KB} />);
    expect(screen.getByText("Selected keyboard")).toBeTruthy();
    expect(screen.queryByText(/documentation/i)).toBeNull();
  });

  it("renders no badge when the committed profile's level is 'unknown'", () => {
    useWorkingCopyStore.setState({
      startKeyboard: KB,
      startDocProfile: {
        level: "unknown",
        members: [],
        welcomeConvention: "absent",
        hasUsableDescription: false,
        welcomeImages: [],
      },
    });
    render(<MetadataCard kb={KB} />);
    expect(screen.queryByText(/documentation/i)).toBeNull();
  });

  it("renders the badge for a known level committed for THIS card's base", () => {
    useWorkingCopyStore.setState({ startKeyboard: KB, startDocProfile: MINIMAL_PROFILE });
    render(<MetadataCard kb={KB} />);
    expect(screen.getByText("Minimal documentation")).toBeTruthy();
  });

  it("does not attribute a committed profile to a DIFFERENT card's base", () => {
    // startDocProfile in the store belongs to KB (the confirmed base) — a card
    // rendering a different, not-yet-confirmed base must not show its badge.
    useWorkingCopyStore.setState({ startKeyboard: KB, startDocProfile: MINIMAL_PROFILE });
    render(<MetadataCard kb={OTHER_KB} />);
    expect(screen.queryByText(/documentation/i)).toBeNull();
  });
});
