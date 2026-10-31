// reviewJudge.worker — the /review battery's Web Worker entry.
//
// Thin message adapter over judgeWorkerProtocol.runJudgeJob: the main thread
// posts one JudgeWorkerInput and gets one JudgeWorkerOutput back. A hostile
// keyboard can kill this worker (the host terminates on timeout); it can
// never touch the page's main thread.

import {
  runJudgeJob,
  type JudgeWorkerInput,
  type JudgeWorkerOutput,
} from "./judgeWorkerProtocol.ts";

self.onmessage = (event: MessageEvent<JudgeWorkerInput>) => {
  runJudgeJob(event.data).then((output: JudgeWorkerOutput) => {
    self.postMessage(output);
  });
};
