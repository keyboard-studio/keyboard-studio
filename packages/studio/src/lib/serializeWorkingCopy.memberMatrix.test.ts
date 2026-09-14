// Every produced package ships all six documentation members (spec 076 SC-001 /
// FR-001), whatever the track and whatever the base shipped — a parametrized
// nine-cell matrix (T022):
//
//   instantiation ∈ { net-new, Track 1 copy, Track 2 adaptation }
//   × base docs    ∈ { flat-convention welcome, folder-convention welcome + images, none }
//
// The welcome page is ALWAYS at `source/welcome/welcome.htm` and the flat path
// never appears (FR-002). Track 1 cells never carry the base's prose (FR-007);
// Track 2 cells preserve it (spec 061 FR-013). Real projection; only the
// services boundary is mocked.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { projectWorkingCopyForOutput } from "./serializeWorkingCopy.ts";

vi.mock("./services.ts", () => ({
  getToZip: vi.fn(async () => vi.fn(async () => new Uint8Array())),
  getPatternLibraryService: vi.fn(() => ({ getById: async () => undefined })),
}));

const KMN_TEXT = "store(&NAME) 'Matrix'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\ngroup(main) using keys\n";
const BASE_PROSE = "BASE-PROSE-SENTINEL";
const BASE_IMAGES = [
  { path: "welcome/desktop_default.png", bytes: new Uint8Array([1, 2, 3]) },
  { path: "welcome/phone_default.png", bytes: new Uint8Array([4, 5, 6]) },
];

type Instantiation = "net-new" | "track1-copy" | "track2-adapt";
type BaseDocs = "flat" | "folder" | "none";

const INSTANTIATIONS: Instantiation[] = ["net-new", "track1-copy", "track2-adapt"];
const BASE_DOC_SHAPES: BaseDocs[] = ["flat", "folder", "none"];

function memberPaths(keyboardId: string): string[] {
  return [
    "README.md",
    "HISTORY.md",
    "LICENSE.md",
    "source/readme.htm",
    "source/welcome/welcome.htm",
    `source/help/${keyboardId}.php`,
  ];
}

function seed(instantiation: Instantiation, baseDocs: BaseDocs) {
  const vfs = createVirtualFS([
    { path: `source/${basicKbdus.id}.kmn`, content: KMN_TEXT, isBinary: false },
  ]);
  const ir = makeTestIR([]);
  ir.header.version = "1.0";
  const store = useWorkingCopyStore.getState();
  if (instantiation === "track2-adapt") {
    store.instantiateFromExisting(basicKbdus, { vfs, ir });
  } else {
    store.instantiateFromBase(basicKbdus, { vfs, ir });
  }
  const wc = useWorkingCopyStore.getState();

  // What the instantiation seam (useKeyboardArtifact) sets per track and base
  // shape: prose only on the adapt track (FR-007); images on both tracks (R9);
  // a net-new keyboard has no base documentation at all.
  const baseWelcomeHtml = `<html><body><p>${BASE_PROSE}</p></body></html>`;
  if (instantiation !== "net-new") {
    if (baseDocs === "flat") {
      wc.setBaseWelcomeConvention("flat");
      if (instantiation === "track2-adapt") wc.setBaseWelcomeHtmText(baseWelcomeHtml);
    } else if (baseDocs === "folder") {
      wc.setBaseWelcomeConvention("folder");
      wc.setBaseWelcomeImages(BASE_IMAGES);
      if (instantiation === "track2-adapt") {
        wc.setBaseWelcomeHtmText(baseWelcomeHtml);
        wc.setBaseReadmeMdText(`# Base\n\n${BASE_PROSE}\n`);
        wc.setBaseHistoryMdText("## 1.0 (2020-01-01)\n* Initial release.\n");
      }
    } else {
      wc.setBaseWelcomeConvention("absent");
    }
  }
  wc.setHelpDocs({ description: "Author prose.", usageTips: [] });
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  useWorkingCopyStore.getState().reset();
});

describe.each(INSTANTIATIONS)("SC-001 member matrix — %s", (instantiation) => {
  describe.each(BASE_DOC_SHAPES)("base docs: %s", (baseDocs) => {
    it("ships all six documentation members, the welcome page at the folder path, no flat file", async () => {
      seed(instantiation, baseDocs);
      const projected = await projectWorkingCopyForOutput();
      expect(projected).not.toBeNull();
      const vfs = projected!.vfs;

      for (const path of memberPaths(projected!.keyboardId)) {
        const entry = vfs.get(path);
        expect(entry, `${instantiation} × ${baseDocs}: ${path} must ship`).toBeDefined();
        expect(typeof entry!.content === "string" && entry!.content.length > 0, `${path} must be non-empty text`).toBe(true);
      }
      expect(vfs.get("source/welcome.htm"), "the flat welcome path must never ship (FR-002)").toBeUndefined();
    });

    it("carries the base's welcome images exactly when the base shipped them, and prose only on the adapt track", async () => {
      seed(instantiation, baseDocs);
      const projected = await projectWorkingCopyForOutput();
      const vfs = projected!.vfs;
      const welcome = vfs.get("source/welcome/welcome.htm")!.content as string;

      const expectImages = instantiation !== "net-new" && baseDocs === "folder";
      for (const img of BASE_IMAGES) {
        const entry = vfs.get(`source/${img.path}`);
        if (expectImages) {
          expect(entry?.isBinary, `${img.path} must be carried`).toBe(true);
          // A FRESH page (Track 1 copy) references every carried image from its
          // own "Keyboard Layout" section (R9). A merged base page is preserved
          // verbatim with whatever references it had (spec 061 FR-013), so it
          // is not re-annotated.
          if (instantiation === "track1-copy") {
            expect(welcome).toContain(`<img src="${img.path.slice("welcome/".length)}"`);
          }
        } else {
          expect(entry, `${img.path} must not appear`).toBeUndefined();
        }
      }

      const expectProse = instantiation === "track2-adapt" && baseDocs !== "none";
      expect(welcome.includes(BASE_PROSE), `${instantiation} × ${baseDocs}: base prose inherited?`).toBe(expectProse);
      const help = vfs.get(`source/help/${projected!.keyboardId}.php`)!.content as string;
      expect(help.includes(BASE_PROSE)).toBe(false);
    });
  });
});
