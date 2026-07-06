import type { BattleFrame, SimWorkerRequest, SimWorkerResponse } from "../types/protocol";

function post(response: SimWorkerResponse): void {
  self.postMessage(response);
}

self.onmessage = (event: MessageEvent<SimWorkerRequest>) => {
  if (event.data.type !== "runPresetDuel") {
    return;
  }

  const frame: BattleFrame = {
    tick: event.data.ticks,
    units: [
      { unitId: 1, name: "Blue", position: { x: 10, y: 12 }, armorIntegrity: 100 },
      { unitId: 2, name: "Red", position: { x: 30, y: 12 }, armorIntegrity: 100 },
    ],
    events: [],
  };

  post({ type: "battleComplete", finalFrame: frame });
};
