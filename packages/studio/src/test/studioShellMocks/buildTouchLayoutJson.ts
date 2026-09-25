// Stub for lib/buildTouchLayoutJson.ts so touch completion never calls real
// engine code. Returns a deterministic JSON string that carries the
// assignments it was given, so a test can assert what reached the working copy.

export const buildTouchLayoutJson = (
  _baseIr: unknown,
  assignments: Array<{ target: string; mechanisms: Array<{ patternId: string; slotValues?: Record<string, string> }> }>,
) => ({
  json: JSON.stringify({ _mock: true, assignments }),
  warnings: [],
});
