import assert from "node:assert/strict";
import test from "node:test";

import {
  RESEARCH_BOT_LOGIC_PRESETS,
  RESEARCH_BATTLE_PRESETS,
  RESEARCH_RULE_PRESETS,
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
  assert.deepEqual(receivedConfig.rule.respawn.spawnPoints[0].position, RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === "open_range").blueRespawnZone.position);
  assert.equal(receivedConfig.rule.respawn.spawnPoints[1].headingDegrees, RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === "open_range").targetRespawnZone.headingDeg);
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
    "charger",
    "skirmisher",
    "orbiter",
    "flanker",
    "evader",
    "custom",
  ]);
  assert.equal(RESEARCH_BOT_LOGIC_PRESETS[0].source, "");
  assert.match(RESEARCH_BOT_LOGIC_PRESETS[1].source, /def on_tick/);
  assert.match(RESEARCH_BOT_LOGIC_PRESETS[3].source, /Orbiter: circle the enemy/);
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
  const openRangePreset = RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === "open_range");
  assert.deepEqual(frame.units[0].position, { x: openRangePreset.blueSpawn.x, y: openRangePreset.blueSpawn.y });
  assert.equal(frame.units[0].armorIntegrity, frame.units[0].modules.armor.integrity);
  assert.equal(frame.units[0].modules.weapon.id, "heavy_cannon_v0");
  assert.equal(frame.units[1].name, "Red");
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
  assert.deepEqual(config.rule.respawn.spawnPoints[0].position, RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === "close_cover").blueRespawnZone.position);
  assert.deepEqual(config.rule.respawn.spawnPoints[1].position, RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === "close_cover").targetRespawnZone.position);
  assert.equal(config.units[0].modules.sensor.id, "wide_optic_v0");
});

test("research battle presets include varied arenas and a flag position", () => {
  assert.deepEqual(RESEARCH_BATTLE_PRESETS.map((preset) => preset.id), [
    "covered_duel",
    "open_range",
    "close_cover",
    "flag_run",
    "brawl_ring",
    "hex_bastion",
  ]);
  assert.deepEqual(RESEARCH_BATTLE_PRESETS.map((preset) => preset.label), [
    "Covered Duel",
    "Open Range",
    "Close Cover",
    "Flag Run",
    "Circular Arena",
    "Polygon Arena",
  ]);
  for (const preset of RESEARCH_BATTLE_PRESETS) {
    assert.equal(typeof preset.flagPosition.x, "number");
    assert.equal(typeof preset.flagPosition.y, "number");
  }
  assert.ok(RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === "brawl_ring").obstacles.length >= 8);
  assert.ok(RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === "hex_bastion").obstacles.length >= 6);
  assert.equal(RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === "brawl_ring").field.shape.type, "circle");
  assert.equal(RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === "hex_bastion").field.shape.type, "polygon");
});

test("research battlefields are large enough to keep spawns clear of shaped boundaries", () => {
  for (const preset of RESEARCH_BATTLE_PRESETS) {
    const width = preset.field.max.x - preset.field.min.x;
    const depth = preset.field.max.y - preset.field.min.y;
    assert.ok(width >= 140, `${preset.id} should be around four times wider than the old small samples`);
    assert.ok(depth >= 105, `${preset.id} should be around four times deeper than the old small samples`);
    assert.ok(spawnIsClearOfBoundary(preset.field, preset.blueSpawn), `${preset.id} blue spawn should not overlap boundary`);
    assert.ok(spawnIsClearOfBoundary(preset.field, preset.targetSpawn), `${preset.id} red spawn should not overlap boundary`);
  }
});

test("research battle presets define separated respawn zones per battlefield", () => {
  for (const preset of RESEARCH_BATTLE_PRESETS) {
    assert.ok(preset.blueRespawnZone.radiusMeters >= 6, `${preset.id} blue respawn zone should be usable`);
    assert.ok(preset.targetRespawnZone.radiusMeters >= 6, `${preset.id} red respawn zone should be usable`);
    assert.ok(spawnIsClearOfBoundary(preset.field, preset.blueRespawnZone.position), `${preset.id} blue respawn zone should sit inside boundary`);
    assert.ok(spawnIsClearOfBoundary(preset.field, preset.targetRespawnZone.position), `${preset.id} red respawn zone should sit inside boundary`);
    assert.ok(distance(preset.blueRespawnZone.position, preset.targetRespawnZone.position) >= 90, `${preset.id} respawn zones should be far apart`);
  }
});

