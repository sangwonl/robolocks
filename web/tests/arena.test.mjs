import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArenaBattleConfigJson,
  canStartArenaEvaluation,
  createLocalBotBuild,
  importGitHubBotBuild,
  matchSummaryFromReplay,
  parseGitHubBotReference,
  removeArenaBuildState,
  removeArenaRepoState,
  summarizeArenaEvaluation,
} from "../src/arena/arena.ts";

test("parseGitHubBotReference accepts owner/repo and optional ref", () => {
  assert.deepEqual(parseGitHubBotReference("eddy/ridge-runner"), {
    owner: "eddy",
    repo: "ridge-runner",
    ref: "main",
  });
  assert.deepEqual(parseGitHubBotReference("https://github.com/acme/hold-line/tree/v0.2.1"), {
    owner: "acme",
    repo: "hold-line",
    ref: "v0.2.1",
  });
  assert.deepEqual(parseGitHubBotReference("github:acme/kiter@8f2a91c"), {
    owner: "acme",
    repo: "kiter",
    ref: "8f2a91c",
  });
});

test("importGitHubBotBuild fetches manifest, bot code, and unit config from raw GitHub", async () => {
  const requestedUrls = [];
  const files = new Map([
    [
      "https://raw.githubusercontent.com/eddy/ridge-runner/main/robolocks.bot.json",
      JSON.stringify({
        name: "ridge-runner",
        version: "0.1.0",
        sdkVersion: "0.1",
        entry: "src/bot.py",
        unit: "unit.json",
        author: "eddy",
      }),
    ],
    [
      "https://raw.githubusercontent.com/eddy/ridge-runner/main/src/bot.py",
      "def on_tick(state):\n    return []\n",
    ],
    [
      "https://raw.githubusercontent.com/eddy/ridge-runner/main/unit.json",
      JSON.stringify({ unitPresetId: "scout_optics" }),
    ],
  ]);

  const build = await importGitHubBotBuild("eddy/ridge-runner", {
    fetchText: async (url) => {
      requestedUrls.push(url);
      const text = files.get(url);
      if (text === undefined) {
        throw new Error(`missing ${url}`);
      }
      return text;
    },
    now: () => "2026-07-13T00:00:00.000Z",
  });

  assert.deepEqual(requestedUrls, [...files.keys()]);
  assert.equal(build.id, "github:eddy/ridge-runner@main");
  assert.equal(build.name, "ridge-runner");
  assert.equal(build.source.kind, "github");
  assert.equal(build.code, "def on_tick(state):\n    return []\n");
  assert.equal(build.unit.unitPresetId, "scout_optics");
});

test("buildArenaBattleConfigJson creates a deterministic two entrant battle", () => {
  const blue = createLocalBotBuild({
    name: "local-charger",
    code: "def on_tick(state):\n    return []\n",
    unitPresetId: "standard_tank",
    now: () => "2026-07-13T00:00:00.000Z",
  });
  const red = createLocalBotBuild({
    name: "imported-kiter",
    code: "def on_tick(state):\n    return []\n",
    unitPresetId: "heavy_gunner",
    now: () => "2026-07-13T00:00:01.000Z",
  });

  const config = JSON.parse(buildArenaBattleConfigJson({
    battlePresetId: "wide_duel",
    rulePresetId: "kill_limit_team",
    tickLimit: 900,
    seed: 42,
    entrants: [blue, red],
  }));

  assert.equal(config.seed, 42);
  assert.equal(config.tickLimit, 900);
  assert.equal(config.units[0].name, "local-charger");
  assert.equal(config.units[1].name, "imported-kiter");
  assert.equal(config.units[0].modules.mobility.id, "tracked_chassis_mk1");
  assert.equal(config.units[1].modules.mobility.id, "heavy_tracks_v0");
  assert.deepEqual(config.controllers, [
    { unitId: 1, type: "json_callback" },
    { unitId: 2, type: "json_callback" },
  ]);
});

