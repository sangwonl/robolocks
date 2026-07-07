import type { BattleAction, BattleEvent, BattleFrame, BodyShapeFrame, ProjectileFrame, StaticObstacleFrame, UnitFrame, UnitIntentsFrame, UnitModulesFrame } from "../types/protocol";
import createRobolocksKernel from "../generated/robolocks_wasm.js";

type InternalUnit = UnitFrame & {
  target: { x: number; y: number };
  speed: number;
};

type WasmModule = {
  cwrap(name: "robolocks_battle_runtime_create_preset_duel", returnType: "number", argTypes: []): () => number;
  cwrap(name: "robolocks_battle_runtime_destroy", returnType: null, argTypes: ["number"]): (handle: number) => void;
  cwrap(name: "robolocks_battle_runtime_step", returnType: null, argTypes: ["number"]): (handle: number) => void;
  cwrap(name: "robolocks_battle_runtime_tick", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_count", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_id", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_hull_heading_deg", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_turret_heading_deg", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_armor", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_weapon_cooldown_ticks", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_body_shape_type", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_body_radius_m", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_body_length_m", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_body_width_m", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_mobility_intent_active", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_mobility_intent_target_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_mobility_intent_target_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_mobility_intent_remaining_m", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_mobility_intent_age_ticks", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_turret_intent_active", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_turret_intent_target_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_turret_intent_target_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_turret_intent_error_deg", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_turret_intent_age_ticks", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_hull_intent_active", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_hull_intent_target_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_hull_intent_target_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_hull_intent_error_deg", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_hull_intent_age_ticks", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_weapon_intent_active", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_weapon_intent_min_hit_chance", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_unit_weapon_intent_age_ticks", returnType: "number", argTypes: ["number", "number"]): (handle: number, unitIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_obstacle_count", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runtime_obstacle_id", returnType: "string", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => string;
  cwrap(name: "robolocks_battle_runtime_obstacle_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_obstacle_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_obstacle_radius_m", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_obstacle_blocks_movement", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_obstacle_blocks_line_of_sight", returnType: "number", argTypes: ["number", "number"]): (handle: number, obstacleIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_event_count", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runtime_event_tick", returnType: "number", argTypes: ["number", "number"]): (handle: number, eventIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_event_unit_id", returnType: "number", argTypes: ["number", "number"]): (handle: number, eventIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_event_code", returnType: "string", argTypes: ["number", "number"]): (handle: number, eventIndex: number) => string;
  cwrap(name: "robolocks_battle_runtime_event_message", returnType: "string", argTypes: ["number", "number"]): (handle: number, eventIndex: number) => string;
  cwrap(name: "robolocks_battle_runtime_projectile_count", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runtime_projectile_id", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_projectile_owner_unit_id", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_projectile_previous_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_projectile_previous_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_projectile_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_projectile_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_projectile_radius_m", returnType: "number", argTypes: ["number", "number"]): (handle: number, projectileIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_count", returnType: "number", argTypes: ["number"]): (handle: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_unit_id", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_type", returnType: "string", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => string;
  cwrap(name: "robolocks_battle_runtime_action_channel", returnType: "string", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => string;
  cwrap(name: "robolocks_battle_runtime_action_has_position", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_position_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_position_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_has_target", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_target_x", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_target_y", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_has_min_hit_chance", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_min_hit_chance", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_has_scan_arc", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_center_deg", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
  cwrap(name: "robolocks_battle_runtime_action_width_deg", returnType: "number", argTypes: ["number", "number"]): (handle: number, actionIndex: number) => number;
};

type WasmFactory = (options: { locateFile(path: string): string }) => Promise<WasmModule>;

export type KernelMatch = {
  staticObstacles(): StaticObstacleFrame[];
  snapshot(): BattleFrame;
  step(): BattleFrame;
  destroy(): void;
};

export async function createPresetDuel(): Promise<KernelMatch> {
  return createWasmPresetDuel();
}

export async function createPresetDuelFromWasmFactory(factory: WasmFactory = loadWasmFactory()): Promise<KernelMatch> {
  const module = await factory({
    locateFile(path: string): string {
      return `/wasm/${path}`;
    },
  });

  const createRuntime = module.cwrap("robolocks_battle_runtime_create_preset_duel", "number", []);
  const destroyRuntime = module.cwrap("robolocks_battle_runtime_destroy", null, ["number"]);
  const stepRuntime = module.cwrap("robolocks_battle_runtime_step", null, ["number"]);
  const tick = module.cwrap("robolocks_battle_runtime_tick", "number", ["number"]);
  const unitCount = module.cwrap("robolocks_battle_runtime_unit_count", "number", ["number"]);
  const unitId = module.cwrap("robolocks_battle_runtime_unit_id", "number", ["number", "number"]);
  const unitX = module.cwrap("robolocks_battle_runtime_unit_x", "number", ["number", "number"]);
  const unitY = module.cwrap("robolocks_battle_runtime_unit_y", "number", ["number", "number"]);
  const hullHeading = module.cwrap("robolocks_battle_runtime_unit_hull_heading_deg", "number", ["number", "number"]);
  const turretHeading = module.cwrap("robolocks_battle_runtime_unit_turret_heading_deg", "number", ["number", "number"]);
  const unitArmor = module.cwrap("robolocks_battle_runtime_unit_armor", "number", ["number", "number"]);
  const weaponCooldown = module.cwrap("robolocks_battle_runtime_unit_weapon_cooldown_ticks", "number", ["number", "number"]);
  const bodyShapeType = module.cwrap("robolocks_battle_runtime_unit_body_shape_type", "number", ["number", "number"]);
  const bodyRadius = module.cwrap("robolocks_battle_runtime_unit_body_radius_m", "number", ["number", "number"]);
  const bodyLength = module.cwrap("robolocks_battle_runtime_unit_body_length_m", "number", ["number", "number"]);
  const bodyWidth = module.cwrap("robolocks_battle_runtime_unit_body_width_m", "number", ["number", "number"]);
  const mobilityIntentActive = module.cwrap("robolocks_battle_runtime_unit_mobility_intent_active", "number", ["number", "number"]);
  const mobilityIntentTargetX = module.cwrap("robolocks_battle_runtime_unit_mobility_intent_target_x", "number", ["number", "number"]);
  const mobilityIntentTargetY = module.cwrap("robolocks_battle_runtime_unit_mobility_intent_target_y", "number", ["number", "number"]);
  const mobilityIntentRemaining = module.cwrap("robolocks_battle_runtime_unit_mobility_intent_remaining_m", "number", ["number", "number"]);
  const mobilityIntentAge = module.cwrap("robolocks_battle_runtime_unit_mobility_intent_age_ticks", "number", ["number", "number"]);
  const turretIntentActive = module.cwrap("robolocks_battle_runtime_unit_turret_intent_active", "number", ["number", "number"]);
  const turretIntentTargetX = module.cwrap("robolocks_battle_runtime_unit_turret_intent_target_x", "number", ["number", "number"]);
  const turretIntentTargetY = module.cwrap("robolocks_battle_runtime_unit_turret_intent_target_y", "number", ["number", "number"]);
  const turretIntentError = module.cwrap("robolocks_battle_runtime_unit_turret_intent_error_deg", "number", ["number", "number"]);
  const turretIntentAge = module.cwrap("robolocks_battle_runtime_unit_turret_intent_age_ticks", "number", ["number", "number"]);
  const hullIntentActive = module.cwrap("robolocks_battle_runtime_unit_hull_intent_active", "number", ["number", "number"]);
  const hullIntentTargetX = module.cwrap("robolocks_battle_runtime_unit_hull_intent_target_x", "number", ["number", "number"]);
  const hullIntentTargetY = module.cwrap("robolocks_battle_runtime_unit_hull_intent_target_y", "number", ["number", "number"]);
  const hullIntentError = module.cwrap("robolocks_battle_runtime_unit_hull_intent_error_deg", "number", ["number", "number"]);
  const hullIntentAge = module.cwrap("robolocks_battle_runtime_unit_hull_intent_age_ticks", "number", ["number", "number"]);
  const weaponIntentActive = module.cwrap("robolocks_battle_runtime_unit_weapon_intent_active", "number", ["number", "number"]);
  const weaponIntentMinHitChance = module.cwrap("robolocks_battle_runtime_unit_weapon_intent_min_hit_chance", "number", ["number", "number"]);
  const weaponIntentAge = module.cwrap("robolocks_battle_runtime_unit_weapon_intent_age_ticks", "number", ["number", "number"]);
  const obstacleCount = module.cwrap("robolocks_battle_runtime_obstacle_count", "number", ["number"]);
  const obstacleId = module.cwrap("robolocks_battle_runtime_obstacle_id", "string", ["number", "number"]);
  const obstacleX = module.cwrap("robolocks_battle_runtime_obstacle_x", "number", ["number", "number"]);
  const obstacleY = module.cwrap("robolocks_battle_runtime_obstacle_y", "number", ["number", "number"]);
  const obstacleRadius = module.cwrap("robolocks_battle_runtime_obstacle_radius_m", "number", ["number", "number"]);
  const obstacleBlocksMovement = module.cwrap("robolocks_battle_runtime_obstacle_blocks_movement", "number", ["number", "number"]);
  const obstacleBlocksLineOfSight = module.cwrap("robolocks_battle_runtime_obstacle_blocks_line_of_sight", "number", ["number", "number"]);
  const eventCount = module.cwrap("robolocks_battle_runtime_event_count", "number", ["number"]);
  const eventTick = module.cwrap("robolocks_battle_runtime_event_tick", "number", ["number", "number"]);
  const eventUnitId = module.cwrap("robolocks_battle_runtime_event_unit_id", "number", ["number", "number"]);
  const eventCode = module.cwrap("robolocks_battle_runtime_event_code", "string", ["number", "number"]);
  const eventMessage = module.cwrap("robolocks_battle_runtime_event_message", "string", ["number", "number"]);
  const projectileCount = module.cwrap("robolocks_battle_runtime_projectile_count", "number", ["number"]);
  const projectileId = module.cwrap("robolocks_battle_runtime_projectile_id", "number", ["number", "number"]);
  const projectileOwnerUnitId = module.cwrap("robolocks_battle_runtime_projectile_owner_unit_id", "number", ["number", "number"]);
  const projectilePreviousX = module.cwrap("robolocks_battle_runtime_projectile_previous_x", "number", ["number", "number"]);
  const projectilePreviousY = module.cwrap("robolocks_battle_runtime_projectile_previous_y", "number", ["number", "number"]);
  const projectileX = module.cwrap("robolocks_battle_runtime_projectile_x", "number", ["number", "number"]);
  const projectileY = module.cwrap("robolocks_battle_runtime_projectile_y", "number", ["number", "number"]);
  const projectileRadius = module.cwrap("robolocks_battle_runtime_projectile_radius_m", "number", ["number", "number"]);
  const actionCount = module.cwrap("robolocks_battle_runtime_action_count", "number", ["number"]);
  const actionUnitId = module.cwrap("robolocks_battle_runtime_action_unit_id", "number", ["number", "number"]);
  const actionType = module.cwrap("robolocks_battle_runtime_action_type", "string", ["number", "number"]);
  const actionChannel = module.cwrap("robolocks_battle_runtime_action_channel", "string", ["number", "number"]);
  const actionHasPosition = module.cwrap("robolocks_battle_runtime_action_has_position", "number", ["number", "number"]);
  const actionPositionX = module.cwrap("robolocks_battle_runtime_action_position_x", "number", ["number", "number"]);
  const actionPositionY = module.cwrap("robolocks_battle_runtime_action_position_y", "number", ["number", "number"]);
  const actionHasTarget = module.cwrap("robolocks_battle_runtime_action_has_target", "number", ["number", "number"]);
  const actionTargetX = module.cwrap("robolocks_battle_runtime_action_target_x", "number", ["number", "number"]);
  const actionTargetY = module.cwrap("robolocks_battle_runtime_action_target_y", "number", ["number", "number"]);
  const actionHasMinHitChance = module.cwrap("robolocks_battle_runtime_action_has_min_hit_chance", "number", ["number", "number"]);
  const actionMinHitChance = module.cwrap("robolocks_battle_runtime_action_min_hit_chance", "number", ["number", "number"]);
  const actionHasScanArc = module.cwrap("robolocks_battle_runtime_action_has_scan_arc", "number", ["number", "number"]);
  const actionCenterDeg = module.cwrap("robolocks_battle_runtime_action_center_deg", "number", ["number", "number"]);
  const actionWidthDeg = module.cwrap("robolocks_battle_runtime_action_width_deg", "number", ["number", "number"]);
  const handle = createRuntime();

  return {
    staticObstacles(): StaticObstacleFrame[] {
      const obstacles: StaticObstacleFrame[] = [];
      for (let i = 0; i < obstacleCount(handle); i += 1) {
        obstacles.push({
          id: obstacleId(handle, i),
          position: { x: obstacleX(handle, i), y: obstacleY(handle, i) },
          radiusM: obstacleRadius(handle, i),
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
        hullHeadingDeg: hullHeading(runtimeHandle, i),
        turretHeadingDeg: turretHeading(runtimeHandle, i),
        armorIntegrity: unitArmor(runtimeHandle, i),
        weaponCooldownTicks: weaponCooldown(runtimeHandle, i),
        bodyShape: readBodyShape(runtimeHandle, i, bodyShapeType, bodyRadius, bodyLength, bodyWidth),
        modules: defaultModules(),
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
        actionCenterDeg,
        actionWidthDeg,
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
        remainingM: mobilityIntentRemaining(runtimeHandle, unitIndex),
        ageTicks: mobilityIntentAge(runtimeHandle, unitIndex),
      },
      turret: {
        active: turretIntentActive(runtimeHandle, unitIndex) !== 0,
        target: {
          x: turretIntentTargetX(runtimeHandle, unitIndex),
          y: turretIntentTargetY(runtimeHandle, unitIndex),
        },
        errorDeg: turretIntentError(runtimeHandle, unitIndex),
        ageTicks: turretIntentAge(runtimeHandle, unitIndex),
      },
      hull: {
        active: hullIntentActive(runtimeHandle, unitIndex) !== 0,
        target: {
          x: hullIntentTargetX(runtimeHandle, unitIndex),
          y: hullIntentTargetY(runtimeHandle, unitIndex),
        },
        errorDeg: hullIntentError(runtimeHandle, unitIndex),
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

async function createWasmPresetDuel(): Promise<KernelMatch> {
  return createPresetDuelFromWasmFactory();
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
    });
  }
  return events;
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
): ProjectileFrame[] {
  const projectiles: ProjectileFrame[] = [];
  for (let i = 0; i < projectileCount(handle); i += 1) {
    projectiles.push({
      projectileId: projectileId(handle, i),
      ownerUnitId: projectileOwnerUnitId(handle, i),
      previousPosition: { x: projectilePreviousX(handle, i), y: projectilePreviousY(handle, i) },
      position: { x: projectileX(handle, i), y: projectileY(handle, i) },
      radiusM: projectileRadius(handle, i),
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
  actionCenterDeg: (handle: number, actionIndex: number) => number,
  actionWidthDeg: (handle: number, actionIndex: number) => number,
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
      action.centerDeg = actionCenterDeg(handle, i);
      action.widthDeg = actionWidthDeg(handle, i);
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
  const radiusM = bodyRadius(handle, unitIndex);
  if (bodyShapeType(handle, unitIndex) === 1) {
    return {
      type: "box",
      radiusM,
      lengthM: bodyLength(handle, unitIndex),
      widthM: bodyWidth(handle, unitIndex),
    };
  }

  return {
    type: "circle",
    radiusM,
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
    mobility: { active: false, target: zero, remainingM: 0, ageTicks: 0 },
    turret: { active: false, target: zero, errorDeg: 0, ageTicks: 0 },
    hull: { active: false, target: zero, errorDeg: 0, ageTicks: 0 },
    weapon: { active: false, minHitChance: 0, ageTicks: 0 },
  };
}

function defaultModules(): UnitModulesFrame {
  return {
    mobility: { id: "tracked_chassis_mk1", maxSpeedMps: 6, maxHullTurnDegps: 120 },
    turret: { id: "light_turret_mk1", maxTurnDegps: 180 },
    weapon: { id: "cannon_75mm_mk1", damage: 25, rangeM: 80, muzzleVelocityMps: 620, projectileRadiusM: 0.08, aimToleranceDeg: 5, reloadTicks: 30 },
    armor: { id: "rolled_armor_mk1", integrity: 100 },
    body: { id: "medium_hull_mk1", massKg: 30000 },
    sensor: { id: "visual_optic_mk1", rangeM: 60, fovDeg: 120, refreshTicks: 1 },
  };
}

export function createFallbackPresetDuel(): KernelMatch {
  let tick = 0;
  const units: InternalUnit[] = [
    { unitId: 1, name: "Blue", position: { x: 6, y: 12 }, hullHeadingDeg: 0, turretHeadingDeg: 0, armorIntegrity: 100, weaponCooldownTicks: 0, bodyShape: { type: "box", radiusM: 1.2, lengthM: 5.6, widthM: 2.8 }, modules: defaultModules(), intents: defaultIntents(), target: { x: 17, y: 12 }, speed: 0.2 },
    { unitId: 2, name: "Red", position: { x: 34, y: 12 }, hullHeadingDeg: 0, turretHeadingDeg: 0, armorIntegrity: 100, weaponCooldownTicks: 0, bodyShape: { type: "box", radiusM: 1.2, lengthM: 5.6, widthM: 2.8 }, modules: defaultModules(), intents: defaultIntents(), target: { x: 23, y: 12 }, speed: 0.2 },
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
          hullHeadingDeg: unit.hullHeadingDeg,
          turretHeadingDeg: unit.turretHeadingDeg,
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
          hullHeadingDeg: 0,
          turretHeadingDeg: 0,
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
