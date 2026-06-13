// @ts-nocheck
// References all utility includes from a single file, making import/export simple.

export { deepCopy } from "./deepCopy.js";

export { DeviceSpec, physicalKeyDeviceAlias } from "./deviceSpec.js";

/*
  // An example valid use, post-import:
  let testSpec = new DeviceSpec(DeviceSpec.Browser.Chrome,
                                DeviceSpec.FormFactor.Tablet,
                                DeviceSpec.OperatingSystem.Android,
                                true);
 */

export { Version } from "./version.js";

export { globalObject } from "./globalObject.js";

export * as KMWString from './kmwstring.js';

export { ManagedPromise } from "./managedPromise.js";
// TimeoutPromise and PriorityQueue omitted — not needed by the simulator stack.

export { isEmptyTransform } from './isEmptyTransform.js';