test("createLocalBotBuild identifies the complete code and unit build", () => {
  const standard = createLocalBotBuild({
    name: "ridge-runner",
    code: "def on_tick(state):\n    return []\n",
    unitPresetId: "standard_tank",
    now: () => "2026-07-13T00:00:00.000Z",
  });
  const scout = createLocalBotBuild({
    name: "ridge-runner",
    code: "def on_tick(state):\n    return []\n",
    unitPresetId: "scout_optics",
    now: () => "2026-07-13T00:00:00.000Z",
  });

  assert.notEqual(standard.id, scout.id);
});

test("removeArenaBuildState removes a build, its rating, and normalizes selected ids", () => {
  const left = createLocalBotBuild({
    name: "left",
    code: "def on_tick(state):\n    return []\n",
    unitPresetId: "standard_tank",
    now: () => "2026-07-13T00:00:00.000Z",
  });
  const right = createLocalBotBuild({
    name: "right",
    code: "def on_tick(state):\n    return []\n",
    unitPresetId: "scout_optics",
    now: () => "2026-07-13T00:00:01.000Z",
  });

  const result = removeArenaBuildState({
    builds: [left, right],
    ratings: {
      [left.id]: { buildId: left.id, rating: 1000, matches: 1, wins: 1, losses: 0, draws: 0 },
      [right.id]: { buildId: right.id, rating: 980, matches: 1, wins: 0, losses: 1, draws: 0 },
    },
    selectedLeftBuildId: left.id,
    selectedRightBuildId: right.id,
    removeBuildId: left.id,
  });

  assert.deepEqual(result.builds.map((build) => build.id), [right.id]);
  assert.deepEqual(Object.keys(result.ratings), [right.id]);
  assert.equal(result.selectedLeftBuildId, right.id);
  assert.equal(result.selectedRightBuildId, right.id);
});

test("removeArenaRepoState removes every build imported from the same GitHub repo", () => {
  const ridgeA = {
    id: "github:eddy/ridge-runner@main",
    name: "ridge-runner-a",
    version: "0.1.0",
    createdAt: "2026-07-13T00:00:00.000Z",
    sdkVersion: "0.1",
    author: "eddy",
    code: "def on_tick(state):\n    return []\n",
    unit: { unitPresetId: "standard_tank" },
    source: { kind: "github", owner: "eddy", repo: "ridge-runner", ref: "main" },
  };
  const ridgeB = {
    ...ridgeA,
    id: "github:eddy/ridge-runner@main#heavy",
    name: "ridge-runner-heavy",
    unit: { unitPresetId: "heavy_gunner" },
  };
  const kiter = {
    ...ridgeA,
    id: "github:acme/kiter@main",
    name: "kiter",
    source: { kind: "github", owner: "acme", repo: "kiter", ref: "main" },
  };

  const result = removeArenaRepoState({
    builds: [ridgeA, ridgeB, kiter],
    ratings: {
      [ridgeA.id]: { buildId: ridgeA.id, rating: 1010, matches: 1, wins: 1, losses: 0, draws: 0 },
      [ridgeB.id]: { buildId: ridgeB.id, rating: 990, matches: 1, wins: 0, losses: 1, draws: 0 },
      [kiter.id]: { buildId: kiter.id, rating: 1000, matches: 0, wins: 0, losses: 0, draws: 0 },
    },
    selectedLeftBuildId: ridgeA.id,
    selectedRightBuildId: ridgeB.id,
    owner: "eddy",
    repo: "ridge-runner",
    ref: "main",
  });

  assert.deepEqual(result.builds.map((build) => build.id), [kiter.id]);
  assert.deepEqual(Object.keys(result.ratings), [kiter.id]);
  assert.equal(result.selectedLeftBuildId, kiter.id);
  assert.equal(result.selectedRightBuildId, kiter.id);
});

