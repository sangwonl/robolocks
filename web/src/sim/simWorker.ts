import { createPresetDuel } from "./kernelAdapter";
import type { BattleFrame, SimWorkerRequest, SimWorkerResponse } from "../types/protocol";

function post(response: SimWorkerResponse): void {
  self.postMessage(response);
}

self.onmessage = (event: MessageEvent<SimWorkerRequest>) => {
  if (event.data.type !== "runPresetDuel") {
    return;
  }

  const match = createPresetDuel();
  let frame: BattleFrame = match.step();

  for (let i = 1; i < event.data.ticks; i += 1) {
    frame = match.step();
    post({ type: "battleFrame", frame });
  }

  post({ type: "battleComplete", finalFrame: frame });
};
