// Module Web Worker that runs a hangar battle off the main thread. It reuses
// the shared `runHangarInBrowser` implementation (same code path the direct
// tests exercise) and reports staged progress back to the main thread via the
// pure protocol in hangarWorkerProtocol.ts. Pyodide + the WASM kernel are
// loaded lazily inside this worker chunk, so nothing here enters the main
// bundle. Cancellation is handled on the main thread via worker.terminate().
import { runHangarInBrowser } from "./hangar.ts";
import {
  doneMessage,
  errorMessage,
  parseRunRequest,
  progressMessage,
} from "./hangarWorkerProtocol.ts";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent) => {
  const request = parseRunRequest(event.data);
  if (!request) {
    ctx.postMessage(errorMessage("Invalid hangar run request"));
    return;
  }

  void (async () => {
    try {
      const result = await runHangarInBrowser({
        botSource: request.botSource,
        botSourcesByUnit: request.botSourcesByUnit,
        battleConfigJson: request.battleConfigJson,
        tickCount: request.tickCount,
        onProgress: (progress) => ctx.postMessage(progressMessage(progress)),
      });
      // The replay/log objects are plain JSON, so structured clone via
      // postMessage carries them across intact (verified for parity).
      ctx.postMessage(doneMessage(result.replay, result.logs));
    } catch (error: unknown) {
      ctx.postMessage(errorMessage(error instanceof Error ? error.message : String(error)));
    }
  })();
};
