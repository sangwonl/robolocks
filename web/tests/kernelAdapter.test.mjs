import assert from "node:assert/strict";
import test from "node:test";

import {
  createPresetDuelFromWasmFactory,
  createResearchDuelWithJsonBotFromWasmFactory,
} from "../src/sim/kernelAdapter.ts";

test("wasm JSON battle adapter parses the coarse frame JSON from the C API", async () => {
  let receivedConfig = "";
  const frame = {
    tick: 7,
    units: [
      {
        unitId: 1,
        teamId: 1,
        name: "Blue",
        position: { x: 6.2, y: 12 },
        hullHeadingDegrees: 0,
        turretHeadingDegrees: 4,
        armorIntegrity: 75,
        weaponCooldownTicks: 18,
        bodyShape: { type: "box", radiusMeters: 1.2, lengthMeters: 5.6, widthMeters: 2.8 },
        modules: {
          mobility: { id: "custom_tracks", maxSpeedMetersPerSecond: 4, maxHullTurnDegreesPerSecond: 90 },
          turret: { id: "slow_turret", maxTurnDegreesPerSecond: 45 },
          weapon: { id: "test_launcher", fireMode: "ballistic", damage: 12, penetrationMillimeters: 30, rangeMeters: 44, muzzleVelocityMetersPerSecond: 50, muzzleOffsetMeters: { x: 2.1, y: 0.2, z: 1.4 }, launchAngleDegrees: 35, gravityMetersPerSecondSquared: 9.81, blastRadiusMeters: 3, projectileRadiusMeters: 0.12, aimToleranceDegrees: 6, reloadTicks: 80 },
          armor: { id: "thin_plate", integrity: 40, frontMillimeters: 30, sideMillimeters: 20, rearMillimeters: 10 },
          body: { id: "light_body", massKilograms: 12000 },
          sensor: { id: "short_range_optic", rangeMeters: 24, fovDegrees: 70, refreshTicks: 2 },
        },
        intents: {
          mobility: { active: true, target: { x: 17, y: 12 }, remainingMeters: 10.8, ageTicks: 3 },
          turret: { active: true, target: { x: 34, y: 12 }, errorDegrees: 1.25, ageTicks: 4 },
          hull: { active: true, target: { x: 34, y: 12 }, errorDegrees: 2.5, ageTicks: 5 },
          weapon: { active: true, minHitChance: 0.6, ageTicks: 6 },
        },
      },
    ],
    projectiles: [],
    events: [
      {
        tick: 7,
        unitId: 2,
        code: "armor_damage",
        message: "Projectile penetrated front armor.",
        payload: {
          projectileId: 42,
          sourceUnitId: 1,
          targetUnitId: 2,
          sourceTeamId: 1,
          targetTeamId: 2,
          damageType: "direct",
          armorFacing: "front",
          damage: 37.5,
          remainingArmor: 62.5,
          penetrationMillimeters: 120,
          armorMillimeters: 100,
          impactDistanceMeters: 0,
          blastRadiusMeters: 0,
        },
      },
    ],
    actions: [],
    ruleState: {
      scores: [
        { unitId: 1, teamId: 1, kills: 1, deaths: 0, damageDealt: 37.5 },
        { unitId: 2, teamId: 2, kills: 0, deaths: 1, damageDealt: 0 },
      ],
      captureZones: [
        { id: "alpha", position: { x: 20, y: 12 }, radiusMeters: 4, holdTicksRequired: 90, heldTicks: 12, ownerUnitId: 1, ownerTeamId: 1, contested: false },
      ],
      outcome: { finished: true, reason: "kill_limit", winnerUnitId: 0, winnerTeamId: 1 },
    },
  };
  const calls = new Map([
    ["robolocks_battle_runner_create_from_json", (jsonConfig) => {
      receivedConfig = jsonConfig;
      return 99;
    }],
    ["robolocks_battle_runner_destroy", () => undefined],
    ["robolocks_battle_runner_step", () => undefined],
    ["robolocks_battle_runner_frame_json", () => JSON.stringify(frame)],
    ["robolocks_battle_runner_obstacle_count", () => 1],
    ["robolocks_battle_runner_obstacle_id", () => "north_cover"],
    ["robolocks_battle_runner_obstacle_x", () => 20],
    ["robolocks_battle_runner_obstacle_y", () => 6],
    ["robolocks_battle_runner_obstacle_radius", () => 1.5],
    ["robolocks_battle_runner_obstacle_blocks_movement", () => 1],
    ["robolocks_battle_runner_obstacle_blocks_line_of_sight", () => 1],
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
  const stepped = runner.step();
  const obstacles = runner.staticObstacles();

  assert.equal(JSON.parse(receivedConfig).battleId, "live_sandbox_v0");
  assert.equal(stepped.tick, 7);
  assert.equal(obstacles[0].id, "north_cover");
  assert.deepEqual(obstacles[0].position, { x: 20, y: 6 });
  assert.equal(stepped.units[0].name, "Blue");
  assert.equal(stepped.units[0].teamId, 1);
  assert.equal(stepped.units[0].weaponCooldownTicks, 18);
  assert.equal(stepped.units[0].modules.mobility.id, "custom_tracks");
  assert.equal(stepped.units[0].modules.weapon.fireMode, "ballistic");
  assert.equal(stepped.units[0].modules.weapon.muzzleOffsetMeters.x, 2.1);
  assert.equal(stepped.units[0].modules.sensor.rangeMeters, 24);
  assert.equal(stepped.units[0].intents.mobility.active, true);
  assert.deepEqual(stepped.units[0].intents.mobility.target, { x: 17, y: 12 });
  assert.equal(stepped.units[0].intents.mobility.remainingMeters, 10.8);
  assert.equal(stepped.units[0].intents.mobility.ageTicks, 3);
  assert.equal(stepped.units[0].intents.turret.errorDegrees, 1.25);
  assert.equal(stepped.units[0].intents.turret.ageTicks, 4);
  assert.equal(stepped.units[0].intents.hull.errorDegrees, 2.5);
  assert.equal(stepped.units[0].intents.hull.ageTicks, 5);
  assert.equal(stepped.units[0].intents.weapon.active, true);
  assert.equal(stepped.units[0].intents.weapon.minHitChance, 0.6);
  assert.equal(stepped.units[0].intents.weapon.ageTicks, 6);
  assert.equal(stepped.events[0].code, "armor_damage");
  assert.equal(stepped.events[0].payload.projectileId, 42);
  assert.equal(stepped.events[0].payload.sourceUnitId, 1);
  assert.equal(stepped.events[0].payload.targetUnitId, 2);
  assert.equal(stepped.events[0].payload.damageType, "direct");
  assert.equal(stepped.events[0].payload.damage, 37.5);
  assert.equal(stepped.events[0].payload.remainingArmor, 62.5);
  assert.equal(stepped.ruleState.scores.length, 2);
  assert.equal(stepped.ruleState.scores[0].kills, 1);
  assert.equal(stepped.ruleState.scores[1].deaths, 1);
  assert.equal(stepped.ruleState.captureZones[0].id, "alpha");
  assert.equal(stepped.ruleState.captureZones[0].heldTicks, 12);
  assert.equal(stepped.ruleState.captureZones[0].ownerTeamId, 1);
  assert.equal(stepped.ruleState.outcome.finished, true);
  assert.equal(stepped.ruleState.outcome.reason, "kill_limit");
  assert.equal(stepped.ruleState.outcome.winnerTeamId, 1);

  runner.destroy();
});

test("wasm JSON battle adapter falls back to Unit <id> when a unit has no name", async () => {
  const frame = {
    tick: 1,
    units: [
      {
        unitId: 3,
        position: { x: 1, y: 2 },
        hullHeadingDegrees: 0,
        turretHeadingDegrees: 0,
        armorIntegrity: 100,
        bodyShape: { type: "circle", radiusMeters: 1 },
        modules: {},
        intents: {},
      },
    ],
    projectiles: [],
    events: [],
    actions: [],
  };
  const calls = new Map([
    ["robolocks_battle_runner_create_from_json", () => 5],
    ["robolocks_battle_runner_destroy", () => undefined],
    ["robolocks_battle_runner_frame_json", () => JSON.stringify(frame)],
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
  const snapshot = runner.snapshot();
  assert.equal(snapshot.units[0].name, "Unit 3");
  assert.equal(snapshot.units[0].teamId, 0);
  runner.destroy();
});

test("wasm JSON battle adapter surfaces the engine error when creation fails", async () => {
  const calls = new Map([
    ["robolocks_battle_runner_create_from_json", () => 0],
    ["robolocks_last_error", () => "Expected string field: battleId"],
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

  await assert.rejects(
    createPresetDuelFromWasmFactory(factory),
    /Expected string field: battleId/,
  );
});

test("wasm JSON battle adapter falls back to a generic message when creation fails without an error", async () => {
  const calls = new Map([
    ["robolocks_battle_runner_create_from_json", () => 0],
    ["robolocks_last_error", () => ""],
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

  await assert.rejects(
    createPresetDuelFromWasmFactory(factory),
    /battle runner creation failed/,
  );
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
    ["robolocks_battle_runner_frame_json", () => JSON.stringify({ tick: 1, units: [] })],
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
    ["robolocks_battle_runner_frame_json", () => JSON.stringify({ tick: 1, units: [] })],
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
