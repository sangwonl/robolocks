import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_RESEARCH_BOT_SOURCE, createResearchBattleConfigJson, runResearchInBrowser } from "../src/research/research.ts";

test("browser research run drives a WASM runner with a browser bot runtime", async () => {
  const observedBotSources = [];
  const onTickCalls = [];
  let destroyedRuntime = false;
  let destroyedRunner = false;
  let receivedBattleConfigJson = "";
  const battleConfigJson = createResearchBattleConfigJson({
    battlePresetId: "open_range",
    unitPresetId: "ballistic_test",
  });

  const result = await runResearchInBrowser({
    battleConfigJson,
    botSource: DEFAULT_RESEARCH_BOT_SOURCE,
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
  assert.equal(observedBotSources.length, 1);
  assert.match(observedBotSources[0], /def on_tick/);
  assert.equal(receivedConfig.battleId, "research_open_range_ballistic_test");
  assert.equal(receivedConfig.obstacles.length, 0);
  assert.equal(receivedConfig.units[0].modules.weapon.fireMode, "ballistic");
  assert.equal(receivedConfig.units[0].modules.weapon.blastRadiusMeters, 2.5);
  assert.equal(replay.type, "robolocks.replay.v1");
  assert.equal(replay.tickRate, 30);
  assert.equal(replay.obstacles[0].id, "research_cover");
  assert.equal(replay.frames.length, 3);
  assert.equal(replay.frames[0].tick, 0);
  assert.equal(replay.frames[2].tick, 2);
  assert.deepEqual(onTickCalls.map((call) => call.tick), [1, 2]);
  assert.deepEqual(result.logs, [
    { tick: 1, unitId: 1, stream: "stdout", message: "tick 1" },
    { tick: 2, unitId: 1, stream: "stdout", message: "tick 2" },
  ]);
  assert.equal(destroyedRunner, true);
  assert.equal(destroyedRuntime, true);
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
