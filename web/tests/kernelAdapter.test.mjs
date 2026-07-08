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

test("wasm preset duel adapter reads unit intents from the C API", async () => {
  const calls = new Map([
    ["robolocks_battle_runner_create_preset_duel", () => 99],
    ["robolocks_battle_runner_destroy", () => undefined],
    ["robolocks_battle_runner_step", () => undefined],
    ["robolocks_battle_runner_tick", () => 7],
    ["robolocks_battle_runner_unit_count", () => 1],
    ["robolocks_battle_runner_unit_id", () => 1],
    ["robolocks_battle_runner_unit_x", () => 6.2],
    ["robolocks_battle_runner_unit_y", () => 12],
    ["robolocks_battle_runner_unit_hull_heading_deg", () => 0],
    ["robolocks_battle_runner_unit_turret_heading_deg", () => 4],
    ["robolocks_battle_runner_unit_armor", () => 75],
    ["robolocks_battle_runner_unit_weapon_cooldown_ticks", () => 18],
    ["robolocks_battle_runner_unit_body_shape_type", () => 1],
    ["robolocks_battle_runner_unit_body_radius_m", () => 1.2],
    ["robolocks_battle_runner_unit_body_length_m", () => 5.6],
    ["robolocks_battle_runner_unit_body_width_m", () => 2.8],
    ["robolocks_battle_runner_unit_mobility_intent_active", () => 1],
    ["robolocks_battle_runner_unit_mobility_intent_target_x", () => 17],
    ["robolocks_battle_runner_unit_mobility_intent_target_y", () => 12],
    ["robolocks_battle_runner_unit_mobility_intent_remaining_m", () => 10.8],
    ["robolocks_battle_runner_unit_mobility_intent_age_ticks", () => 3],
    ["robolocks_battle_runner_unit_turret_intent_active", () => 1],
    ["robolocks_battle_runner_unit_turret_intent_target_x", () => 34],
    ["robolocks_battle_runner_unit_turret_intent_target_y", () => 12],
    ["robolocks_battle_runner_unit_turret_intent_error_deg", () => 1.25],
    ["robolocks_battle_runner_unit_turret_intent_age_ticks", () => 4],
    ["robolocks_battle_runner_unit_hull_intent_active", () => 1],
    ["robolocks_battle_runner_unit_hull_intent_target_x", () => 34],
    ["robolocks_battle_runner_unit_hull_intent_target_y", () => 12],
    ["robolocks_battle_runner_unit_hull_intent_error_deg", () => 2.5],
    ["robolocks_battle_runner_unit_hull_intent_age_ticks", () => 5],
    ["robolocks_battle_runner_unit_weapon_intent_active", () => 1],
    ["robolocks_battle_runner_unit_weapon_intent_min_hit_chance", () => 0.6],
    ["robolocks_battle_runner_unit_weapon_intent_age_ticks", () => 6],
    ["robolocks_battle_runner_obstacle_count", () => 1],
    ["robolocks_battle_runner_obstacle_id", () => "north_cover"],
    ["robolocks_battle_runner_obstacle_x", () => 20],
    ["robolocks_battle_runner_obstacle_y", () => 6],
    ["robolocks_battle_runner_obstacle_radius_m", () => 1.5],
    ["robolocks_battle_runner_obstacle_blocks_movement", () => 1],
    ["robolocks_battle_runner_obstacle_blocks_line_of_sight", () => 1],
    ["robolocks_battle_runner_event_count", () => 0],
    ["robolocks_battle_runner_action_count", () => 0],
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

  assert.equal(frame.tick, 7);
  assert.equal(obstacles[0].id, "north_cover");
  assert.deepEqual(obstacles[0].position, { x: 20, y: 6 });
  assert.equal(frame.units[0].weaponCooldownTicks, 18);
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

  runner.destroy();
});

test("wasm research duel adapter lets the battle runner call a JSON bot callback", async () => {
  let registeredCallback = null;
  let registeredReleaseCallback = null;
  let releasedPointer = 0;
  let nextPointer = 1000;
  const stringsByPointer = new Map([
    [444, JSON.stringify({ selfId: 1, tick: 9, contacts: [] })],
  ]);
  const allocations = [];
  const calls = new Map([
    ["robolocks_battle_runner_set_json_bot_callback", (callbackPointer, releaseCallbackPointer) => {
      registeredCallback = callbackPointer;
      registeredReleaseCallback = releaseCallbackPointer;
    }],
    ["robolocks_battle_runner_create_research_duel_with_json_bot", () => 77],
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

  assert.equal(received.length, 1);
  assert.equal(received[0].selfId, 1);
  assert.equal(received[0].tick, 9);
  assert.equal(allocations.length, 1);
  assert.equal(releasedPointer, allocations[0]);
  assert.equal(stringsByPointer.has(releasedPointer), false);
});
