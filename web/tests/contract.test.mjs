import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseFrame } from "../src/replay/frameParsing.ts";

// Golden fixture contract test for the web replay parser.
//
// Reads the same canonical frame golden that the engine blessed
// (engine/tests/contract_golden_test.cpp) and the C++ suite asserts against,
// then checks parseFrame preserves every field class the golden carries: unit
// name/teamId, module scalars including turret headingDegrees and body shape,
// top-level body shape, event payloads, scan-arc rangeMeters, and rule state.
// A parser that silently drops or defaults a field fails here. Re-bless by
// running the C++ test with WRITE_GOLDEN=1.

const goldenUrl = new URL("../../fixtures/contracts/frame.golden.json", import.meta.url);
const golden = JSON.parse(readFileSync(goldenUrl, "utf8"));

test("parseFrame preserves top-level frame structure", () => {
  const frame = parseFrame(golden);
  assert.equal(frame.tick, 42);
  assert.equal(frame.units.length, 2);
  assert.equal(frame.projectiles.length, 1);
  assert.equal(frame.events.length, 1);
  assert.equal(frame.actions.length, 4);
});

test("parseFrame preserves unit identity and body shape", () => {
  const frame = parseFrame(golden);
  const [blue, red] = frame.units;

  assert.equal(blue.name, "blue_vanguard");
  assert.equal(blue.teamId, 1);
  assert.equal(red.name, "red_marauder");
  assert.equal(red.teamId, 2);

  // Non-default: parseUnit falls back to `Unit <id>` / teamId 0 on a drop.
  assert.notEqual(blue.name, `Unit ${blue.unitId}`);
  assert.notEqual(blue.teamId, 0);

  assert.equal(blue.bodyShape.type, "box");
  assert.equal(blue.bodyShape.radiusMeters, 1.2);
  assert.equal(blue.bodyShape.lengthMeters, 6.4);
  assert.equal(blue.bodyShape.widthMeters, 3.1);
  assert.equal(red.bodyShape.type, "circle");
});

test("parseFrame preserves module scalars including turret heading and body shape", () => {
  const frame = parseFrame(golden);
  const modules = frame.units[0].modules;

  assert.equal(modules.mobility.id, "tracked_chassis_mk2");
  assert.equal(modules.mobility.maxSpeedMetersPerSecond, 7.5);

  // turret.headingDegrees is emitted by the engine but was dropped by the
  // parser/type before this contract pinned it.
  assert.equal(modules.turret.id, "heavy_turret_mk2");
  assert.equal(modules.turret.headingDegrees, 47.0);
  assert.equal(modules.turret.maxTurnDegreesPerSecond, 140.0);
  assert.notEqual(modules.turret.headingDegrees, 0);

  assert.equal(modules.weapon.fireMode, "ballistic");
  assert.equal(modules.weapon.penetrationMillimeters, 132.0);
  assert.deepEqual(modules.weapon.muzzleOffsetMeters, { x: 3.6, y: 0.2, z: 1.65 });

  assert.equal(modules.armor.frontMillimeters, 120.0);
  assert.equal(modules.body.id, "heavy_hull_mk2");
  assert.equal(modules.body.massKilograms, 42000.0);

  // modules.body.shape is emitted by the engine and must survive parsing.
  assert.ok(modules.body.shape, "expected modules.body.shape to be preserved");
  assert.equal(modules.body.shape.type, "box");
  assert.equal(modules.body.shape.lengthMeters, 6.4);

  assert.equal(modules.sensor.rangeMeters, 640.0);
});

test("parseFrame preserves unit intents", () => {
  const frame = parseFrame(golden);
  const intents = frame.units[0].intents;

  assert.equal(intents.mobility.active, true);
  assert.equal(intents.mobility.remainingMeters, 18.5);
  assert.equal(intents.turret.errorDegrees, 6.5);
  assert.equal(intents.weapon.minHitChance, 0.65);
});

test("parseFrame preserves the projectile", () => {
  const frame = parseFrame(golden);
  const projectile = frame.projectiles[0];

  assert.equal(projectile.projectileId, 7);
  assert.equal(projectile.ownerUnitId, 1);
  assert.equal(projectile.radiusMeters, 0.08);
  assert.equal(projectile.heightMeters, 1.3);
  assert.equal(projectile.previousHeightMeters, 1.1);
});

test("parseFrame preserves the event payload", () => {
  const frame = parseFrame(golden);
  const event = frame.events[0];

  assert.equal(event.tick, 42);
  assert.equal(event.unitId, 2);
  assert.equal(event.code, "armor_penetrated");
  assert.equal(event.payload.projectileId, 7);
  assert.equal(event.payload.sourceUnitId, 1);
  assert.equal(event.payload.targetUnitId, 2);
  assert.equal(event.payload.sourceTeamId, 1);
  assert.equal(event.payload.targetTeamId, 2);
  assert.equal(event.payload.damageType, "direct");
  assert.equal(event.payload.armorFacing, "side");
  assert.equal(event.payload.damage, 42.0);
  assert.equal(event.payload.penetrationMillimeters, 132.0);
  assert.equal(event.payload.armorMillimeters, 70.0);
  assert.equal(event.payload.impactDistanceMeters, 15.5);
  assert.equal(event.payload.blastRadiusMeters, 2.25);
});

test("parseFrame preserves the scan-arc action rangeMeters", () => {
  const frame = parseFrame(golden);
  const scanArc = frame.actions.find((action) => action.type === "scanArc");

  assert.ok(scanArc, "expected a scanArc action");
  assert.equal(scanArc.channel, "sensor");
  assert.equal(scanArc.directionDegrees, 90.0);
  assert.equal(scanArc.widthDegrees, 120.0);
  assert.equal(scanArc.rangeMeters, 55.0);

  const fire = frame.actions.find((action) => action.type === "fireIfSolution");
  assert.equal(fire.minHitChance, 0.65);
  const aim = frame.actions.find((action) => action.type === "aimAt");
  assert.deepEqual(aim.target, { x: 28.0, y: 16.5 });
});

test("parseFrame preserves rule state scores, capture zones, and outcome", () => {
  const frame = parseFrame(golden);
  const ruleState = frame.ruleState;

  assert.equal(ruleState.scores.length, 2);
  assert.equal(ruleState.scores[0].unitId, 1);
  assert.equal(ruleState.scores[0].teamId, 1);
  assert.equal(ruleState.scores[0].kills, 1);
  assert.equal(ruleState.scores[0].damageDealt, 42.0);
  assert.equal(ruleState.scores[1].deaths, 1);

  assert.equal(ruleState.captureZones.length, 1);
  const zone = ruleState.captureZones[0];
  assert.equal(zone.id, "center");
  assert.equal(zone.radiusMeters, 3.5);
  assert.equal(zone.holdTicksRequired, 300);
  assert.equal(zone.heldTicks, 120);
  assert.equal(zone.ownerUnitId, 1);
  assert.equal(zone.ownerTeamId, 1);
  assert.equal(zone.contested, true);

  assert.equal(ruleState.outcome.finished, true);
  assert.equal(ruleState.outcome.reason, "kill_limit");
  assert.equal(ruleState.outcome.winnerUnitId, 1);
  assert.equal(ruleState.outcome.winnerTeamId, 1);
});
