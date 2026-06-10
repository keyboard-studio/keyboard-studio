import type { KeyboardIR, IRNodeRef, Pattern } from "@keyboard-studio/contracts";

export interface MatchResult {
  patternId: string;
  ownedNodes: IRNodeRef[];
  slotValues: Record<string, string>;
}

export interface RecognizerRule {
  id: string;
  strategyId: string;
  match(ir: KeyboardIR): MatchResult[];
  lift(match: MatchResult): Pattern;
}

export interface RecognizeResult {
  ir: KeyboardIR;
  recognizedRatio: number;
}
