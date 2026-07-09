import assert from "node:assert/strict";
import test from "node:test";

import {
  createFallbackPresetDuel,
  createPresetDuelFromWasmFactory,
  createResearchDuelWithJsonBotFromWasmFactory,
} from "../src/sim/kernelAdapter.ts";

test("preset duel keeps both units visible at the end of the run", () => {
  const runner = createFallbackPresetDuel();
  let frame;

  for (let i = 0; i < 120; i += 1) {
    frame = runner.step();
  }

  assert.equal(frame.units.length, 2);
  assert.notDeepEqual(frame.units[0].position, frame.units[1].position);
});

test("wasm JSON battle adapter reads unit intents from the C API", async () => {
  let receivedConfig = "";
  const calls = new Map([
    ["robolocks_battle_runner_create_from_json", (jsonConfig) => {
      receivedConfig = jsonConfig;
      return 99;
    }],
    ["robolocks_battle_runner_destroy", () => undefined],
    ["robolocks_battle_runner_step", () => undefined],
    ["robolocks_battle_runner_tick", () => 7],
    ["robolocks_battle_runner_unit_count", () => 1],
    ["robolocks_battle_runner_unit_id", () => 1],
    ["robolocks_battle_runner_unit_x", () => 6.2],
    ["robolocks_battle_runner_unit_y", () => 12],
    ["robolocks_battle_runner_unit_hull_heading", () => 0],
    ["robolocks_battle_runner_unit_turret_heading", () => 4],
    ["robolocks_battle_runner_unit_armor", () => 75],
    ["robolocks_battle_runner_unit_weapon_cooldown", () => 18],
    ["robolocks_battle_runner_unit_body_shape_type", () => 1],
    ["robolocks_battle_runner_unit_body_radius", () => 1.2],
    ["robolocks_battle_runner_unit_body_length", () => 5.6],
    ["robolocks_battle_runner_unit_body_width", () => 2.8],
    ["robolocks_battle_runner_unit_modules_json", () => JSON.stringify({
      mobility: { id: "custom_tracks", maxSpeedMetersPerSecond: 4, maxHullTurnDegreesPerSecond: 90 },
      turret: { id: "slow_turret", maxTurnDegreesPerSecond: 45 },
      weapon: { id: "test_launcher", fireMode: "ballistic", damage: 12, penetrationMillimeters: 30, rangeMeters: 44, muzzleVelocityMetersPerSecond: 50, muzzleOffsetMeters: { x: 2.1, y: 0.2, z: 1.4 }, launchAngleDegrees: 35, gravityMetersPerSecondSquared: 9.81, blastRadiusMeters: 3, projectileRadiusMeters: 0.12, aimToleranceDegrees: 6, reloadTicks: 80 },
      armor: { id: "thin_plate", integrity: 40, frontMillimeters: 30, sideMillimeters: 20, rearMillimeters: 10 },
      body: { id: "light_body", massKilograms: 12000 },
      sensor: { id: "short_range_optic", rangeMeters: 24, fovDegrees: 70, refreshTicks: 2 },
    })],
    ["robolocks_battle_runner_unit_mobility_intent_active", () => 1],
    ["robolocks_battle_runner_unit_mobility_intent_target_x", () => 17],
    ["robolocks_battle_runner_unit_mobility_intent_target_y", () => 12],
    ["robolocks_battle_runner_unit_mobility_intent_remaining", () => 10.8],
    ["robolocks_battle_runner_unit_mobility_intent_age", () => 3],
    ["robolocks_battle_runner_unit_turret_intent_active", () => 1],
    ["robolocks_battle_runner_unit_turret_intent_target_x", () => 34],
    ["robolocks_battle_runner_unit_turret_intent_target_y", () => 12],
    ["robolocks_battle_runner_unit_turret_intent_error", () => 1.25],
    ["robolocks_battle_runner_unit_turret_intent_age", () => 4],
    ["robolocks_battle_runner_unit_hull_intent_active", () => 1],
    ["robolocks_battle_runner_unit_hull_intent_target_x", () => 34],
    ["robolocks_battle_runner_unit_hull_intent_target_y", () => 12],
    ["robolocks_battle_runner_unit_hull_intent_error", () => 2.5],
    ["robolocks_battle_runner_unit_hull_intent_age", () => 5],
    ["robolocks_battle_runner_unit_weapon_intent_active", () => 1],
    ["robolocks_battle_runner_unit_weapon_intent_min_hit_chance", () => 0.6],
    ["robolocks_battle_runner_unit_weapon_intent_age", () => 6],
    ["robolocks_battle_runner_obstacle_count", () => 1],
    ["robolocks_battle_runner_obstacle_id", () => "north_cover"],
    ["robolocks_battle_runner_obstacle_x", () => 20],
    ["robolocks_battle_runner_obstacle_y", () => 6],
    ["robolocks_battle_runner_obstacle_radius", () => 1.5],
    ["robolocks_battle_runner_obstacle_blocks_movement", () => 1],
    ["robolocks_battle_runner_obstacle_blocks_line_of_sight", () => 1],
    ["robolocks_battle_runner_event_count", () => 1],
    ["robolocks_battle_runner_event_tick", () => 7],
    ["robolocks_battle_runner_event_unit_id", () => 2],
    ["robolocks_battle_runner_event_code", () => "armor_damage"],
    ["robolocks_battle_runner_event_message", () => "Projectile penetrated front armor."],
    ["robolocks_battle_runner_event_projectile_id", () => 42],
    ["robolocks_battle_runner_event_source_unit_id", () => 1],
    ["robolocks_battle_runner_event_target_unit_id", () => 2],
    ["robolocks_battle_runner_event_source_team_id", () => 1],
    ["robolocks_battle_runner_event_target_team_id", () => 2],
    ["robolocks_battle_runner_event_damage_type", () => "direct"],
    ["robolocks_battle_runner_event_armor_facing", () => "front"],
    ["robolocks_battle_runner_event_damage", () => 37.5],
    ["robolocks_battle_runner_event_remaining_armor", () => 62.5],
    ["robolocks_battle_runner_event_penetration_millimeters", () => 120],
    ["robolocks_battle_runner_event_armor_millimeters", () => 100],
    ["robolocks_battle_runner_event_impact_distance_meters", () => 0],
    ["robolocks_battle_runner_event_blast_radius_meters", () => 0],
    ["robolocks_battle_runner_action_count", () => 0],
    ["robolocks_battle_runner_score_count", () => 2],
    ["robolocks_battle_runner_score_unit_id", (_handle, index) => index + 1],
    ["robolocks_battle_runner_score_team_id", (_handle, index) => index + 1],
    ["robolocks_battle_runner_score_kills", (_handle, index) => index === 0 ? 1 : 0],
    ["robolocks_battle_runner_score_deaths", (_handle, index) => index === 1 ? 1 : 0],
    ["robolocks_battle_runner_score_damage_dealt", (_handle, index) => index === 0 ? 37.5 : 0],
    ["robolocks_battle_runner_capture_zone_count", () => 1],
    ["robolocks_battle_runner_capture_zone_id", () => "alpha"],
    ["robolocks_battle_runner_capture_zone_x", () => 20],
    ["robolocks_battle_runner_capture_zone_y", () => 12],
    ["robolocks_battle_runner_capture_zone_radius", () => 4],
    ["robolocks_battle_runner_capture_zone_hold_ticks_required", () => 90],
    ["robolocks_battle_runner_capture_zone_held_ticks", () => 12],
    ["robolocks_battle_runner_capture_zone_owner_unit_id", () => 1],
    ["robolocks_battle_runner_capture_zone_owner_team_id", () => 1],
    ["robolocks_battle_runner_capture_zone_contested", () => 0],
    ["robolocks_battle_runner_outcome_finished", () => 1],
    ["robolocks_battle_runner_outcome_reason", () => "kill_limit"],
    ["robolocks_battle_runner_outcome_winner_unit_id", () => 0],
    ["robolocks_battle_runner_outcome_winner_team_id", () => 1],
  ]);
  const factory = async () => ({
    cwrap(name, returnType) {
      const fn = calls.get(name);
      if (fn) {
        return fn;
      }
      return returnType === "string" ? () => "" : () => 0;
    },
  });

  const runner = await createPresetDuelFromWasmFactory(factory);
  const frame = runner.snapshot();
  const obstacles = runner.staticObstacles();

  assert.equal(JSON.parse(receivedConfig).battleId, "live_sandbox_v0");
  assert.equal(frame.tick, 7);
  assert.equal(obstacles[0].id, "north_cover");
  assert.deepEqual(obstacles[0].position, { x: 20, y: 6 });
  assert.equal(frame.units[0].weaponCooldownTicks, 18);
  assert.equal(frame.units[0].modules.mobility.id, "custom_tracks");
  assert.equal(frame.units[0].modules.weapon.fireMode, "ballistic");
  assert.equal(frame.units[0].modules.weapon.muzzleOffsetMeters.x, 2.1);
  assert.equal(frame.units[0].modules.sensor.rangeMeters, 24);
  assert.equal(frame.units[0].intents.mobility.active, true);
  assert.deepEqual(frame.units[0].intents.mobility.target, { x: 17, y: 12 });
  assert.equal(frame.units[0].intents.mobility.remainingMeters, 10.8);
  assert.equal(frame.units[0].intents.mobility.ageTicks, 3);
  assert.equal(frame.units[0].intents.turret.errorDegrees, 1.25);
  assert.equal(frame.units[0].intents.turret.ageTicks, 4);
  assert.equal(frame.units[0].intents.hull.errorDegrees, 2.5);
  assert.equal(frame.units[0].intents.hull.ageTicks, 5);
  assert.equal(frame.units[0].intents.weapon.active, true);
  assert.equal(frame.units[0].intents.weapon.minHitChance, 0.6);
  assert.equal(frame.units[0].intents.weapon.ageTicks, 6);
  assert.equal(frame.events[0].code, "armor_damage");
  assert.equal(frame.events[0].payload.projectileId, 42);
  assert.equal(frame.events[0].payload.sourceUnitId, 1);
  assert.equal(frame.events[0].payload.targetUnitId, 2);
  assert.equal(frame.events[0].payload.damageType, "direct");
  assert.equal(frame.events[0].payload.damage, 37.5);
  assert.equal(frame.events[0].payload.remainingArmor, 62.5);
  assert.equal(frame.ruleState.scores.length, 2);
  assert.equal(frame.ruleState.scores[0].kills, 1);
  assert.equal(frame.ruleState.scores[1].deaths, 1);
  assert.equal(frame.ruleState.captureZones[0].id, "alpha");
  assert.equal(frame.ruleState.captureZones[0].heldTicks, 12);
  assert.equal(frame.ruleState.captureZones[0].ownerTeamId, 1);
  assert.equal(frame.ruleState.outcome.finished, true);
  assert.equal(frame.ruleState.outcome.reason, "kill_limit");
  assert.equal(frame.ruleState.outcome.winnerTeamId, 1);

  runner.destroy();
});

