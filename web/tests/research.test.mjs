import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_BATTLE_ID,
  SAVED_CUSTOM_ID_PREFIX,
  SAVED_BOT_LOGIC_ID_PREFIX,
  isSavedCustomId,
  isSavedBotLogicId,
  RESEARCH_BOT_LOGIC_PRESETS,
  RESEARCH_BATTLE_PRESETS,
  RESEARCH_RULE_PRESETS,
  createResearchBattleConfigJson,
  createResearchSetupReplay,
  layoutFromPreset,
  layoutReducer,
  layoutToBattlePreset,
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
    unitPresetIdByUnit: { 1: "ballistic_test", 2: "ballistic_test" },
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
  assert.equal(receivedConfig.battleId, "research_open_range_ballistic_test_vs_ballistic_test_capture_alpha");
  assert.equal(receivedConfig.obstacles.length, 0);
  assert.equal(receivedConfig.units[0].modules.weapon.fireMode, "ballistic");
  assert.equal(receivedConfig.units[0].modules.weapon.blastRadiusMeters, 2.5);
  assert.equal(receivedConfig.rule.mode, "capture_point");
  assert.equal(receivedConfig.rule.captureZones[0].id, "alpha");
  assert.equal(receivedConfig.rule.captureZones[0].holdTicks, 180);
  assert.deepEqual(receivedConfig.rule.respawn.spawnPoints[0].position, RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === "open_range").blueRespawnZone.position);
  assert.equal(receivedConfig.rule.respawn.spawnPoints[1].headingDegrees, RESEARCH_BATTLE_PRESETS.find((preset) => preset.id === "open_range").targetRespawnZone.headingDeg);
  assert.equal(replay.type, "robolocks.replay.v1");
  assert.equal(replay.tickRate, 60);
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
    unitPresetIdByUnit: { 1: "standard_tank", 2: "standard_tank" },
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
    unitPresetIdByUnit: { 1: "heavy_gunner", 2: "heavy_gunner" },
  });

  const replay = createResearchSetupReplay(battleConfigJson);
  const frame = replay.frames[0];

  assert.equal(replay.type, "robolocks.replay.v1");
  assert.equal(replay.tickRate, 60);
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
    unitPresetIdByUnit: { 1: "standard_tank", 2: "standard_tank" },
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
    unitPresetIdByUnit: { 1: "scout_optics", 2: "scout_optics" },
  }));

  assert.equal(config.battleId, "research_close_cover_scout_optics_vs_scout_optics_timed_team");
  assert.equal(config.rule.mode, "timed_deathmatch");
  assert.equal(config.rule.teamMode, "team");
  assert.equal(config.rule.timeLimitTicks, 600);
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
    unitPresetIdByUnit: { 1: "standard_tank", 2: "standard_tank" },
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
    unitPresetIdByUnit: { 1: "standard_tank", 2: "standard_tank" },
  }));
  assert.equal(deathmatchConfig.rule.captureZones, undefined);

  const deathmatchSetupReplay = createResearchSetupReplay(JSON.stringify(deathmatchConfig));
  assert.equal(deathmatchSetupReplay.frames[0].ruleState.captureZones.length, 0);
});

