import type { BattleFrame, StaticObstacleFrame } from "../types/protocol";
import { parseFrame } from "../replay/frameParsing.ts";
import createRobolocksKernel from "../generated/robolocks_wasm.js";

type WasmModule = {
  UTF8ToString(pointer: number): string;
  lengthBytesUTF8(value: string): number;
  stringToUTF8(value: string, pointer: number, maxBytesToWrite: number): void;
  _malloc(byteLength: number): number;
  _free(pointer: number): void;
  addFunction(fn: (...args: number[]) => number | void, signature: string): number;
  removeFunction(pointer: number): void;
  cwrap(name: "robolocks_battle_runner_create_from_json", returnType: "number", argTypes: ["string"]): (jsonConfig: string) => number;
  cwrap(name: "robolocks_last_error", returnType: "string", argTypes: []): () => string;
  cwrap(name: "robolocks_battle_runner_set_json_bot_callback", returnType: null, argTypes: ["number", "number", "number"]): (callback: number, releaseCallback: number, userData: number) => void;
  cwrap(name: "robolocks_battle_runner_destroy", returnType: null, argTypes: ["number"]): (handle: number) => void;
  cwrap(name: "robolocks_battle_runner_step", returnType: null, argTypes: ["number"]): (handle: number) => void;
  cwrap(name: "robolocks_battle_runner_frame_json", returnType: "string", argTypes: ["number"]): (handle: number) => string;
  cwrap(name: "robolocks_battle_runner_obstacle_count", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runner_obstacle_id", returnType: "string", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => string;
  cwrap(name: "robolocks_battle_runner_obstacle_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_obstacle_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_obstacle_radius", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_obstacle_blocks_movement", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_obstacle_blocks_line_of_sight", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
};

type WasmFactory = (options: { locateFile(path: string): string }) => Promise<WasmModule>;

export type KernelBattleRunner = {
  staticObstacles(): StaticObstacleFrame[];
  snapshot(): BattleFrame;
  step(): BattleFrame;
  destroy(): void;
};

const DEFAULT_LIVE_BATTLE_CONFIG_JSON = JSON.stringify({
  battleId: "live_sandbox_v0",
  seed: 1,
  tickRate: 30,
  tickLimit: 9000,
  units: [
    { unitId: 1, name: "Blue", spawn: { x: 6, y: 12, headingDeg: 0 }, modules: {} },
    { unitId: 2, name: "Red", spawn: { x: 34, y: 12, headingDeg: 180 }, modules: {} },
  ],
  controllers: [],
});

export type JsonBotTick = (observation: unknown) => unknown;

export async function createResearchDuelWithJsonBotFromWasmFactory(options: {
  botId: number;
  battleConfigJson: string;
  onTick: JsonBotTick;
  factory?: WasmFactory;
}): Promise<KernelBattleRunner> {
  let callbackPointer = 0;
  let releaseCallbackPointer = 0;
  let wasmModule: WasmModule | undefined;
  let setJsonBotCallback: ((callback: number, releaseCallback: number, userData: number) => void) | undefined;

  const runner = await createBattleFromJsonWithWasmFactory(options.battleConfigJson, async (wasmOptions) => {
    const module = await (options.factory ?? loadWasmFactory())(wasmOptions);
    wasmModule = module;
    setJsonBotCallback = module.cwrap(
      "robolocks_battle_runner_set_json_bot_callback",
      null,
      ["number", "number", "number"],
    );

    callbackPointer = module.addFunction((botId: number, observationPointer: number): number => {
      const observation = JSON.parse(module.UTF8ToString(observationPointer));
      const response = JSON.stringify(options.onTick({ ...observation, botId }) ?? { orders: [] });
      const byteLength = module.lengthBytesUTF8(response) + 1;
      const responsePointer = module._malloc(byteLength);
      module.stringToUTF8(response, responsePointer, byteLength);
      return responsePointer;
    }, "iiii");
    releaseCallbackPointer = module.addFunction((responsePointer: number): void => {
      if (responsePointer !== 0) {
        module._free(responsePointer);
      }
    }, "vii");
    setJsonBotCallback(callbackPointer, releaseCallbackPointer, 0);

    return module;
  });

  return {
    staticObstacles: runner.staticObstacles,
    snapshot: runner.snapshot,
    step: runner.step,
    destroy(): void {
      try {
        runner.destroy();
      } finally {
        setJsonBotCallback?.(0, 0, 0);
        if (callbackPointer !== 0) {
          wasmModule?.removeFunction(callbackPointer);
          callbackPointer = 0;
        }
        if (releaseCallbackPointer !== 0) {
          wasmModule?.removeFunction(releaseCallbackPointer);
          releaseCallbackPointer = 0;
        }
        setJsonBotCallback = undefined;
        wasmModule = undefined;
      }
    },
  };
}

export async function createPresetDuelFromWasmFactory(factory: WasmFactory = loadWasmFactory()): Promise<KernelBattleRunner> {
  return createBattleFromJsonWithWasmFactory(DEFAULT_LIVE_BATTLE_CONFIG_JSON, factory);
}

export async function createBattleFromJsonWithWasmFactory(
  jsonConfig: string,
  factory: WasmFactory = loadWasmFactory(),
): Promise<KernelBattleRunner> {
  const module = await factory({
    locateFile(path: string): string {
      return `/wasm/${path}`;
    },
  });

  const createRuntime = module.cwrap("robolocks_battle_runner_create_from_json", "number", ["string"]);
  const lastError = module.cwrap("robolocks_last_error", "string", []);
  const destroyRuntime = module.cwrap("robolocks_battle_runner_destroy", null, ["number"]);
  const stepRuntime = module.cwrap("robolocks_battle_runner_step", null, ["number"]);
  const frameJson = module.cwrap("robolocks_battle_runner_frame_json", "string", ["number"]);
  const obstacleCount = module.cwrap("robolocks_battle_runner_obstacle_count", "number", ["number"]);
  const obstacleId = module.cwrap("robolocks_battle_runner_obstacle_id", "string", ["number", "number"]);
  const obstacleX = module.cwrap("robolocks_battle_runner_obstacle_x", "number", ["number", "number"]);
  const obstacleY = module.cwrap("robolocks_battle_runner_obstacle_y", "number", ["number", "number"]);
  const obstacleRadius = module.cwrap("robolocks_battle_runner_obstacle_radius", "number", ["number", "number"]);
  const obstacleBlocksMovement = module.cwrap("robolocks_battle_runner_obstacle_blocks_movement", "number", ["number", "number"]);
  const obstacleBlocksLineOfSight = module.cwrap("robolocks_battle_runner_obstacle_blocks_line_of_sight", "number", ["number", "number"]);
  const handle = createRuntime(jsonConfig);
  if (!handle) {
    throw new Error(lastError() || "battle runner creation failed");
  }

  return {
    staticObstacles(): StaticObstacleFrame[] {
      const obstacles: StaticObstacleFrame[] = [];
      for (let i = 0; i < obstacleCount(handle); i += 1) {
        obstacles.push({
          id: obstacleId(handle, i),
          position: { x: obstacleX(handle, i), y: obstacleY(handle, i) },
          radiusMeters: obstacleRadius(handle, i),
          blocksMovement: obstacleBlocksMovement(handle, i) !== 0,
          blocksLineOfSight: obstacleBlocksLineOfSight(handle, i) !== 0,
        });
      }
      return obstacles;
    },
    snapshot(): BattleFrame {
      return parseFrameOrThrow(frameJson(handle), lastError);
    },
    step(): BattleFrame {
      stepRuntime(handle);
      return parseFrameOrThrow(frameJson(handle), lastError);
    },
    destroy(): void {
      destroyRuntime(handle);
    },
  };
}

// robolocks_battle_runner_frame_json returns null on error -- including when
// the preceding step/run call failed (e.g. a JSON bot callback threw). cwrap's
// "string" return type turns a null C string into "" on the JS side, so an
// empty string is the sentinel to check for here. Follows the same
// throw-with-last-error pattern as the create path above.
function parseFrameOrThrow(frameText: string, lastError: () => string): BattleFrame {
  if (!frameText) {
    throw new Error(lastError() || "battle runner step failed");
  }
  return parseFrame(JSON.parse(frameText));
}

function loadWasmFactory(): WasmFactory {
  return createRobolocksKernel as WasmFactory;
}
