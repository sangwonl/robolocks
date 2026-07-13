import { runHangarInBrowser } from "../hangar/hangar.ts";
import {
  arenaDoneMessage,
  arenaErrorMessage,
  arenaMatchMessage,
  arenaProgressMessage,
  parseArenaRunRequest,
} from "./arenaWorkerProtocol.ts";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent) => {
  const request = parseArenaRunRequest(event.data);
  if (!request) {
    ctx.postMessage(arenaErrorMessage("Invalid arena run request"));
    return;
  }

  void (async () => {
    try {
      for (let index = 0; index < request.runs.length; index += 1) {
        const run = request.runs[index];
        const result = await runHangarInBrowser({
          botSource: request.botSource,
          botSourcesByUnit: request.botSourcesByUnit,
          battleConfigJson: run.battleConfigJson,
          tickCount: run.tickCount,
          logDrainIntervalTicks: 60,
          onProgress: (progress) => ctx.postMessage(arenaProgressMessage({
            stage: progress.stage,
            runIndex: index + 1,
            totalRuns: request.runs.length,
            seed: run.seed,
            tick: progress.tick,
            totalTicks: progress.totalTicks,
          })),
        });
        ctx.postMessage(arenaMatchMessage({ seed: run.seed, replay: result.replay, logs: result.logs }));
      }
      ctx.postMessage(arenaDoneMessage());
    } catch (error: unknown) {
      ctx.postMessage(arenaErrorMessage(error instanceof Error ? error.message : String(error)));
    }
  })();
};
