import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { ensurePackageFiles } from "./ensurePackageFiles.js";

describe("ensurePackageFiles", () => {
  it("writes the files the descriptor lists when the working copy has none (Track 2)", () => {
    const vfs = createVirtualFS([
      { path: "source/pid_piaroa.kmn", content: "store(&NAME) 'Piaroa'", isBinary: false },
    ]);

    const { created } = ensurePackageFiles({ vfs, displayName: "Piaroa" });

    expect(created).toEqual(["source/welcome.htm", "source/readme.htm", "LICENSE.md"]);
    expect(vfs.get("source/welcome.htm")?.content).toContain("Welcome to Piaroa");
    expect(vfs.get("source/readme.htm")?.content).toContain("Piaroa keyboard");
    expect(vfs.get("LICENSE.md")?.content).toContain("MIT License");
  });

  it("is a no-op when the files already exist (Track 1)", () => {
    const vfs = createVirtualFS([
      { path: "source/welcome.htm", content: "<html>mine</html>", isBinary: false },
      { path: "source/readme.htm", content: "<html>mine too</html>", isBinary: false },
      { path: "LICENSE.md", content: "Copyright © 1999 Someone", isBinary: false },
    ]);

    const { created } = ensurePackageFiles({ vfs, displayName: "Piaroa" });

    expect(created).toEqual([]);
    // An author's own docs are never overwritten.
    expect(vfs.get("source/welcome.htm")?.content).toBe("<html>mine</html>");
    expect(vfs.get("LICENSE.md")?.content).toBe("Copyright © 1999 Someone");
  });

  it("fills only the gaps when some files exist", () => {
    const vfs = createVirtualFS([
      { path: "source/welcome.htm", content: "<html>mine</html>", isBinary: false },
    ]);

    const { created } = ensurePackageFiles({ vfs, displayName: "Piaroa" });

    expect(created).toEqual(["source/readme.htm", "LICENSE.md"]);
  });

  it("HTML-escapes the display name in both stubs", () => {
    const vfs = createVirtualFS([]);

    ensurePackageFiles({ vfs, displayName: "<script>alert('x')</script>" });

    const welcome = vfs.get("source/welcome.htm")?.content as string;
    const readme = vfs.get("source/readme.htm")?.content as string;
    expect(welcome).not.toContain("<script>");
    expect(welcome).toContain("&lt;script&gt;");
    expect(readme).not.toContain("<script>");
  });

  it("uses the copyright holder and year when supplied", () => {
    const vfs = createVirtualFS([]);

    ensurePackageFiles({
      vfs,
      displayName: "Piaroa",
      copyright: "Sekou Goro",
      year: 2024,
    });

    expect(vfs.get("LICENSE.md")?.content).toBe(
      "Copyright © 2024 Sekou Goro\n\nMIT License\n",
    );
  });

  // spec 059 FR-004. The holder used to fall back to `displayName`, which emitted
  // "Copyright © <year> Piaroa" — naming the KEYBOARD as its own rights holder.
  // That is a false statement of fact in a legal notice, and worse than silence
  // because a wrong notice reads as authoritative. The package still ships a
  // license (so it stays redistributable); what it must not do is invent a holder.
  it("omits the copyright line rather than naming the keyboard as its own holder", () => {
    const vfs = createVirtualFS([]);

    ensurePackageFiles({ vfs, displayName: "Piaroa", year: 2024 });

    const license = vfs.get("LICENSE.md")?.content as string;
    expect(license).toBe("MIT License\n");
    expect(license).not.toContain("Piaroa");
    expect(license).not.toContain("Copyright");
  });

  it("treats a whitespace-only copyright as absent, not as a holder", () => {
    const vfs = createVirtualFS([]);

    ensurePackageFiles({ vfs, displayName: "Piaroa", copyright: "   ", year: 2024 });

    // An author who cleared the field has not named a holder, and a notice
    // reading "Copyright © 2024    " states nothing while looking like it does.
    expect(vfs.get("LICENSE.md")?.content).toBe("MIT License\n");
  });
});