test("research replays keep shaped battlefield metadata from the selected preset", async () => {
  const battleConfigJson = createResearchBattleConfigJson({
    battlePresetId: "brawl_ring",
    rulePresetId: "kill_limit_team",
    unitPresetIdByUnit: { 1: "standard_tank", 2: "standard_tank" },
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

test("createResearchBattleConfigJson applies per-bot unit presets and rule params", () => {
  const config = JSON.parse(createResearchBattleConfigJson({
    battlePresetId: "open_range",
    rulePresetId: "kill_limit_team",
    unitPresetIdByUnit: { 1: "standard_tank", 2: "heavy_gunner" },
    ruleParams: { killLimit: 7 },
  }));
  // Each bot gets its own module set.
  assert.equal(config.units[0].modules.mobility.id, "tracked_chassis_mk1");
  assert.equal(config.units[1].modules.mobility.id, "heavy_tracks_v0");
  // The active rule's parameter is overridden.
  assert.equal(config.rule.killLimit, 7);
});

test("createResearchBattleConfigJson overrides capture hold ticks", () => {
  const config = JSON.parse(createResearchBattleConfigJson({
    battlePresetId: "flag_run",
    rulePresetId: "capture_alpha",
    unitPresetIdByUnit: { 1: "standard_tank", 2: "standard_tank" },
    ruleParams: { captureHoldTicks: 150 },
  }));
  assert.equal(config.rule.captureZones[0].holdTicks, 150);
});

test("layoutFromPreset / layoutToBattlePreset round-trips a rect preset", () => {
  const preset = RESEARCH_BATTLE_PRESETS.find((p) => p.id === "flag_run");
  const layout = layoutFromPreset(preset);
  assert.equal(layout.field.shape, "rect");
  assert.equal(layout.obstacles.length, preset.obstacles.length);
  assert.deepEqual(layout.flag, { x: preset.flagPosition.x, y: preset.flagPosition.y });

  const back = layoutToBattlePreset(layout);
  assert.equal(back.id, CUSTOM_BATTLE_ID);
  assert.deepEqual(back.field.min, preset.field.min);
  assert.deepEqual(back.field.max, preset.field.max);
  assert.equal(back.field.shape, undefined);
  assert.equal(back.obstacles.length, preset.obstacles.length);
});

test("layoutToBattlePreset emits a circle field shape", () => {
  const preset = RESEARCH_BATTLE_PRESETS.find((p) => p.id === "brawl_ring");
  const layout = layoutFromPreset(preset);
  assert.equal(layout.field.shape, "circle");
  const back = layoutToBattlePreset(layout);
  assert.equal(back.field.shape.type, "circle");
  assert.equal(back.field.shape.radiusMeters, layout.field.rx);
});

test("layoutReducer add/move/resize/remove obstacle with field clamp", () => {
  const base = { field: { shape: "rect", cx: 0, cy: 0, rx: 20, ry: 12 }, obstacles: [], flag: { x: 0, y: 0 }, blueSpawn: { x: -10, y: 0, headingDeg: 0 }, targetSpawn: { x: 10, y: 0, headingDeg: 180 } };
  const added = layoutReducer(base, { type: "addObstacle", x: 5, y: 3 });
  assert.equal(added.obstacles.length, 1);
  const id = added.obstacles[0].id;

  // Move outside the rect -> clamped to bounds.
  const moved = layoutReducer(added, { type: "moveObstacle", id, x: 999, y: 999 });
  assert.equal(moved.obstacles[0].x, 20);
  assert.equal(moved.obstacles[0].y, 12);

  const resized = layoutReducer(moved, { type: "resizeObstacle", id, radius: 0.05 });
  assert.ok(resized.obstacles[0].radius >= 0.4); // clamped to a minimum

  const removed = layoutReducer(resized, { type: "removeObstacle", id });
  assert.equal(removed.obstacles.length, 0);
});

test("layoutReducer setShape circle squares the radius and clamps contents inside", () => {
  // blueSpawn starts outside the resulting circle (r=18 around (4,2)).
  const base = { field: { shape: "rect", cx: 4, cy: 2, rx: 30, ry: 18 }, obstacles: [{ id: "obs_0", x: 4, y: 2, radius: 1.5 }], flag: { x: 4, y: 2 }, blueSpawn: { x: -20, y: 0, headingDeg: 0 }, targetSpawn: { x: 10, y: 0, headingDeg: 180 } };
  const circle = layoutReducer(base, { type: "setShape", shape: "circle" });
  assert.equal(circle.field.shape, "circle");
  assert.equal(circle.field.rx, 18); // min(rx, ry)
  assert.equal(circle.field.ry, 18);
  // The out-of-circle spawn is pulled onto the boundary.
  assert.ok(Math.hypot(circle.blueSpawn.x - 4, circle.blueSpawn.y - 2) <= 18 + 1e-6);
  assert.ok(circle.blueSpawn.x > -20);

  const config = JSON.parse(createResearchBattleConfigJson({
    battlePresetId: CUSTOM_BATTLE_ID,
    rulePresetId: "kill_limit_team",
    customBattle: layoutToBattlePreset(circle),
    unitPresetIdByUnit: { 1: "standard_tank", 2: "standard_tank" },
  }));
  assert.equal(config.field.shape.type, "circle");
  assert.equal(config.obstacles.length, 1);
});

test("layoutReducer moveField pulls contents that fall outside back into the field", () => {
  const base = { field: { shape: "rect", cx: 0, cy: 0, rx: 20, ry: 12 }, obstacles: [{ id: "obs_0", x: 5, y: 3, radius: 1.5 }], flag: { x: 2, y: 1 }, blueSpawn: { x: -10, y: 0, headingDeg: 0 }, targetSpawn: { x: 10, y: 0, headingDeg: 180 } };
  const moved = layoutReducer(base, { type: "moveField", cx: 30, cy: -8 });
  assert.equal(moved.field.cx, 30);
  assert.equal(moved.field.cy, -8);
  // New rect bounds: x in [10, 50], y in [-20, 4]. Contents left outside are clamped in.
  assert.equal(moved.obstacles[0].x, 10);
  assert.equal(moved.obstacles[0].y, 3);
  assert.equal(moved.flag.x, 10);
  assert.equal(moved.blueSpawn.x, 10);
});

test("isSavedCustomId distinguishes saved custom ids from presets and the draft", () => {
  assert.equal(isSavedCustomId(`${SAVED_CUSTOM_ID_PREFIX}1`), true);
  assert.equal(isSavedCustomId(CUSTOM_BATTLE_ID), false);
  assert.equal(isSavedCustomId("covered_duel"), false);
});

test("isSavedBotLogicId distinguishes saved bot logic ids from presets", () => {
  assert.equal(isSavedBotLogicId(`${SAVED_BOT_LOGIC_ID_PREFIX}1`), true);
  assert.equal(isSavedBotLogicId("charger"), false);
  assert.equal(isSavedBotLogicId("custom"), false);
});
