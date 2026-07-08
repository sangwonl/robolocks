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
});
