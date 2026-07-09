import assert from "node:assert/strict";
import test from "node:test";

import {
  RESEARCH_BOT_LOGIC_PRESETS,
  createResearchBattleConfigJson,
  createResearchSetupReplay,
  runResearchInBrowser,
} from "../src/research/research.ts";

test("browser research run drives a WASM runner with a browser bot runtime", async () => {
  const observedBotSources = [];
  const onTickCalls = [];
  let destroyedRuntime = false;
  let destroyedRunner = false;
  let receivedBattleConfigJson = "";
  const battleConfigJson = createResearchBattleConfigJson({
    battlePresetId: "open_range",
    rulePresetId: "capture_alpha",
    unitPresetId: "ballistic_test",
  });

  const result = await runResearchInBrowser({
    battleConfigJson,
    botSource: RESEARCH_BOT_LOGIC_PRESETS[1].source,
    tickCount: 2,
    createBotRuntime: async (botSource) => {
      observedBotSources.push(botSource);
      return {
        onTick(observation) {
          onTickCalls.push(observation);
          return {
            orders: [
              { type: "moveTo", position: { x: 12, y: 7 } },
            ],
          };
        },
        drainLogs() {
          return [{ stream: "stdout", message: `tick ${onTickCalls.length}` }];
        },
        destroy() {
          destroyedRuntime = true;
        },
      };
    },
    createRunner: async ({ battleConfigJson: runnerBattleConfigJson, onTick }) => {
      receivedBattleConfigJson = runnerBattleConfigJson;
      let tick = 0;
      return {
        staticObstacles() {
          return [
            {
              id: "research_cover",
              position: { x: 20, y: 6 },
              radiusMeters: 1.5,
              blocksMovement: true,
              blocksLineOfSight: true,
            },
          ];
        },
        snapshot() {
          return frame(tick);
        },
        step() {
          tick += 1;
          onTick({ selfId: 1, tick, contacts: { units: [], obstacles: [], projectiles: [] } });
          return frame(tick);
        },
        destroy() {
          destroyedRunner = true;
        },
      };
    },
  });

  const replay = result.replay;
  const receivedConfig = JSON.parse(receivedBattleConfigJson);
  assert.equal(observedBotSources.length, 2);
  assert.match(observedBotSources[0], /def on_tick/);
  assert.match(observedBotSources[1], /def on_tick/);
  assert.equal(receivedConfig.battleId, "research_open_range_ballistic_test_capture_alpha");
  assert.equal(receivedConfig.obstacles.length, 0);
  assert.equal(receivedConfig.units[0].modules.weapon.fireMode, "ballistic");
  assert.equal(receivedConfig.units[0].modules.weapon.blastRadiusMeters, 2.5);
  assert.equal(receivedConfig.rule.mode, "capture_point");
  assert.equal(receivedConfig.rule.captureZones[0].id, "alpha");
  assert.equal(receivedConfig.rule.captureZones[0].holdTicks, 90);
  assert.equal(receivedConfig.rule.respawn.spawnPoints[0].position.x, 5);
  assert.equal(receivedConfig.rule.respawn.spawnPoints[1].headingDegrees, 180);
  assert.equal(replay.type, "robolocks.replay.v1");
  assert.equal(replay.tickRate, 30);
  assert.equal(replay.obstacles[0].id, "research_cover");
  assert.equal(replay.frames.length, 3);
  assert.equal(replay.frames[0].tick, 0);
  assert.equal(replay.frames[2].tick, 2);
  assert.deepEqual(onTickCalls.map((call) => call.tick), [1, 2]);
  assert.deepEqual(result.logs, [
    { tick: 1, unitId: 1, stream: "stdout", message: "tick 1" },
    { tick: 1, unitId: 2, stream: "stdout", message: "tick 1" },
    { tick: 2, unitId: 1, stream: "stdout", message: "tick 2" },
    { tick: 2, unitId: 2, stream: "stdout", message: "tick 2" },
  ]);
  assert.equal(destroyedRunner, true);
  assert.equal(destroyedRuntime, true);
});

