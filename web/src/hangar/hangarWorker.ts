// Module Web Worker that runs a hangar battle off the main thread. It reuses
// the shared `runHangarInBrowser` implementation (same code path the direct
// tests exercise) and reports staged progress back to the main thread via the
// pure protocol in hangarWorkerProtocol.ts. Pyodide + the WASM kernel are
// loaded lazily inside this worker chunk, so nothing here enters the main
// bundle. Cancellation is handled on the main thread via worker.terminate().
import { createLiveHangarSession, runHangarInBrowser, type HangarLiveSession } from "./hangar.ts";
import {
  doneMessage,
  errorMessage,
  framesMessage,
  parseLiveRequest,
  parseRunRequest,
  progressMessage,
  readyMessage,
} from "./hangarWorkerProtocol.ts";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let liveSession: HangarLiveSession | null = null;

function destroyLiveSession(): void {
  liveSession?.destroy();
  liveSession = null;
}

ctx.onmessage = (event: MessageEvent) => {
  const liveRequest = parseLiveRequest(event.data);
  if (liveRequest) {
    void (async () => {
      try {
        if (liveRequest.type === "setup") {
          destroyLiveSession();
          liveSession = await createLiveHangarSession({
            botSource: liveRequest.botSource,
            botSourcesByUnit: liveRequest.botSourcesByUnit,
            battleConfigJson: liveRequest.battleConfigJson,
            tickCount: liveRequest.tickCount,
            onProgress: (progress) => ctx.postMessage(progressMessage(progress)),
          });
          ctx.postMessage(readyMessage({
            type: "robolocks.replay.v1",
            tickRate: liveSession.tickRate,
            obstacles: liveSession.obstacles,
            frames: [liveSession.snapshot()],
          }, liveSession.tickLimit));
          return;
        }
        if (liveRequest.type === "step") {
          if (!liveSession) {
            ctx.postMessage(errorMessage("Live hangar session is not ready"));
            return;
          }
          const result = liveSession.step(liveRequest.count);
          ctx.postMessage(framesMessage(result));
          if (result.finished) {
            destroyLiveSession();
          }
          return;
        }
        destroyLiveSession();
      } catch (error: unknown) {
        destroyLiveSession();
        ctx.postMessage(errorMessage(error instanceof Error ? error.message : String(error)));
      }
    })();
    return;
  }

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
