import assert from "node:assert/strict";
import test from "node:test";

import { buildBattleScene } from "../src/ui/battleSceneThreeScene.ts";

test("battle scene renders unit sensor coverage when no scan action exists", () => {
  const scene = buildBattleScene({
    obstacles: [],
    frame: {
      tick: 1,
      projectiles: [],
      events: [],
      units: [
        {
          unitId: 1,
          teamId: 1,
          name: "Blue",
          position: { x: 10, y: 8 },
          hullHeadingDegrees: 0,
          turretHeadingDegrees: 0,
          armorIntegrity: 100,
          weaponCooldownTicks: 0,
          bodyShape: { type: "box", radiusMeters: 1.2, lengthMeters: 5.6, widthMeters: 2.8 },
          modules: {
            mobility: { id: "mobility", maxSpeedMetersPerSecond: 6, maxHullTurnDegreesPerSecond: 120 },
            turret: { id: "turret", maxTurnDegreesPerSecond: 180 },
            weapon: { id: "weapon", fireMode: "direct", damage: 25, penetrationMillimeters: 80, rangeMeters: 80, muzzleVelocityMetersPerSecond: 620, muzzleOffsetMeters: { x: 3.6, y: 0, z: 1.65 }, launchAngleDegrees: 0, gravityMetersPerSecondSquared: 9.81, blastRadiusMeters: 0, projectileRadiusMeters: 0.08, aimToleranceDegrees: 5, reloadTicks: 30 },
            armor: { id: "armor", integrity: 100, frontMillimeters: 100, sideMillimeters: 70, rearMillimeters: 45 },
            body: { id: "body", massKilograms: 30000 },
            sensor: { id: "sensor", rangeMeters: 12, fovDegrees: 90, refreshTicks: 1 },
          },
          intents: {
            mobility: { active: false, target: { x: 10, y: 8 }, remainingMeters: 0, ageTicks: 0 },
            turret: { active: false, target: { x: 10, y: 8 }, errorDegrees: 0, ageTicks: 0 },
            hull: { active: false, target: { x: 10, y: 8 }, errorDegrees: 0, ageTicks: 0 },
            weapon: { active: false, minHitChance: 0, ageTicks: 0 },
          },
        },
      ],
      actions: [],
    },
  });

  const scanArc = scene.getObjectByName("unit-1-scan-arc");

  assert.ok(scanArc);
  assert.equal(scanArc.userData.rangeMeters, 12);
  assert.equal(scanArc.userData.directionDegrees, 0);
  assert.equal(scanArc.userData.widthDegrees, 90);
  assert.equal(scanArc.userData.originLocal.x, -0.716);
  assert.equal(scanArc.userData.originLocal.z, 0);
  assert.ok(scanArc.userData.originHeightMeters > 1.9);
});

test("battle scene renders unit modules from specs", () => {
  const scene = buildBattleScene({
    obstacles: [],
    frame: {
      tick: 1,
      projectiles: [],
      events: [],
      units: [
        {
          unitId: 2,
          teamId: 2,
          name: "Red",
          position: { x: 12, y: 9 },
          hullHeadingDegrees: 20,
          turretHeadingDegrees: 35,
          armorIntegrity: 80,
          weaponCooldownTicks: 0,
          bodyShape: { type: "box", radiusMeters: 1.45, lengthMeters: 6.4, widthMeters: 3.2 },
          modules: {
            mobility: { id: "heavy_tracks_v0", maxSpeedMetersPerSecond: 3.2, maxHullTurnDegreesPerSecond: 70 },
            turret: { id: "slow_turret", maxTurnDegreesPerSecond: 90 },
            weapon: { id: "howitzer_test", fireMode: "ballistic", damage: 42, penetrationMillimeters: 150, rangeMeters: 95, muzzleVelocityMetersPerSecond: 36, muzzleOffsetMeters: { x: 3.3, y: 0.1, z: 1.8 }, launchAngleDegrees: 45, gravityMetersPerSecondSquared: 9.81, blastRadiusMeters: 2.5, projectileRadiusMeters: 0.12, aimToleranceDegrees: 8, reloadTicks: 105 },
            armor: { id: "heavy_armor_v0", integrity: 150, frontMillimeters: 160, sideMillimeters: 95, rearMillimeters: 60 },
            body: { id: "heavy_hull_v0", massKilograms: 47000 },
            sensor: { id: "wide_optic_v0", rangeMeters: 75, fovDegrees: 170, refreshTicks: 2 },
          },
          intents: {
            mobility: { active: false, target: { x: 12, y: 9 }, remainingMeters: 0, ageTicks: 0 },
            turret: { active: false, target: { x: 12, y: 9 }, errorDegrees: 0, ageTicks: 0 },
            hull: { active: false, target: { x: 12, y: 9 }, errorDegrees: 0, ageTicks: 0 },
            weapon: { active: false, minHitChance: 0, ageTicks: 0 },
          },
        },
      ],
      actions: [],
    },
  });

  const mobility = scene.getObjectByName("unit-2-mobility-module");
  const armor = scene.getObjectByName("unit-2-armor-module");
  const turret = scene.getObjectByName("unit-2-turret");
  const sensor = scene.getObjectByName("unit-2-sensor-module");
  const muzzle = scene.getObjectByName("unit-2-muzzle");

  assert.ok(mobility);
  assert.ok(armor);
  assert.ok(turret);
  assert.ok(sensor);
  assert.ok(muzzle);
  assert.equal(mobility.userData.moduleId, "heavy_tracks_v0");
  assert.equal(armor.userData.frontMillimeters, 160);
  assert.equal(turret.userData.fireMode, "ballistic");
  assert.equal(sensor.userData.fovDegrees, 170);
  assert.deepEqual(sensor.userData.originLocal, scene.getObjectByName("unit-2-scan-arc").userData.originLocal);
});
