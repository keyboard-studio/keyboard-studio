import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { ensurePackageFiles } from "./ensurePackageFiles.js";

describe("ensurePackageFiles", () => {
  it("writes LICENSE.md when the working copy has none (Track 2)", () => {
    const vfs = createVirtualFS([
      { path: "source/pid_piaroa.kmn", content: "store(&NAME) 'Piaroa'", isBinary: false },
    ]);

    const { created } = ensurePackageFiles({ vfs });

    expect(created).toEqual(["LICENSE.md"]);
    expect(vfs.get("LICENSE.md")?.content).toContain("MIT License");
  });

  it("is a no-op when LICENSE.md already exists (Track 1)", () => {
    const vfs = createVirtualFS([
      { path: "LICENSE.md", content: "Copyright © 1999 Someone", isBinary: false },
    ]);

    const { created } = ensurePackageFiles({ vfs });

    expect(created).toEqual([]);
    // An author's own license is never overwritten.
    expect(vfs.get("LICENSE.md")?.content).toBe("Copyright © 1999 Someone");
  });

  // spec 061: welcome.htm/readme.htm are no longer this module's concern —
  // projectWorkingCopyForOutput's helpDocsRender hook writes both, every call,
  // regardless of what this function does. Asserting they are left untouched
  // here guards against a second writer creeping back in.
  it("does not touch welcome.htm / readme.htm", () => {
    const vfs = createVirtualFS([]);

    ensurePackageFiles({ vfs });

    expect(vfs.get("source/welcome.htm")).toBeUndefined();
    expect(vfs.get("source/readme.htm")).toBeUndefined();
  });

  it("uses the copyright holder and year when supplied", () => {
    const vfs = createVirtualFS([]);

    ensurePackageFiles({
      vfs,
      copyright: "Sekou Goro",
      year: 2024,
    });

    expect(vfs.get("LICENSE.md")?.content).toBe(
      "Copyright © 2024 Sekou Goro\n\nMIT License\n",
    );
  });

  // spec 059 FR-004. The holder used to fall back to a display name, which
  // emitted "Copyright © <year> <name>" — naming the KEYBOARD as its own
  // rights holder. That is a false statement of fact in a legal notice, and
  // worse than silence because a wrong notice reads as authoritative. The
  // package still ships a license (so it stays redistributable); what it must
  // not do is invent a holder.
  it("omits the copyright line rather than inventing a holder", () => {
    const vfs = createVirtualFS([]);

    ensurePackageFiles({ vfs, year: 2024 });

    const license = vfs.get("LICENSE.md")?.content as string;
    expect(license).toBe("MIT License\n");
    expect(license).not.toContain("Copyright");
  });

  it("treats a whitespace-only copyright as absent, not as a holder", () => {
    const vfs = createVirtualFS([]);

    ensurePackageFiles({ vfs, copyright: "   ", year: 2024 });

    // An author who cleared the field has not named a holder, and a notice
    // reading "Copyright © 2024    " states nothing while looking like it does.
    expect(vfs.get("LICENSE.md")?.content).toBe("MIT License\n");
  });
});
