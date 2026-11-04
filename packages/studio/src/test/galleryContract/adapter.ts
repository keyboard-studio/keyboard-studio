// Adapter describing how a gallery (MechanismGallery / TouchGallery) is
// seeded, rendered and probed, so one contract suite can drive both.
//
// vi.mock is hoisted per test file and the two galleries need different mock
// sets, so the contract suites are FUNCTIONS (`describe*Contract(adapter)`)
// called from one thin entry file per gallery, each owning its own vi.mock
// block and lifecycle hooks. Adapters must not import ./mocks.tsx modules
// other than through the existing harness files.
//
// Test-support module: imported only by *.test.tsx entry files.

export interface GalleryAdapter {
  /** Prefix of every describe title, e.g. "MechanismGallery". */
  name: "MechanismGallery" | "TouchGallery";
  /** Step id under which the gallery publishes its within-step walk. */
  walkStepId: string;
  /** Seed any gallery-specific state BEFORE the bafut session is seeded. */
  prepareWalk(): void;
  /** Mount the gallery for the walk tests (intro already seen). */
  renderWalkGallery(): Promise<void>;
  /** The bafut base letters this gallery's own walk is expected to contain. */
  expectedBases: readonly string[];
  /** Extra gallery-specific assertion on the published walk (optional). */
  afterWalk?(walk: string[]): void;

  /** First-entry intro splash heading text. */
  introText: RegExp;
  /** Accessible name of the splash's start button. */
  startButton: RegExp;
  /** Seed a one-character inventory; leave the intro unseen when `intro`. */
  seedShell(o: { intro?: boolean }): void;
  /** Mount the gallery for the shell tests and flush its mount effects. */
  renderShell(): Promise<void>;
  /** True when the per-character gallery (not the splash) is on screen. */
  galleryVisible(): boolean;

  /** Custom-key option on the gallery's key picker. */
  customKey: {
    /** Describe label, e.g. "custom key option (S-01 swap)". */
    describeLabel: string;
    /** Seed an inventory whose first character needs a key assignment. */
    seed(): void;
    /** Mount the gallery. */
    render(): Promise<void>;
    /** Open the key picker's "Enter my own character..." mode. */
    openCustom(): Promise<void>;
    /** The custom-character text input (throws when absent). */
    input(): HTMLElement;
    /** The Apply button for the character under assignment. */
    applyButton(): HTMLButtonElement;
  };

  /** Apply lives in whichever method card is open. */
  applyCard: {
    seed(): void;
    render(): Promise<void>;
    /** Accessible-name pattern shared by every card's Apply button. */
    applyName: RegExp;
    /** Test id of the Apply button in the card that opens by default. */
    defaultApplyTestId: string;
    /** Cards opened one after another; each shows only its own Apply. */
    steps: Array<{ open(): Promise<void>; applyTestId: string }>;
  };
}