test("browser research run routes ticks and logs per bot id", async () => {
  const runtimeSources = [];
  const callsByBot = [];
  const destroyed = [];
  const battleConfigJson = createResearchBattleConfigJson({
    battlePresetId: "open_range",
    rulePresetId: "kill_limit_team",
    unitPresetId: "standard_tank",
  });

  const result = await runResearchInBrowser({
    botSource: "fallback",
    botSourcesByUnit: {
      1: "blue source",
      2: "red source",
    },
    battleConfigJson,
    tickCount: 1,
    createBotRuntime: async (botSource) => {
      const runtimeIndex = runtimeSources.length;
      runtimeSources.push(botSource);
      return {
        onTick(observation) {
          callsByBot.push({ runtimeIndex, botId: observation.botId });
          return { orders: [] };
        },
        drainLogs() {
          return [{ stream: "stdout", message: `runtime ${runtimeIndex}` }];
        },
        destroy() {
          destroyed.push(runtimeIndex);
        },
      };
    },
    createRunner: async ({ onTick }) => {
      let tick = 0;
      return {
        staticObstacles() {
          return [];
        },
        snapshot() {
          return frame(tick);
        },
        step() {
          tick += 1;
          onTick({ selfId: 1, botId: 1, tick });
          onTick({ selfId: 2, botId: 2, tick });
          return frame(tick);
        },
        destroy() {},
      };
    },
  });

  assert.deepEqual(runtimeSources, ["blue source", "red source"]);
  assert.deepEqual(callsByBot, [
    { runtimeIndex: 0, botId: 1 },
    { runtimeIndex: 1, botId: 2 },
  ]);
  assert.deepEqual(result.logs, [
    { tick: 1, unitId: 1, stream: "stdout", message: "runtime 0" },
    { tick: 1, unitId: 2, stream: "stdout", message: "runtime 1" },
  ]);
  assert.deepEqual(destroyed, [0, 1]);
});

test("bot logic presets expose empty, built-in, and custom choices", () => {
  assert.deepEqual(RESEARCH_BOT_LOGIC_PRESETS.map((preset) => preset.id), [
    "empty",
    "advance_fire",
    "hold_line",
    "kite",
    "custom",
  ]);
  assert.equal(RESEARCH_BOT_LOGIC_PRESETS[0].source, "");
  assert.match(RESEARCH_BOT_LOGIC_PRESETS[1].source, /def on_tick/);
  assert.match(RESEARCH_BOT_LOGIC_PRESETS[2].source, /Hold a central firing line/);
  assert.equal(RESEARCH_BOT_LOGIC_PRESETS.at(-1).source, "");
});

test("createResearchSetupReplay builds a paused one-frame replay from battle config", () => {
  const battleConfigJson = createResearchBattleConfigJson({
    battlePresetId: "open_range",
    rulePresetId: "kill_limit_team",
    unitPresetId: "heavy_gunner",
  });

  const replay = createResearchSetupReplay(battleConfigJson);
  const frame = replay.frames[0];

  assert.equal(replay.type, "robolocks.replay.v1");
  assert.equal(replay.tickRate, 30);
  assert.equal(replay.frames.length, 1);
  assert.equal(frame.tick, 0);
  assert.equal(frame.units.length, 2);
  assert.equal(frame.units[0].name, "Blue");
  assert.equal(frame.units[0].position.x, 5);
  assert.equal(frame.units[0].armorIntegrity, frame.units[0].modules.armor.integrity);
  assert.equal(frame.units[0].modules.weapon.id, "heavy_cannon_v0");
  assert.equal(frame.units[1].name, "Target");
  assert.equal(frame.actions.length, 0);
  assert.equal(frame.events.length, 0);
  assert.equal(frame.projectiles.length, 0);
  assert.equal(frame.ruleState.scores.length, 2);
});

test("standard research weapon can penetrate the fixed target front armor", () => {
  const config = JSON.parse(createResearchBattleConfigJson({
    battlePresetId: "open_range",
    rulePresetId: "kill_limit_team",
    unitPresetId: "standard_tank",
  }));

  assert.ok(
    config.units[0].modules.weapon.penetrationMillimeters >= config.units[1].modules.armor.frontMillimeters,
    "standard research weapon should damage default target on a frontal hit",
  );
});

test("createResearchBattleConfigJson selects timed rule preset", () => {
  const config = JSON.parse(createResearchBattleConfigJson({
    battlePresetId: "close_cover",
    rulePresetId: "timed_team",
    unitPresetId: "scout_optics",
  }));

  assert.equal(config.battleId, "research_close_cover_scout_optics_timed_team");
  assert.equal(config.rule.mode, "timed_deathmatch");
  assert.equal(config.rule.teamMode, "team");
  assert.equal(config.rule.timeLimitTicks, 300);
  assert.equal(config.rule.respawn.enabled, true);
  assert.equal(config.rule.respawn.spawnPoints[0].position.x, 9);
  assert.equal(config.rule.respawn.spawnPoints[1].position.y, 16);
  assert.equal(config.units[0].modules.sensor.id, "wide_optic_v0");
});

function frame(tick) {
  return {
    tick,
    units: [],
    projectiles: [],
    events: [],
    actions: [],
  };
}
