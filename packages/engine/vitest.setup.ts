// Engine tests run under Node: install the vm-sandbox keyboard loader that the
// `./simulator` package entry (src/simulator/node.ts) installs for Node callers.
// Tests import simulator internals by relative path, bypassing that entry.
import { setDefaultKeyboardLoader } from "./src/simulator/keyboardLoader.js";
import { nodeKeyboardLoader } from "./src/simulator/nodeKeyboardLoader.js";

setDefaultKeyboardLoader(nodeKeyboardLoader);
