import assert from "node:assert/strict";
import test from "node:test";

import { parseBattleReplay } from "../src/replay/replay.ts";

test("replay parser reads CLI replay JSON frames", () => {
  const replay = parseBattleReplay(JSON.stringify({
    type: "robolocks.replay.v1",
    tickRate: 30,
    obstacles: [
      {
        id: "north_cover",
        position: { x: 20, y: 6 },
        radiusM: 1.5,
        blocksMovement: true,
        blocksLineOfSight: true,
      },
    ],
    frames: [
      {
        tick: 0,
        units: [
          {
            unitId: 1,
            position: { x: 6, y: 12 },
            hullHeadingDeg: 0,
            turretHeadingDeg: 0,
            armorIntegrity: 100,
            weaponCooldownTicks: 11,
            bodyShape: { type: "box", radiusM: 1.2, lengthM: 5.6, widthM: 2.8 },
            modules: {
              mobility: { id: "tracked_chassis_mk1", maxSpeedMps: 6, maxHullTurnDegps: 120 },
              turret: { id: "light_turret_mk1", maxTurnDegps: 180 },
              weapon: { id: "cannon_75mm_mk1", damage: 25, rangeM: 80, muzzleVelocityMps: 620, projectileRadiusM: 0.08, aimToleranceDeg: 5, reloadTicks: 30 },
              armor: { id: "rolled_armor_mk1", integrity: 100 },
              body: { id: "medium_hull_mk1", massKg: 30000 },
              sensor: { id: "visual_optic_mk1", rangeM: 60, fovDeg: 120, refreshTicks: 1 },
            },
          },
        ],
        projectiles: [
          {
            projectileId: 7,
            ownerUnitId: 1,
            previousPosition: { x: 18, y: 12 },
            position: { x: 20, y: 12 },
            radiusM: 0.08,
          },
        ],
      },
      {
        tick: 1,
        units: [
          {
            unitId: 1,
            position: { x: 6.2, y: 12 },
            hullHeadingDeg: 0,
            turretHeadingDeg: 0,
            armorIntegrity: 100,
            weaponCooldownTicks: 0,
            bodyShape: { type: "box", radiusM: 1.2, lengthM: 5.6, widthM: 2.8 },
          },
        ],
        events: [
          { tick: 1, unitId: 1, code: "unit_collision", message: "Collided with unit 2." },
        ],
        actions: [
          { unitId: 1, type: "moveTo", channel: "mobility", position: { x: 12, y: 12 } },
          { unitId: 1, type: "scanArc", channel: "sensor", centerDeg: 0, widthDeg: 120 },
        ],
      },
    ],
  }));

  assert.equal(replay.tickRate, 30);
  assert.equal(replay.obstacles.length, 1);
  assert.equal(replay.obstacles[0].id, "north_cover");
  assert.deepEqual(replay.obstacles[0].position, { x: 20, y: 6 });
  assert.equal(replay.obstacles[0].radiusM, 1.5);
  assert.equal(replay.frames.length, 2);
  assert.equal(replay.frames[0].units[0].name, "Blue");
  assert.equal(replay.frames[0].units[0].weaponCooldownTicks, 11);
  assert.equal(replay.frames[0].units[0].modules.mobility.id, "tracked_chassis_mk1");
  assert.equal(replay.frames[0].units[0].modules.mobility.maxSpeedMps, 6);
  assert.equal(replay.frames[0].units[0].modules.weapon.reloadTicks, 30);
  assert.equal(replay.frames[0].units[0].modules.weapon.muzzleVelocityMps, 620);
  assert.equal(replay.frames[0].units[0].modules.weapon.projectileRadiusM, 0.08);
  assert.deepEqual(replay.frames[0].units[0].bodyShape, { type: "box", radiusM: 1.2, lengthM: 5.6, widthM: 2.8 });
  assert.equal(replay.frames[0].projectiles[0].projectileId, 7);
  assert.deepEqual(replay.frames[0].projectiles[0].previousPosition, { x: 18, y: 12 });
  assert.deepEqual(replay.frames[0].projectiles[0].position, { x: 20, y: 12 });
  assert.deepEqual(replay.frames[0].events, []);
  assert.equal(replay.frames[1].events[0].code, "unit_collision");
  assert.equal(replay.frames[1].actions[0].type, "moveTo");
  assert.deepEqual(replay.frames[1].actions[0].position, { x: 12, y: 12 });
  assert.equal(replay.frames[1].actions[1].widthDeg, 120);
});

test("replay parser rejects unsupported replay payloads", () => {
  assert.throws(() => parseBattleReplay(JSON.stringify({ type: "other", frames: [] })));
});