test("summarizeArenaEvaluation aggregates seeded matches and updates local ratings", () => {
  const result = summarizeArenaEvaluation({
    leftBuildId: "local:a",
    rightBuildId: "github:b@main",
    matches: [
      { seed: 101, winnerTeamId: 1, leftKills: 2, rightKills: 0, replayFrameCount: 60 },
      { seed: 102, winnerTeamId: 2, leftKills: 0, rightKills: 2, replayFrameCount: 70 },
      { seed: 103, winnerTeamId: 1, leftKills: 2, rightKills: 1, replayFrameCount: 80 },
    ],
    previousRatings: {
      "local:a": { buildId: "local:a", rating: 1000, matches: 0, wins: 0, losses: 0, draws: 0 },
      "github:b@main": { buildId: "github:b@main", rating: 1000, matches: 0, wins: 0, losses: 0, draws: 0 },
    },
  });

  assert.equal(result.leftScore, 2);
  assert.equal(result.rightScore, 1);
  assert.equal(result.winnerBuildId, "local:a");
  assert.equal(result.ratings["local:a"].matches, 1);
  assert.equal(result.ratings["local:a"].wins, 1);
  assert.equal(result.ratings["github:b@main"].losses, 1);
  assert.ok(result.ratings["local:a"].rating > 1000);
  assert.ok(result.ratings["github:b@main"].rating < 1000);
});

test("summarizeArenaEvaluation does not update ratings for self-play", () => {
  const previousRatings = {
    "local:a": { buildId: "local:a", rating: 1032, matches: 4, wins: 2, losses: 1, draws: 1 },
  };
  const result = summarizeArenaEvaluation({
    leftBuildId: "local:a",
    rightBuildId: "local:a",
    matches: [
      { seed: 101, winnerTeamId: 1, leftKills: 2, rightKills: 1, replayFrameCount: 60 },
      { seed: 102, winnerTeamId: 2, leftKills: 1, rightKills: 2, replayFrameCount: 70 },
    ],
    previousRatings,
  });

  assert.equal(result.leftScore, 1);
  assert.equal(result.rightScore, 1);
  assert.equal(result.winnerBuildId, null);
  assert.deepEqual(result.ratings, previousRatings);
});

test("matchSummaryFromReplay reads the final outcome and team kills", () => {
  const summary = matchSummaryFromReplay({
    type: "robolocks.replay.v1",
    tickRate: 60,
    obstacles: [],
    frames: [
      { tick: 0, units: [], projectiles: [], events: [], actions: [], field: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } }, ruleState: { scores: [], captureZones: [], outcome: { finished: false, winnerTeamId: null, reason: "" } } },
      {
        tick: 10,
        units: [],
        projectiles: [],
        events: [],
        actions: [],
        field: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } },
        ruleState: {
          scores: [
            { teamId: 1, kills: 3, deaths: 1, objectiveTicks: 0 },
            { teamId: 2, kills: 1, deaths: 3, objectiveTicks: 0 },
          ],
          captureZones: [],
          outcome: { finished: true, winnerTeamId: 1, reason: "kill_limit" },
        },
      },
    ],
  }, 303);

  assert.deepEqual(summary, {
    seed: 303,
    winnerTeamId: 1,
    leftKills: 3,
    rightKills: 1,
    replayFrameCount: 2,
  });
});

test("canStartArenaEvaluation allows selected builds including self-play", () => {
  const left = createLocalBotBuild({
    name: "left",
    code: "def on_tick(state):\n    return []\n",
    unitPresetId: "standard_tank",
    now: () => "2026-07-13T00:00:00.000Z",
  });
  const right = createLocalBotBuild({
    name: "right",
    code: "def on_tick(state):\n    return []\n",
    unitPresetId: "scout_optics",
    now: () => "2026-07-13T00:00:01.000Z",
  });

  assert.equal(canStartArenaEvaluation([left], left.id, left.id), true);
  assert.equal(canStartArenaEvaluation([left, right], left.id, left.id), true);
  assert.equal(canStartArenaEvaluation([left, right], left.id, right.id), true);
  assert.equal(canStartArenaEvaluation([left, right], "", right.id), false);
  assert.equal(canStartArenaEvaluation([left, right], left.id, "missing"), false);
});
