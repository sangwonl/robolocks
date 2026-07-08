import { createPresetDuel } from "./kernelAdapter";
import type { BattleFrame, SimWorkerRequest, SimWorkerResponse } from "../types/protocol";
import type { KernelBattleRunner } from "./kernelAdapter";

function post(response: SimWorkerResponse): void {
  self.postMessage(response);
}

let battleRunner: KernelBattleRunner | null = null;
let playTimer: ReturnType<typeof setInterval> | null = null;
let currentLimit = 0;
let messageQueue = Promise.resolve();

self.onmessage = (event: MessageEvent<SimWorkerRequest>) => {
  const message = event.data;
  if (message.type === "liveReset") {
    enqueue(resetLive);
  } else if (message.type === "liveStep") {
    enqueue(stepLive);
  } else if (message.type === "livePlay") {
    enqueue(() => playLive(message.tickLimit));
  } else if (message.type === "livePause") {
    pauseLive();
  }
};

function enqueue(task: () => Promise<void>): void {
  messageQueue = messageQueue.then(task).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    post({
      type: "battleComplete",
      finalFrame: {
        tick: 0,
        units: [],
        projectiles: [],
        events: [{ tick: 0, unitId: 0, code: "worker_error", message, payload: {
          projectileId: 0,
          damageType: "",
          armorFacing: "",
          damage: 0,
          remainingArmor: 0,
          penetrationMillimeters: 0,
          armorMillimeters: 0,
          impactDistanceMeters: 0,
          blastRadiusMeters: 0,
        } }],
        actions: [],
      },
    });
  });
}

async function resetLive(): Promise<void> {
  pauseLive();
  battleRunner?.destroy();
  battleRunner = await createPresetDuel();
  post({ type: "battleStatic", obstacles: battleRunner.staticObstacles() });
  post({ type: "battleFrame", frame: battleRunner.snapshot() });
}

async function ensureLive(): Promise<KernelBattleRunner> {
  if (battleRunner === null) {
    await resetLive();
  }
  if (battleRunner === null) {
    throw new Error("Live simulation did not initialize");
  }
  return battleRunner;
}

async function stepLive(): Promise<void> {
  pauseLive();
  const live = await ensureLive();
  postStep(live.step());
}

async function playLive(tickLimit: number): Promise<void> {
  currentLimit = tickLimit;
  const live = await ensureLive();
  if (playTimer !== null) {
    return;
  }
  playTimer = setInterval(() => {
    postStep(live.step());
  }, 33);
}

function pauseLive(): void {
  if (playTimer !== null) {
    clearInterval(playTimer);
    playTimer = null;
  }
  post({ type: "battlePaused" });
}

function postStep(frame: BattleFrame): void {
  post({ type: "battleFrame", frame });
  if (currentLimit > 0 && frame.tick >= currentLimit) {
    pauseLive();
    post({ type: "battleComplete", finalFrame: frame });
  }
}
