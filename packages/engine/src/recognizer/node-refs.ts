import type { IRNodeRef } from "@keyboard-studio/contracts";

export function ruleRef(nodeId: string): IRNodeRef {
  return { kind: "rule", nodeId };
}

export function storeRef(nodeId: string): IRNodeRef {
  return { kind: "store", nodeId };
}