test("wasm research duel adapter lets the battle runner call a JSON bot callback", async () => {
  let registeredCallback = null;
  let registeredReleaseCallback = null;
  let releasedPointer = 0;
  let nextPointer = 1000;
  const stringsByPointer = new Map([
    [333, JSON.stringify({ type: "start", spec: { unitId: 1 } })],
    [444, JSON.stringify({ selfId: 1, tick: 9, contacts: { units: [], obstacles: [], projectiles: [] } })],
  ]);
  let receivedConfig = "";
  const allocations = [];
  const calls = new Map([
    ["robolocks_battle_runner_set_json_bot_callback", (callbackPointer, releaseCallbackPointer) => {
      registeredCallback = callbackPointer;
      registeredReleaseCallback = releaseCallbackPointer;
    }],
    ["robolocks_battle_runner_create_from_json", (jsonConfig) => {
      receivedConfig = jsonConfig;
      const responsePointer = registeredCallback(1, 333, 0);
      registeredReleaseCallback(responsePointer, 0);
      return 77;
    }],
    ["robolocks_battle_runner_destroy", () => undefined],
    ["robolocks_battle_runner_step", () => {
      const responsePointer = registeredCallback(1, 444, 0);
      registeredReleaseCallback(responsePointer, 0);
      releasedPointer = responsePointer;
    }],
    ["robolocks_battle_runner_tick", () => 1],
    ["robolocks_battle_runner_unit_count", () => 0],
    ["robolocks_battle_runner_obstacle_count", () => 0],
    ["robolocks_battle_runner_event_count", () => 0],
    ["robolocks_battle_runner_projectile_count", () => 0],
    ["robolocks_battle_runner_action_count", () => 0],
  ]);
  const factory = async () => ({
    UTF8ToString(pointer) {
      return stringsByPointer.get(pointer) ?? "";
    },
    lengthBytesUTF8(value) {
      return Buffer.byteLength(value, "utf8");
    },
    stringToUTF8(value, pointer) {
      stringsByPointer.set(pointer, value);
    },
    _malloc(byteLength) {
      const pointer = nextPointer;
      nextPointer += byteLength + 1;
      allocations.push(pointer);
      return pointer;
    },
    _free(pointer) {
      stringsByPointer.delete(pointer);
    },
    addFunction(fn) {
      return fn;
    },
    removeFunction() {},
    cwrap(name, returnType) {
      const fn = calls.get(name);
      if (fn) {
        return fn;
      }
      return returnType === "string" ? () => "" : () => 0;
    },
  });

  const received = [];
  const runner = await createResearchDuelWithJsonBotFromWasmFactory({
    botId: 1,
    battleConfigJson: JSON.stringify({
      battleId: "callback_research",
      units: [{ unitId: 1, name: "Blue", modules: {}, spawn: { x: 0, y: 0, headingDeg: 0 } }],
      controllers: [{ unitId: 1, type: "json_callback" }],
    }),
    onTick(observation) {
      received.push(observation);
      return {
        orders: [
          { type: "moveTo", position: { x: 12, y: 7 } },
        ],
      };
    },
    factory,
  });

  runner.step();
  runner.destroy();

  assert.equal(received.length, 2);
  assert.equal(received[0].type, "start");
  assert.equal(received[0].spec.unitId, 1);
  assert.equal(received[1].selfId, 1);
  assert.equal(received[1].tick, 9);
  assert.equal(JSON.parse(receivedConfig).battleId, "callback_research");
  assert.equal(allocations.length, 2);
  assert.equal(releasedPointer, allocations[1]);
  assert.equal(stringsByPointer.has(releasedPointer), false);
});

