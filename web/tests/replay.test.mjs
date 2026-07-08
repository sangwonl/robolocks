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
        radiusMeters: 1.5,
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
            hullHeadingDegrees: 0,
            turretHeadingDegrees: 0,
            armorIntegrity: 100,
            weaponCooldownTicks: 11,
            bodyShape: { type: "box", radiusMeters: 1.2, lengthMeters: 5.6, widthMeters: 2.8 },
            modules: {
              mobility: { id: "tracked_chassis_mk1", maxSpeedMetersPerSecond: 6, maxHullTurnDegreesPerSecond: 120 },
              turret: { id: "light_turret_mk1", maxTurnDegreesPerSecond: 180 },
              weapon: { id: "cannon_75mm_mk1", fireMode: "direct", damage: 25, penetrationMillimeters: 120, rangeMeters: 80, muzzleVelocityMetersPerSecond: 620, muzzleOffsetMeters: { x: 3.6, y: 0, z: 1.65 }, launchAngleDegrees: 0, gravityMetersPerSecondSquared: 9.81, blastRadiusMeters: 0, projectileRadiusMeters: 0.08, aimToleranceDegrees: 5, reloadTicks: 30 },
              armor: { id: "rolled_armor_mk1", integrity: 100, frontMillimeters: 100, sideMillimeters: 70, rearMillimeters: 45 },
              body: { id: "medium_hull_mk1", massKilograms: 30000 },
              sensor: { id: "visual_optic_mk1", rangeMeters: 60, fovDegrees: 120, refreshTicks: 1 },
            },
          },
        ],
        projectiles: [
          {
            projectileId: 7,
            ownerUnitId: 1,
            previousPosition: { x: 18, y: 12 },
            position: { x: 20, y: 12 },
            radiusMeters: 0.08,
            previousHeightMeters: 2.8,
            heightMeters: 3.5,
          },
        ],
      },
      {
        tick: 1,
        units: [
          {
            unitId: 1,
            position: { x: 6.2, y: 12 },
            hullHeadingDegrees: 0,
            turretHeadingDegrees: 0,
            armorIntegrity: 100,
            weaponCooldownTicks: 0,
            bodyShape: { type: "box", radiusMeters: 1.2, lengthMeters: 5.6, widthMeters: 2.8 },
          },
        ],
        events: [
          {
            tick: 1,
            unitId: 1,
            code: "armor_damage",
            message: "Projectile penetrated rear armor.",
            payload: {
              projectileId: 7,
              damageType: "direct",
              armorFacing: "rear",
              damage: 37.5,
              remainingArmor: 62.5,
              penetrationMillimeters: 80,
              armorMillimeters: 40,
              impactDistanceMeters: 0,
              blastRadiusMeters: 0,
            },
          },
        ],
        actions: [
          { unitId: 1, type: "moveTo", channel: "mobility", position: { x: 12, y: 12 } },
          { unitId: 1, type: "scanArc", channel: "sensor", directionDegrees: 0, widthDegrees: 120 },
        ],
      },
    ],
  }));

  assert.equal(replay.tickRate, 30);
  assert.equal(replay.obstacles.length, 1);
  assert.equal(replay.obstacles[0].id, "north_cover");
  assert.deepEqual(replay.obstacles[0].position, { x: 20, y: 6 });
  assert.equal(replay.obstacles[0].radiusMeters, 1.5);
  assert.equal(replay.frames.length, 2);
  assert.equal(replay.frames[0].units[0].name, "Blue");
  assert.equal(replay.frames[0].units[0].weaponCooldownTicks, 11);
  assert.equal(replay.frames[0].units[0].modules.mobility.id, "tracked_chassis_mk1");
  assert.equal(replay.frames[0].units[0].modules.mobility.maxSpeedMetersPerSecond, 6);
  assert.equal(replay.frames[0].units[0].modules.weapon.reloadTicks, 30);
  assert.equal(replay.frames[0].units[0].modules.weapon.fireMode, "direct");
  assert.equal(replay.frames[0].units[0].modules.weapon.penetrationMillimeters, 120);
  assert.equal(replay.frames[0].units[0].modules.weapon.launchAngleDegrees, 0);
  assert.equal(replay.frames[0].units[0].modules.weapon.gravityMetersPerSecondSquared, 9.81);
  assert.equal(replay.frames[0].units[0].modules.weapon.blastRadiusMeters, 0);
  assert.equal(replay.frames[0].units[0].modules.weapon.muzzleVelocityMetersPerSecond, 620);
  assert.deepEqual(replay.frames[0].units[0].modules.weapon.muzzleOffsetMeters, { x: 3.6, y: 0, z: 1.65 });
  assert.equal(replay.frames[0].units[0].modules.weapon.projectileRadiusMeters, 0.08);
  assert.equal(replay.frames[0].units[0].modules.armor.frontMillimeters, 100);
  assert.equal(replay.frames[0].units[0].modules.armor.sideMillimeters, 70);
  assert.equal(replay.frames[0].units[0].modules.armor.rearMillimeters, 45);
  assert.deepEqual(replay.frames[0].units[0].bodyShape, { type: "box", radiusMeters: 1.2, lengthMeters: 5.6, widthMeters: 2.8 });
  assert.equal(replay.frames[0].projectiles[0].projectileId, 7);
  assert.deepEqual(replay.frames[0].projectiles[0].previousPosition, { x: 18, y: 12 });
  assert.deepEqual(replay.frames[0].projectiles[0].position, { x: 20, y: 12 });
  assert.equal(replay.frames[0].projectiles[0].previousHeightMeters, 2.8);
  assert.equal(replay.frames[0].projectiles[0].heightMeters, 3.5);
  assert.deepEqual(replay.frames[0].events, []);
  assert.equal(replay.frames[1].events[0].code, "armor_damage");
  assert.equal(replay.frames[1].events[0].payload.damage, 37.5);
  assert.equal(replay.frames[1].events[0].payload.armorFacing, "rear");
  assert.equal(replay.frames[1].actions[0].type, "moveTo");
  assert.deepEqual(replay.frames[1].actions[0].position, { x: 12, y: 12 });
  assert.equal(replay.frames[1].actions[1].widthDegrees, 120);
});

test("replay parser rejects unsupported replay payloads", () => {
  assert.throws(() => parseBattleReplay(JSON.stringify({ type: "other", frames: [] })));
});