test("capture flag uses the selected battle flag position while deathmatch hides it", () => {
  const captureConfig = JSON.parse(createResearchBattleConfigJson({
    battlePresetId: "flag_run",
    rulePresetId: "capture_alpha",
    unitPresetId: "standard_tank",
  }));
  const battlePreset = RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === "flag_run");
  const captureRule = RESEARCH_RULE_PRESETS.find((preset) => preset.id === "capture_alpha");

  assert.equal(captureRule.label, "Capture Flag");
  assert.deepEqual(captureConfig.rule.captureZones[0].position, battlePreset.flagPosition);

  const captureSetupReplay = createResearchSetupReplay(JSON.stringify(captureConfig));
  assert.deepEqual(captureSetupReplay.frames[0].ruleState.captureZones[0].position, battlePreset.flagPosition);

  const deathmatchConfig = JSON.parse(createResearchBattleConfigJson({
    battlePresetId: "flag_run",
    rulePresetId: "kill_limit_team",
    unitPresetId: "standard_tank",
  }));
  assert.equal(deathmatchConfig.rule.captureZones, undefined);

  const deathmatchSetupReplay = createResearchSetupReplay(JSON.stringify(deathmatchConfig));
  assert.equal(deathmatchSetupReplay.frames[0].ruleState.captureZones.length, 0);
});

test("research replays keep shaped battlefield metadata from the selected preset", async () => {
  const battleConfigJson = createResearchBattleConfigJson({
    battlePresetId: "brawl_ring",
    rulePresetId: "kill_limit_team",
    unitPresetId: "standard_tank",
  });
  const config = JSON.parse(battleConfigJson);
  assert.equal(config.field.shape.type, "circle");

  const setupReplay = createResearchSetupReplay(battleConfigJson);
  assert.equal(setupReplay.frames[0].field.shape.type, "circle");

  const result = await runResearchInBrowser({
    battleConfigJson,
    botSource: "",
    tickCount: 1,
    createBotRuntime: async () => ({ onTick() { return { orders: [] }; } }),
    createRunner: async () => {
      let tick = 0;
      return {
        staticObstacles() {
          return [];
        },
        snapshot() {
          return frame(tick, { field: { min: { x: -12, y: -8 }, max: { x: 52, y: 32 } } });
        },
        step() {
          tick += 1;
          return frame(tick, { field: { min: { x: -12, y: -8 }, max: { x: 52, y: 32 } } });
        },
        destroy() {},
      };
    },
  });

  assert.equal(result.replay.frames[0].field.shape.type, "circle");
  assert.equal(result.replay.frames[1].field.shape.type, "circle");
});

function frame(tick, extra = {}) {
  return {
    tick,
    units: [],
    projectiles: [],
    events: [],
    actions: [],
    ...extra,
  };
}

function spawnIsClearOfBoundary(field, spawn) {
  const clearanceMeters = 8;
  const point = { x: spawn.x, y: spawn.y };
  if (field.shape?.type === "circle") {
    return distance(point, field.shape.center) <= field.shape.radiusMeters - clearanceMeters;
  }
  if (field.shape?.type === "polygon") {
    return pointInPolygon(point, field.shape.vertices) && distanceToPolygon(point, field.shape.vertices) >= clearanceMeters;
  }
  return (
    point.x >= field.min.x + clearanceMeters &&
    point.x <= field.max.x - clearanceMeters &&
    point.y >= field.min.y + clearanceMeters &&
    point.y <= field.max.y - clearanceMeters
  );
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointInPolygon(point, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToPolygon(point, vertices) {
  return Math.min(...vertices.map((start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    return distance(point, closestPointOnSegment(point, start, end));
  }));
}

function closestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return start;
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  return { x: start.x + dx * t, y: start.y + dy * t };
}
