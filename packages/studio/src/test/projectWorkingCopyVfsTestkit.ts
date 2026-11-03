// Shared fixtures for the projectWorkingCopyVfs.*.test.ts files. The engine
// vi.mock and its spies are NOT shared here: they hoist per test file.
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { MechanismAssignment } from "@keyboard-studio/contracts";

// `touchKeyAddress` itself is not imported here (a static top-level value
// import of the mocked "@keyboard-studio/engine" module would force the
// vi.mock factory below to run during THIS file's own ESM link phase,
// before the spy `const`s it references have been initialized — a
// `ReferenceError`, not a hoisting quirk to work around). The
// "<platform>:<layerId>:<keyId>" format is a stable, documented wire
// format (touchKeyAddress.ts), so it is safe to build inline here.
export function touchKeyAddress(platform: string, layerId: string, keyId: string): string {
  return `${platform}:${layerId}:${keyId}`;
}

export function makeVfs() {
  return createVirtualFS([
    { path: "source/test_kb.kmn", content: "c test\n", isBinary: false },
  ]);
}

export function makePhysicalAssignment(patternId: string): MechanismAssignment {
  return {
    scope: "keyboard-default",
    target: "",
    modality: "physical",
    mechanisms: [{ patternId }],
    source: "user",
  };
}

export function makeTouchAssignment(patternId: string): MechanismAssignment {
  return {
    scope: "keyboard-default",
    target: "",
    modality: "touch",
    mechanisms: [{ patternId }],
    source: "user",
  };
}

export const KEY_EDIT_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys
+ [T_A] > 'a'
+ [T_B] > 'b'
`;

/** A touch layout with a platform-level field (`font`) the IR does not
 *  model, and two keys — used by the "untouched key + platform field
 *  survives" (SC-006) test. */
export function makeKeyEditTouchLayoutJson(): string {
  return JSON.stringify({
    phone: {
      font: "Arial",
      layer: [
        {
          id: "default",
          row: [
            {
              id: 1,
              key: [
                { id: "T_A", text: "A", sp: 0 },
                { id: "T_B", text: "B", sp: 0 },
              ],
            },
          ],
        },
      ],
    },
  });
}

export function makeKeyEditVfs() {
  return createVirtualFS([
    { path: "source/test_kb.kmn", content: KEY_EDIT_KMN, isBinary: false },
    {
      path: "source/test_kb.keyman-touch-layout",
      content: makeKeyEditTouchLayoutJson(),
      isBinary: false,
    },
  ]);
}
