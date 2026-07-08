import type { BattleAction, BattleEvent, BattleFrame, BodyShapeFrame, ProjectileFrame, StaticObstacleFrame, UnitFrame, UnitIntentsFrame, UnitModulesFrame } from "../types/protocol";
import createRobolocksKernel from "../generated/robolocks_wasm.js";

type InternalUnit = UnitFrame & {
  target: { x: number; y: number };
  speed: number;
};

type WasmModule = {
  UTF8ToString(pointer: number): string;
  lengthBytesUTF8(value: string): number;
  stringToUTF8(value: string, pointer: number, maxBytesToWrite: number): void;
  _malloc(byteLength: number): number;
  _free(pointer: number): void;
  addFunction(fn: (...args: number[]) => number | void, signature: string): number;
  removeFunction(pointer: number): void;
  cwrap(name: "robolocks_battle_runner_create_from_json", returnType: "number", argTypes: ["string"]): (jsonConfig: string) => number;
  cwrap(name: "robolocks_battle_runner_set_json_bot_callback", returnType: null, argTypes: ["number", "number", "number"]): (callback: number, releaseCallback: number, userData: number) => void;
  cwrap(name: "robolocks_battle_runner_destroy", returnType: null, argTypes: ["number"]): (handle: number) => void;
  cwrap(name: "robolocks_battle_runner_step", returnType: null, argTypes: ["number"]): (handle: number) => void;
  cwrap(name: "robolocks_battle_runner_tick", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_count", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_id", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_hull_heading", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_turret_heading", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_armor", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_weapon_cooldown", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_body_shape_type", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_body_radius", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_body_length", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_body_width", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_modules_json", returnType: "string", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => string;
  cwrap(name: "robolocks_battle_runner_unit_mobility_intent_active", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_mobility_intent_target_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_mobility_intent_target_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_mobility_intent_remaining", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_mobility_intent_age", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_turret_intent_active", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_turret_intent_target_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_turret_intent_target_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_turret_intent_error", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_turret_intent_age", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_hull_intent_active", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_hull_intent_target_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_hull_intent_target_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_hull_intent_error", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_hull_intent_age", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_weapon_intent_active", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_weapon_intent_min_hit_chance", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_unit_weapon_intent_age", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_obstacle_count", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runner_obstacle_id", returnType: "string", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => string;
  cwrap(name: "robolocks_battle_runner_obstacle_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_obstacle_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_obstacle_radius", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_obstacle_blocks_movement", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_obstacle_blocks_line_of_sight", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_event_count", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runner_event_tick", returnType: "number", argTypes: ["number", "number"]): (handle: number, eventIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_event_unit_id", returnType: "number", argTypes: ["number", "number"]): (handle: number, eventIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_event_code", returnType: "string", argTypes: ["number", "number"]): (handle: number, eventIndex: number) => string;
  cwrap(name: "robolocks_battle_runner_event_message", returnType: "string", argTypes: ["number", "number"]): (handle: number, eventIndex: number) => string;
  cwrap(name: "robolocks_battle_runner_projectile_count", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runner_projectile_id", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_projectile_owner_unit_id", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_projectile_previous_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_projectile_previous_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_projectile_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_projectile_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_projectile_radius", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_projectile_previous_height", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_projectile_height", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_count", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runner_action_unit_id", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_type", returnType: "string", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => string;
  cwrap(name: "robolocks_battle_runner_action_channel", returnType: "string", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => string;
  cwrap(name: "robolocks_battle_runner_action_has_position", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_position_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_position_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_has_target", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_target_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_target_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_has_min_hit_chance", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_min_hit_chance", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_has_scan_arc", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_direction", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_width", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_has_range", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runner_action_range", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
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

export async function createPresetDuel(): Promise<KernelBattleRunner> {
  return createFromJson(DEFAULT_LIVE_BATTLE_CONFIG_JSON);
}

export async function createFromJson(jsonConfig: string): Promise<KernelBattleRunner> {
  return createBattleFromJsonWithWasmFactory(jsonConfig);
}

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
  const destroyRuntime = module.cwrap("robolocks_battle_runner_destroy", null, ["number"]);
  const stepRuntime = module.cwrap("robolocks_battle_runner_step", null, ["number"]);
  const tick = module.cwrap("robolocks_battle_runner_tick", "number", ["number"]);
  const unitCount = module.cwrap("robolocks_battle_runner_unit_count", "number", ["number"]);
  const unitId = module.cwrap("robolocks_battle_runner_unit_id", "number", ["number", "number"]);
  const unitX = module.cwrap("robolocks_battle_runner_unit_x", "number", ["number", "number"]);
  const unitY = module.cwrap("robolocks_battle_runner_unit_y", "number", ["number", "number"]);
  const hullHeading = module.cwrap("robolocks_battle_runner_unit_hull_heading", "number", ["number", "number"]);
  const turretHeading = module.cwrap("robolocks_battle_runner_unit_turret_heading", "number", ["number", "number"]);
  const unitArmor = module.cwrap("robolocks_battle_runner_unit_armor", "number", ["number", "number"]);
  const weaponCooldown = module.cwrap("robolocks_battle_runner_unit_weapon_cooldown", "number", ["number", "number"]);
  const bodyShapeType = module.cwrap("robolocks_battle_runner_unit_body_shape_type", "number", ["number", "number"]);
  const bodyRadius = module.cwrap("robolocks_battle_runner_unit_body_radius", "number", ["number", "number"]);
  const bodyLength = module.cwrap("robolocks_battle_runner_unit_body_length", "number", ["number", "number"]);
  const bodyWidth = module.cwrap("robolocks_battle_runner_unit_body_width", "number", ["number", "number"]);
  const unitModulesJson = module.cwrap("robolocks_battle_runner_unit_modules_json", "string", ["number", "number"]);
  const mobilityIntentActive = module.cwrap("robolocks_battle_runner_unit_mobility_intent_active", "number", ["number", "number"]);
  const mobilityIntentTargetX = module.cwrap("robolocks_battle_runner_unit_mobility_intent_target_x", "number", ["number", "number"]);
  const mobilityIntentTargetY = module.cwrap("robolocks_battle_runner_unit_mobility_intent_target_y", "number", ["number", "number"]);
  const mobilityIntentRemaining = module.cwrap("robolocks_battle_runner_unit_mobility_intent_remaining", "number", ["number", "number"]);
  const mobilityIntentAge = module.cwrap("robolocks_battle_runner_unit_mobility_intent_age", "number", ["number", "number"]);
  const turretIntentActive = module.cwrap("robolocks_battle_runner_unit_turret_intent_active", "number", ["number", "number"]);
  const turretIntentTargetX = module.cwrap("robolocks_battle_runner_unit_turret_intent_target_x", "number", ["number", "number"]);
  const turretIntentTargetY = module.cwrap("robolocks_battle_runner_unit_turret_intent_target_y", "number", ["number", "number"]);
  const turretIntentError = module.cwrap("robolocks_battle_runner_unit_turret_intent_error", "number", ["number", "number"]);
  const turretIntentAge = module.cwrap("robolocks_battle_runner_unit_turret_intent_age", "number", ["number", "number"]);
  const hullIntentActive = module.cwrap("robolocks_battle_runner_unit_hull_intent_active", "number", ["number", "number"]);
  const hullIntentTargetX = module.cwrap("robolocks_battle_runner_unit_hull_intent_target_x", "number", ["number", "number"]);
  const hullIntentTargetY = module.cwrap("robolocks_battle_runner_unit_hull_intent_target_y", "number", ["number", "number"]);
  const hullIntentError = module.cwrap("robolocks_battle_runner_unit_hull_intent_error", "number", ["number", "number"]);
  const hullIntentAge = module.cwrap("robolocks_battle_runner_unit_hull_intent_age", "number", ["number", "number"]);
  const weaponIntentActive = module.cwrap("robolocks_battle_runner_unit_weapon_intent_active", "number", ["number", "number"]);
  const weaponIntentMinHitChance = module.cwrap("robolocks_battle_runner_unit_weapon_intent_min_hit_chance", "number", ["number", "number"]);
  const weaponIntentAge = module.cwrap("robolocks_battle_runner_unit_weapon_intent_age", "number", ["number", "number"]);
  const obstacleCount = module.cwrap("robolocks_battle_runner_obstacle_count", "number", ["number"]);
  const obstacleId = module.cwrap("robolocks_battle_runner_obstacle_id", "string", ["number", "number"]);
  const obstacleX = module.cwrap("robolocks_battle_runner_obstacle_x", "number", ["number", "number"]);
  const obstacleY = module.cwrap("robolocks_battle_runner_obstacle_y", "number", ["number", "number"]);
  const obstacleRadius = module.cwrap("robolocks_battle_runner_obstacle_radius", "number", ["number", "number"]);
  const obstacleBlocksMovement = module.cwrap("robolocks_battle_runner_obstacle_blocks_movement", "number", ["number", "number"]);
  const obstacleBlocksLineOfSight = module.cwrap("robolocks_battle_runner_obstacle_blocks_line_of_sight", "number", ["number", "number"]);
  const eventCount = module.cwrap("robolocks_battle_runner_event_count", "number", ["number"]);
  const eventTick = module.cwrap("robolocks_battle_runner_event_tick", "number", ["number", "number"]);
  const eventUnitId = module.cwrap("robolocks_battle_runner_event_unit_id", "number", ["number", "number"]);
  const eventCode = module.cwrap("robolocks_battle_runner_event_code", "string", ["number", "number"]);
  const eventMessage = module.cwrap("robolocks_battle_runner_event_message", "string", ["number", "number"]);
  const projectileCount = module.cwrap("robolocks_battle_runner_projectile_count", "number", ["number"]);
  const projectileId = module.cwrap("robolocks_battle_runner_projectile_id", "number", ["number", "number"]);
  const projectileOwnerUnitId = module.cwrap("robolocks_battle_runner_projectile_owner_unit_id", "number", ["number", "number"]);
  const projectilePreviousX = module.cwrap("robolocks_battle_runner_projectile_previous_x", "number", ["number", "number"]);
  const projectilePreviousY = module.cwrap("robolocks_battle_runner_projectile_previous_y", "number", ["number", "number"]);
  const projectileX = module.cwrap("robolocks_battle_runner_projectile_x", "number", ["number", "number"]);
  const projectileY = module.cwrap("robolocks_battle_runner_projectile_y", "number", ["number", "number"]);
  const projectileRadius = module.cwrap("robolocks_battle_runner_projectile_radius", "number", ["number", "number"]);
  const projectilePreviousHeight = module.cwrap("robolocks_battle_runner_projectile_previous_height", "number", ["number", "number"]);
  const projectileHeight = module.cwrap("robolocks_battle_runner_projectile_height", "number", ["number", "number"]);
  const actionCount = module.cwrap("robolocks_battle_runner_action_count", "number", ["number"]);
  const actionUnitId = module.cwrap("robolocks_battle_runner_action_unit_id", "number", ["number", "number"]);
  const actionType = module.cwrap("robolocks_battle_runner_action_type", "string", ["number", "number"]);
  const actionChannel = module.cwrap("robolocks_battle_runner_action_channel", "string", ["number", "number"]);
  const actionHasPosition = module.cwrap("robolocks_battle_runner_action_has_position", "number", ["number", "number"]);
  const actionPositionX = module.cwrap("robolocks_battle_runner_action_position_x", "number", ["number", "number"]);
  const actionPositionY = module.cwrap("robolocks_battle_runner_action_position_y", "number", ["number", "number"]);
  const actionHasTarget = module.cwrap("robolocks_battle_runner_action_has_target", "number", ["number", "number"]);
  const actionTargetX = module.cwrap("robolocks_battle_runner_action_target_x", "number", ["number", "number"]);
  const actionTargetY = module.cwrap("robolocks_battle_runner_action_target_y", "number", ["number", "number"]);
  const actionHasMinHitChance = module.cwrap("robolocks_battle_runner_action_has_min_hit_chance", "number", ["number", "number"]);
  const actionMinHitChance = module.cwrap("robolocks_battle_runner_action_min_hit_chance", "number", ["number", "number"]);
  const actionHasScanArc = module.cwrap("robolocks_battle_runner_action_has_scan_arc", "number", ["number", "number"]);
  const actionDirectionDeg = module.cwrap("robolocks_battle_runner_action_direction", "number", ["number", "number"]);
  const actionWidthDeg = module.cwrap("robolocks_battle_runner_action_width", "number", ["number", "number"]);
  const actionHasRange = module.cwrap("robolocks_battle_runner_action_has_range", "number", ["number", "number"]);
  const actionRange = module.cwrap("robolocks_battle_runner_action_range", "number", ["number", "number"]);
  const handle = createRuntime(jsonConfig);

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
      return readFrame(handle);
    },
    step(): BattleFrame {
      stepRuntime(handle);
      return readFrame(handle);
    },
    destroy(): void {
      destroyRuntime(handle);
    },
  };

  function readFrame(runtimeHandle: number): BattleFrame {
    const units: UnitFrame[] = [];
    for (let i = 0; i < unitCount(runtimeHandle); i += 1) {
      const id = unitId(runtimeHandle, i);
      units.push({
        unitId: id,
        name: unitName(id),
        position: { x: unitX(runtimeHandle, i), y: unitY(runtimeHandle, i) },
        hullHeadingDegrees: hullHeading(runtimeHandle, i),
        turretHeadingDegrees: turretHeading(runtimeHandle, i),
        armorIntegrity: unitArmor(runtimeHandle, i),
        weaponCooldownTicks: weaponCooldown(runtimeHandle, i),
        bodyShape: readBodyShape(runtimeHandle, i, bodyShapeType, bodyRadius, bodyLength, bodyWidth),
        modules: parseUnitModules(unitModulesJson(runtimeHandle, i)),
        intents: readIntents(runtimeHandle, i),
      });
    }

    return {
      tick: tick(runtimeHandle),
      units,
      projectiles: readProjectiles(
        runtimeHandle,
        projectileCount,
        projectileId,
        projectileOwnerUnitId,
        projectilePreviousX,
        projectilePreviousY,
        projectileX,
        projectileY,
        projectileRadius,
        projectilePreviousHeight,
        projectileHeight,
      ),
      events: readEvents(runtimeHandle, eventCount, eventTick, eventUnitId, eventCode, eventMessage),
      actions: readActions(
        runtimeHandle,
        actionCount,
        actionUnitId,
        actionType,
        actionChannel,
        actionHasPosition,
        actionPositionX,
        actionPositionY,
        actionHasTarget,
        actionTargetX,
        actionTargetY,
        actionHasMinHitChance,
        actionMinHitChance,
        actionHasScanArc,
        actionDirectionDeg,
        actionWidthDeg,
        actionHasRange,
        actionRange,
      ),
    };
  }

  function readIntents(runtimeHandle: number, unitIndex: number): UnitIntentsFrame {
    return {
      mobility: {
        active: mobilityIntentActive(runtimeHandle, unitIndex) !== 0,
        target: {
          x: mobilityIntentTargetX(runtimeHandle, unitIndex),
          y: mobilityIntentTargetY(runtimeHandle, unitIndex),
        },
        remainingMeters: mobilityIntentRemaining(runtimeHandle, unitIndex),
        ageTicks: mobilityIntentAge(runtimeHandle, unitIndex),
      },
      turret: {
        active: turretIntentActive(runtimeHandle, unitIndex) !== 0,
        target: {
          x: turretIntentTargetX(runtimeHandle, unitIndex),
          y: turretIntentTargetY(runtimeHandle, unitIndex),
        },
        errorDegrees: turretIntentError(runtimeHandle, unitIndex),
        ageTicks: turretIntentAge(runtimeHandle, unitIndex),
      },
      hull: {
        active: hullIntentActive(runtimeHandle, unitIndex) !== 0,
        target: {
          x: hullIntentTargetX(runtimeHandle, unitIndex),
          y: hullIntentTargetY(runtimeHandle, unitIndex),
        },
        errorDegrees: hullIntentError(runtimeHandle, unitIndex),
        ageTicks: hullIntentAge(runtimeHandle, unitIndex),
      },
      weapon: {
        active: weaponIntentActive(runtimeHandle, unitIndex) !== 0,
        minHitChance: weaponIntentMinHitChance(runtimeHandle, unitIndex),
        ageTicks: weaponIntentAge(runtimeHandle, unitIndex),
      },
    };
  }
}

function readEvents(
  handle: number,
  eventCount: (handle: number) => number,
  eventTick: (handle: number, eventIndex: number) => number,
  eventUnitId: (handle: number, eventIndex: number) => number,
  eventCode: (handle: number, eventIndex: number) => string,
  eventMessage: (handle: number, eventIndex: number) => string,
): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (let i = 0; i < eventCount(handle); i += 1) {
    events.push({
      tick: eventTick(handle, i),
      unitId: eventUnitId(handle, i),
      code: eventCode(handle, i),
      message: eventMessage(handle, i),
      payload: defaultEventPayload(),
    });
  }
  return events;
}

function defaultEventPayload(): BattleEvent["payload"] {
  return {
    projectileId: 0,
    damageType: "",
    armorFacing: "",
    damage: 0,
    remainingArmor: 0,
    penetrationMillimeters: 0,
    armorMillimeters: 0,
    impactDistanceMeters: 0,
    blastRadiusMeters: 0,
  };
}

function readProjectiles(
  handle: number,
  projectileCount: (handle: number) => number,
  projectileId: (handle: number, projectileIndex: number) => number,
  projectileOwnerUnitId: (handle: number, projectileIndex: number) => number,
  projectilePreviousX: (handle: number, projectileIndex: number) => number,
  projectilePreviousY: (handle: number, projectileIndex: number) => number,
  projectileX: (handle: number, projectileIndex: number) => number,
  projectileY: (handle: number, projectileIndex: number) => number,
  projectileRadius: (handle: number, projectileIndex: number) => number,
  projectilePreviousHeight: (handle: number, projectileIndex: number) => number,
  projectileHeight: (handle: number, projectileIndex: number) => number,
): ProjectileFrame[] {
  const projectiles: ProjectileFrame[] = [];
  for (let i = 0; i < projectileCount(handle); i += 1) {
    projectiles.push({
      projectileId: projectileId(handle, i),
      ownerUnitId: projectileOwnerUnitId(handle, i),
      previousPosition: { x: projectilePreviousX(handle, i), y: projectilePreviousY(handle, i) },
      position: { x: projectileX(handle, i), y: projectileY(handle, i) },
      radiusMeters: projectileRadius(handle, i),
      previousHeightMeters: projectilePreviousHeight(handle, i),
      heightMeters: projectileHeight(handle, i),
    });
  }
  return projectiles;
}

function readActions(
  handle: number,
  actionCount: (handle: number) => number,
  actionUnitId: (handle: number, actionIndex: number) => number,
  actionType: (handle: number, actionIndex: number) => string,
  actionChannel: (handle: number, actionIndex: number) => string,
  actionHasPosition: (handle: number, actionIndex: number) => number,
  actionPositionX: (handle: number, actionIndex: number) => number,
  actionPositionY: (handle: number, actionIndex: number) => number,
  actionHasTarget: (handle: number, actionIndex: number) => number,
  actionTargetX: (handle: number, actionIndex: number) => number,
  actionTargetY: (handle: number, actionIndex: number) => number,
  actionHasMinHitChance: (handle: number, actionIndex: number) => number,
  actionMinHitChance: (handle: number, actionIndex: number) => number,
  actionHasScanArc: (handle: number, actionIndex: number) => number,
  actionDirectionDeg: (handle: number, actionIndex: number) => number,
  actionWidthDeg: (handle: number, actionIndex: number) => number,
  actionHasRange: (handle: number, actionIndex: number) => number,
  actionRange: (handle: number, actionIndex: number) => number,
): BattleAction[] {
  const actions: BattleAction[] = [];
  for (let i = 0; i < actionCount(handle); i += 1) {
    const action: BattleAction = {
      unitId: actionUnitId(handle, i),
      type: actionType(handle, i),
      channel: actionChannel(handle, i),
    };
    if (actionHasPosition(handle, i) !== 0) {
      action.position = { x: actionPositionX(handle, i), y: actionPositionY(handle, i) };
    }
    if (actionHasTarget(handle, i) !== 0) {
      action.target = { x: actionTargetX(handle, i), y: actionTargetY(handle, i) };
    }
    if (actionHasMinHitChance(handle, i) !== 0) {
      action.minHitChance = actionMinHitChance(handle, i);
    }
    if (actionHasScanArc(handle, i) !== 0) {
      action.directionDegrees = actionDirectionDeg(handle, i);
      action.widthDegrees = actionWidthDeg(handle, i);
      if (actionHasRange(handle, i) !== 0) {
        action.rangeMeters = actionRange(handle, i);
      }
    }
    actions.push(action);
  }
  return actions;
}

function readBodyShape(
  handle: number,
  unitIndex: number,
  bodyShapeType: (handle: number, unitIndex: number) => number,
  bodyRadius: (handle: number, unitIndex: number) => number,
  bodyLength: (handle: number, unitIndex: number) => number,
  bodyWidth: (handle: number, unitIndex: number) => number,
): BodyShapeFrame {
  const radiusMeters = bodyRadius(handle, unitIndex);
  if (bodyShapeType(handle, unitIndex) === 1) {
    return {
      type: "box",
      radiusMeters,
      lengthMeters: bodyLength(handle, unitIndex),
      widthMeters: bodyWidth(handle, unitIndex),
    };
  }

  return {
    type: "circle",
    radiusMeters,
  };
}

function loadWasmFactory(): WasmFactory {
  return createRobolocksKernel as WasmFactory;
}

function unitName(unitId: number): string {
  if (unitId === 1) {
    return "Blue";
  }
  if (unitId === 2) {
    return "Red";
  }
  return `Unit ${unitId}`;
}

function defaultIntents(): UnitIntentsFrame {
  const zero = { x: 0, y: 0 };
  return {
    mobility: { active: false, target: zero, remainingMeters: 0, ageTicks: 0 },
    turret: { active: false, target: zero, errorDegrees: 0, ageTicks: 0 },
    hull: { active: false, target: zero, errorDegrees: 0, ageTicks: 0 },
    weapon: { active: false, minHitChance: 0, ageTicks: 0 },
  };
}

function defaultModules(): UnitModulesFrame {
  return {
    mobility: { id: "tracked_chassis_mk1", maxSpeedMetersPerSecond: 6, maxHullTurnDegreesPerSecond: 120 },
    turret: { id: "light_turret_mk1", maxTurnDegreesPerSecond: 180 },
    weapon: { id: "cannon_75mm_mk1", fireMode: "direct", damage: 25, penetrationMillimeters: 120, rangeMeters: 80, muzzleVelocityMetersPerSecond: 620, muzzleOffsetMeters: { x: 3.6, y: 0, z: 1.65 }, launchAngleDegrees: 0, gravityMetersPerSecondSquared: 9.81, blastRadiusMeters: 0, projectileRadiusMeters: 0.08, aimToleranceDegrees: 5, reloadTicks: 30 },
    armor: { id: "rolled_armor_mk1", integrity: 100, frontMillimeters: 100, sideMillimeters: 70, rearMillimeters: 45 },
    body: { id: "medium_hull_mk1", massKilograms: 30000 },
    sensor: { id: "visual_optic_mk1", rangeMeters: 60, fovDegrees: 120, refreshTicks: 1 },
  };
}

function parseUnitModules(payload: string): UnitModulesFrame {
  try {
    const modules = JSON.parse(payload) as Partial<UnitModulesFrame>;
    return {
      mobility: {
        id: stringField(modules.mobility, "id"),
        maxSpeedMetersPerSecond: numberField(modules.mobility, "maxSpeedMetersPerSecond"),
        maxHullTurnDegreesPerSecond: numberField(modules.mobility, "maxHullTurnDegreesPerSecond"),
      },
      turret: {
        id: stringField(modules.turret, "id"),
        maxTurnDegreesPerSecond: numberField(modules.turret, "maxTurnDegreesPerSecond"),
      },
      weapon: {
        id: stringField(modules.weapon, "id"),
        fireMode: stringField(modules.weapon, "fireMode"),
        damage: numberField(modules.weapon, "damage"),
        penetrationMillimeters: numberField(modules.weapon, "penetrationMillimeters"),
        rangeMeters: numberField(modules.weapon, "rangeMeters"),
        muzzleVelocityMetersPerSecond: numberField(modules.weapon, "muzzleVelocityMetersPerSecond"),
        muzzleOffsetMeters: vec3Field(modules.weapon, "muzzleOffsetMeters"),
        launchAngleDegrees: numberField(modules.weapon, "launchAngleDegrees"),
        gravityMetersPerSecondSquared: numberField(modules.weapon, "gravityMetersPerSecondSquared"),
        blastRadiusMeters: numberField(modules.weapon, "blastRadiusMeters"),
        projectileRadiusMeters: numberField(modules.weapon, "projectileRadiusMeters"),
        aimToleranceDegrees: numberField(modules.weapon, "aimToleranceDegrees"),
        reloadTicks: numberField(modules.weapon, "reloadTicks"),
      },
      armor: {
        id: stringField(modules.armor, "id"),
        integrity: numberField(modules.armor, "integrity"),
        frontMillimeters: numberField(modules.armor, "frontMillimeters"),
        sideMillimeters: numberField(modules.armor, "sideMillimeters"),
        rearMillimeters: numberField(modules.armor, "rearMillimeters"),
      },
      body: {
        id: stringField(modules.body, "id"),
        massKilograms: numberField(modules.body, "massKilograms"),
      },
      sensor: {
        id: stringField(modules.sensor, "id"),
        rangeMeters: numberField(modules.sensor, "rangeMeters"),
        fovDegrees: numberField(modules.sensor, "fovDegrees"),
        refreshTicks: numberField(modules.sensor, "refreshTicks"),
      },
    };
  } catch {
    return defaultModules();
  }
}

function stringField(payload: unknown, key: string): string {
  const object = payload as Record<string, unknown>;
  return typeof object === "object" && object !== null && typeof object[key] === "string"
    ? object[key]
    : "";
}

function numberField(payload: unknown, key: string): number {
  const object = payload as Record<string, unknown>;
  return typeof object === "object" && object !== null && typeof object[key] === "number"
    ? object[key]
    : 0;
}

function vec3Field(payload: unknown, key: string): { x: number; y: number; z: number } {
  const object = payload as Record<string, unknown>;
  const value = typeof object === "object" && object !== null ? object[key] : null;
  const vector = value as { x?: unknown; y?: unknown; z?: unknown };
  if (
    typeof vector === "object" &&
    vector !== null &&
    typeof vector.x === "number" &&
    typeof vector.y === "number" &&
    typeof vector.z === "number"
  ) {
    return { x: vector.x, y: vector.y, z: vector.z };
  }
  return { x: 0, y: 0, z: 0 };
}

export function createFallbackPresetDuel(): KernelBattleRunner {
  let tick = 0;
  const units: InternalUnit[] = [
    { unitId: 1, name: "Blue", position: { x: 6, y: 12 }, hullHeadingDegrees: 0, turretHeadingDegrees: 0, armorIntegrity: 100, weaponCooldownTicks: 0, bodyShape: { type: "box", radiusMeters: 1.2, lengthMeters: 5.6, widthMeters: 2.8 }, modules: defaultModules(), intents: defaultIntents(), target: { x: 17, y: 12 }, speed: 0.2 },
    { unitId: 2, name: "Red", position: { x: 34, y: 12 }, hullHeadingDegrees: 0, turretHeadingDegrees: 0, armorIntegrity: 100, weaponCooldownTicks: 0, bodyShape: { type: "box", radiusMeters: 1.2, lengthMeters: 5.6, widthMeters: 2.8 }, modules: defaultModules(), intents: defaultIntents(), target: { x: 23, y: 12 }, speed: 0.2 },
  ];

  return {
    staticObstacles(): StaticObstacleFrame[] {
      return [];
    },
    snapshot(): BattleFrame {
      return {
        tick,
        units: units.map((unit) => ({
          unitId: unit.unitId,
          name: unit.name,
          position: { ...unit.position },
          hullHeadingDegrees: unit.hullHeadingDegrees,
          turretHeadingDegrees: unit.turretHeadingDegrees,
          armorIntegrity: unit.armorIntegrity,
          weaponCooldownTicks: unit.weaponCooldownTicks,
          bodyShape: unit.bodyShape,
          modules: unit.modules,
          intents: unit.intents,
        })),
        projectiles: [],
        events: [],
        actions: [],
      };
    },
    step(): BattleFrame {
      tick += 1;
      for (const unit of units) {
        unit.position = advanceToward(unit.position, unit.target, unit.speed);
      }
      return {
        tick,
        units: units.map((unit) => ({
          unitId: unit.unitId,
          name: unit.name,
          position: { ...unit.position },
          hullHeadingDegrees: 0,
          turretHeadingDegrees: 0,
          armorIntegrity: unit.armorIntegrity,
          weaponCooldownTicks: unit.weaponCooldownTicks,
          bodyShape: unit.bodyShape,
          modules: unit.modules,
          intents: unit.intents,
        })),
        projectiles: [],
        events: [],
        actions: [],
      };
    },
    destroy(): void {},
  };
}

function advanceToward(from: { x: number; y: number }, to: { x: number; y: number }, maxDistance: number): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= maxDistance || len <= 0) {
    return { ...to };
  }
  return {
    x: from.x + (dx / len) * maxDistance,
    y: from.y + (dy / len) * maxDistance,
  };
}