test("wasm research duel adapter can create a runner from injected battle config JSON", async () => {
  let registeredCallback = null;
  let registeredReleaseCallback = null;
  let receivedConfig = "";
  let nextPointer = 1000;
  const stringsByPointer = new Map([
    [444, JSON.stringify({ selfId: 1, tick: 1, contacts: { units: [], obstacles: [], projectiles: [] } })],
  ]);
  const calls = new Map([
    ["robolocks_battle_runner_set_json_bot_callback", (callbackPointer, releaseCallbackPointer) => {
      registeredCallback = callbackPointer;
      registeredReleaseCallback = releaseCallbackPointer;
    }],
    ["robolocks_battle_runner_create_from_json", (jsonConfig) => {
      receivedConfig = jsonConfig;
      return 88;
    }],
    ["robolocks_battle_runner_destroy", () => undefined],
    ["robolocks_battle_runner_step", () => {
      const responsePointer = registeredCallback(1, 444, 0);
      registeredReleaseCallback(responsePointer, 0);
    }],
    ["robolocks_battle_runner_tick", () => 1],
    ["robolocks_battle_runner_unit_count", () => 0],
    ["robolocks_battle_runner_obstacle_count", () => 0],
    ["robolocks_battle_runner_event_count", () => 0],
    ["robolocks_battle_runner_projectile_count", () => 0],
    ["robolocks_battle_runner_action_count", () => 0],
  ]);
  const factory = async () => ({
    UTF8ToString(pointer) {
      return stringsByPointer.get(pointer) ?? "";
    },
    lengthBytesUTF8(value) {
      return Buffer.byteLength(value, "utf8");
    },
    stringToUTF8(value, pointer) {
      stringsByPointer.set(pointer, value);
    },
    _malloc(byteLength) {
      const pointer = nextPointer;
      nextPointer += byteLength + 1;
      return pointer;
    },
    _free(pointer) {
      stringsByPointer.delete(pointer);
    },
    addFunction(fn) {
      return fn;
    },
    removeFunction() {},
    cwrap(name, returnType) {
      const fn = calls.get(name);
      if (fn) {
        return fn;
      }
      return returnType === "string" ? () => "" : () => 0;
    },
  });

  const runner = await createResearchDuelWithJsonBotFromWasmFactory({
    botId: 1,
    battleConfigJson: JSON.stringify({
      battleId: "injected_research",
      units: [{ unitId: 1, name: "Injected", modules: {}, spawn: { x: 0, y: 0, headingDeg: 0 } }],
      controllers: [{ unitId: 1, type: "json_callback" }],
    }),
    onTick() {
      return { orders: [] };
    },
    factory,
  });

  runner.step();
  runner.destroy();

  assert.equal(JSON.parse(receivedConfig).battleId, "injected_research");
});
