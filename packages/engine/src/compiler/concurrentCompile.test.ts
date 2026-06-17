import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { compile } from "./index.js";

// Regression for the compiler singleton race: compile() used to assign the
// module-scoped `_compiler` and read it back across its init()/run() awaits, so
// two overlapping compile() calls clobbered each other's instance and at least
// one returned zero artifacts. Each call now uses a local instance, so two
// concurrent compiles must both succeed independently.

function kbn(rule: string): string {
  return [
    "store(&NAME) 'Concurrent Test'",
    "store(&VERSION) '10.0'",
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    rule,
    "",
  ].join("\n");
}

describe("compile() concurrency", () => {
  it("two overlapping compiles each produce their own artifacts", async () => {
    const vfsA = createVirtualFS([
      { path: "source/a.kmn", content: kbn("+ [K_A] > 'a'"), isBinary: false },
    ]);
    const vfsB = createVirtualFS([
      { path: "source/b.kmn", content: kbn("+ [K_B] > 'b'"), isBinary: false },
    ]);

    // Start both without awaiting the first — they overlap on the shared module.
    const [resA, resB] = await Promise.all([
      compile(vfsA, "a"),
      compile(vfsB, "b"),
    ]);

    expect(resA.artifacts.length).toBeGreaterThan(0);
    expect(resB.artifacts.length).toBeGreaterThan(0);
  }, 30_000);
});
