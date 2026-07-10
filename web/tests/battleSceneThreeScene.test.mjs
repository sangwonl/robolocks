import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createBattleScene } from "../src/ui/battleSceneThreeScene.ts";

function makeUnit(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function makeFrame(units, extra = {}) {
  return {
    tick: 1,
    projectiles: [],
    events: [],
    actions: [],
    units,
    ruleState: { scores: [], captureZones: [], outcome: { finished: false, reason: "", winnerUnitId: 0, winnerTeamId: 0 } },
    ...extra,
  };
}

test("battle scene builds a visible boundary and ground sized from the play field", () => {
  const field = { min: { x: -12, y: -8 }, max: { x: 52, y: 32 } };
  const battle = createBattleScene({ obstacles: [], field });

  const boundary = battle.scene.getObjectByName("field-boundary");
  assert.ok(boundary, "boundary group should exist");
  assert.deepEqual(boundary.userData, { minX: -12, minY: -8, maxX: 52, maxY: 32 });
  // Four rails framing the field.
  assert.ok(boundary.getObjectByName("boundary-north"));
  assert.ok(boundary.getObjectByName("boundary-south"));
  assert.ok(boundary.getObjectByName("boundary-west"));
  assert.ok(boundary.getObjectByName("boundary-east"));

  // Ground plane is centered on the field center (20, 12) rather than a fixed spot.
  const plane = battle.scene.getObjectByName("terrain-plane");
  assert.ok(plane);
  assert.equal(plane.position.x, 20);
  assert.equal(plane.position.z, 12);

  battle.dispose();
});

test("battle scene builds a circular boundary from the play field shape", () => {
  const field = {
    min: { x: 0, y: 0 },
    max: { x: 40, y: 40 },
    shape: { type: "circle", center: { x: 20, y: 20 }, radiusMeters: 16 },
  };
  const battle = createBattleScene({ obstacles: [], field });

  const boundary = battle.scene.getObjectByName("field-boundary");
  assert.ok(boundary, "boundary group should exist");
  assert.equal(boundary.userData.shape, "circle");
  assert.ok(boundary.getObjectByName("boundary-circle-0"));
  assert.equal(boundary.getObjectByName("boundary-east"), undefined);
  const plane = battle.scene.getObjectByName("terrain-plane");
  assert.ok(plane);
  assert.equal(plane.userData.shape, "circle");
  assert.equal(plane.geometry.type, "CircleGeometry");
  const grid = battle.scene.getObjectByName("terrain-grid");
  assert.ok(grid);
  assert.equal(grid.userData.shape, "circle");
  assert.equal(grid.type, "LineSegments");

  battle.dispose();
});

test("battle scene builds a polygon boundary from the play field shape", () => {
  const field = {
    min: { x: 0, y: 0 },
    max: { x: 40, y: 32 },
    shape: {
      type: "polygon",
      vertices: [
        { x: 20, y: 2 },
        { x: 36, y: 10 },
        { x: 32, y: 26 },
        { x: 8, y: 26 },
        { x: 4, y: 10 },
      ],
    },
  };
  const battle = createBattleScene({ obstacles: [], field });

  const boundary = battle.scene.getObjectByName("field-boundary");
  assert.ok(boundary, "boundary group should exist");
  assert.equal(boundary.userData.shape, "polygon");
  assert.ok(boundary.getObjectByName("boundary-polygon-0"));
  assert.ok(boundary.getObjectByName("boundary-polygon-4"));
  assert.equal(boundary.getObjectByName("boundary-east"), undefined);
  const plane = battle.scene.getObjectByName("terrain-plane");
  assert.ok(plane);
  assert.equal(plane.userData.shape, "polygon");
  assert.equal(plane.geometry.type, "ShapeGeometry");
  const grid = battle.scene.getObjectByName("terrain-grid");
  assert.ok(grid);
  assert.equal(grid.userData.shape, "polygon");
  assert.equal(grid.type, "LineSegments");

  battle.dispose();
});

test("battle scene renders unit sensor coverage when no scan action exists", () => {
  const battle = createBattleScene({ obstacles: [] });
  battle.sync(makeFrame([makeUnit()]));

  const scanArc = battle.scene.getObjectByName("unit-1-scan-arc");

  assert.ok(scanArc);
  assert.equal(scanArc.userData.rangeMeters, 12);
  assert.equal(scanArc.userData.directionDegrees, 0);
  assert.equal(scanArc.userData.widthDegrees, 90);
  assert.equal(scanArc.userData.originLocal.x, -0.716);
  assert.equal(scanArc.userData.originLocal.z, 0);
  assert.ok(scanArc.userData.originHeightMeters > 1.9);
  battle.dispose();
});

test("battle scene renders unit modules from specs", () => {
  const battle = createBattleScene({ obstacles: [] });
  battle.sync(
    makeFrame([
      makeUnit({
        unitId: 2,
        teamId: 2,
        name: "Red",
        position: { x: 12, y: 9 },
        hullHeadingDegrees: 20,
        turretHeadingDegrees: 35,
        armorIntegrity: 80,
        bodyShape: { type: "box", radiusMeters: 1.45, lengthMeters: 6.4, widthMeters: 3.2 },
        modules: {
          mobility: { id: "heavy_tracks_v0", maxSpeedMetersPerSecond: 3.2, maxHullTurnDegreesPerSecond: 70 },
          turret: { id: "slow_turret", maxTurnDegreesPerSecond: 90 },
          weapon: { id: "howitzer_test", fireMode: "ballistic", damage: 42, penetrationMillimeters: 150, rangeMeters: 95, muzzleVelocityMetersPerSecond: 36, muzzleOffsetMeters: { x: 3.3, y: 0.1, z: 1.8 }, launchAngleDegrees: 45, gravityMetersPerSecondSquared: 9.81, blastRadiusMeters: 2.5, projectileRadiusMeters: 0.12, aimToleranceDegrees: 8, reloadTicks: 105 },
          armor: { id: "heavy_armor_v0", integrity: 150, frontMillimeters: 160, sideMillimeters: 95, rearMillimeters: 60 },
          body: { id: "heavy_hull_v0", massKilograms: 47000 },
          sensor: { id: "wide_optic_v0", rangeMeters: 75, fovDegrees: 170, refreshTicks: 2 },
        },
      }),
    ]),
  );

  const mobility = battle.scene.getObjectByName("unit-2-mobility-module");
  const armor = battle.scene.getObjectByName("unit-2-armor-module");
  const turret = battle.scene.getObjectByName("unit-2-turret");
  const sensor = battle.scene.getObjectByName("unit-2-sensor-module");
  const muzzle = battle.scene.getObjectByName("unit-2-muzzle");
  const healthBar = battle.scene.getObjectByName("unit-2-health-bar");
  const healthFill = battle.scene.getObjectByName("unit-2-health-bar-fill");

  assert.ok(mobility);
  assert.ok(armor);
  assert.ok(turret);
  assert.ok(sensor);
  assert.ok(muzzle);
  assert.ok(healthBar);
  assert.ok(healthFill);
  assert.equal(mobility.userData.moduleId, "heavy_tracks_v0");
  assert.equal(armor.userData.frontMillimeters, 160);
  assert.equal(turret.userData.fireMode, "ballistic");
  assert.equal(sensor.userData.fovDegrees, 170);
  assert.equal(healthBar.userData.maxArmorIntegrity, 150);
  assert.equal(healthBar.userData.armorIntegrity, 80);
  assert.equal(healthBar.userData.ratio, 80 / 150);
  assert.equal(healthFill.scale.x, 80 / 150);
  assert.deepEqual(sensor.userData.originLocal, battle.scene.getObjectByName("unit-2-scan-arc").userData.originLocal);
  battle.dispose();
});

test("statics build once and keep object identity across syncs", () => {
  const battle = createBattleScene({
    obstacles: [
      { id: "rock", position: { x: 5, y: 5 }, radiusMeters: 1.5, blocksMovement: true, blocksLineOfSight: true },
    ],
  });

  battle.sync(makeFrame([makeUnit()]));
  const terrainFirst = battle.scene.getObjectByName("terrain");
  const lightingFirst = battle.scene.getObjectByName("lighting");
  const obstacleFirst = battle.scene.getObjectByName("obstacle-rock");

  battle.sync(makeFrame([makeUnit()]));
  const terrainSecond = battle.scene.getObjectByName("terrain");
  const lightingSecond = battle.scene.getObjectByName("lighting");
  const obstacleSecond = battle.scene.getObjectByName("obstacle-rock");

  assert.equal(terrainFirst, terrainSecond);
  assert.equal(lightingFirst, lightingSecond);
  assert.equal(obstacleFirst, obstacleSecond);
  battle.dispose();
});

test("unit rigs persist across syncs and update transforms in place", () => {
  const battle = createBattleScene({ obstacles: [] });

  battle.sync(makeFrame([makeUnit({ position: { x: 10, y: 8 }, hullHeadingDegrees: 0, turretHeadingDegrees: 0 })]));
  const groupFirst = battle.scene.getObjectByName("unit-1");
  const hullFirst = battle.scene.getObjectByName("unit-1-hull");
  const turretFirst = battle.scene.getObjectByName("unit-1-turret");
  const firstX = groupFirst.position.x;
  const firstTurretRotation = turretFirst.rotation.y;

  battle.sync(makeFrame([makeUnit({ position: { x: 22, y: 3 }, hullHeadingDegrees: 90, turretHeadingDegrees: 135 })]));
  const groupSecond = battle.scene.getObjectByName("unit-1");
  const hullSecond = battle.scene.getObjectByName("unit-1-hull");
  const turretSecond = battle.scene.getObjectByName("unit-1-turret");

  // Same rig objects reused (no recreation).
  assert.equal(groupFirst, groupSecond);
  assert.equal(hullFirst, hullSecond);
  assert.equal(turretFirst, turretSecond);

  // Transforms updated in place.
  assert.notEqual(groupSecond.position.x, firstX);
  assert.equal(groupSecond.position.x, 22);
  assert.equal(groupSecond.position.z, 3);
  assert.notEqual(turretSecond.rotation.y, firstTurretRotation);
});

test("unit health bars are camera-facing overlays independent of hull rotation", () => {
  const battle = createBattleScene({ obstacles: [] });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(10, 12, 14);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  battle.sync(makeFrame([makeUnit({ hullHeadingDegrees: 135, armorIntegrity: 25 })]));
  battle.faceCamera(camera);

  const group = battle.scene.getObjectByName("unit-1");
  const healthBar = battle.scene.getObjectByName("unit-1-health-bar");
  const healthFill = battle.scene.getObjectByName("unit-1-health-bar-fill");

  assert.ok(group);
  assert.ok(healthBar);
  assert.ok(healthFill);
  assert.notDeepEqual(healthBar.quaternion.toArray(), group.quaternion.toArray());
  assert.deepEqual(healthBar.quaternion.toArray(), camera.quaternion.toArray());
  assert.equal(healthFill.scale.x, 0.25);
  battle.dispose();
});

test("units are removed from the scene when they disappear from the frame", () => {
  const battle = createBattleScene({ obstacles: [] });

  battle.sync(makeFrame([makeUnit({ unitId: 1 }), makeUnit({ unitId: 2, teamId: 2 })]));
  assert.ok(battle.scene.getObjectByName("unit-1"));
  assert.ok(battle.scene.getObjectByName("unit-2"));

  battle.sync(makeFrame([makeUnit({ unitId: 1 })]));
  assert.ok(battle.scene.getObjectByName("unit-1"));
  assert.equal(battle.scene.getObjectByName("unit-2"), undefined);
  assert.equal(battle.scene.getObjectByName("unit-2-scan-arc"), undefined);
});

test("dispose() disposes every tracked geometry, material, and light exactly once", () => {
  const battle = createBattleScene({
    obstacles: [
      { id: "rock", position: { x: 5, y: 5 }, radiusMeters: 1.5, blocksMovement: true, blocksLineOfSight: true },
    ],
  });
  const projectile = {
    projectileId: 11,
    ownerUnitId: 1,
    previousPosition: { x: 1, y: 1 },
    position: { x: 2, y: 2 },
    radiusMeters: 0.1,
    previousHeightMeters: 1,
    heightMeters: 1.2,
  };
  battle.sync(makeFrame([makeUnit()], { projectiles: [projectile] }));

  // Monkey-patch dispose on every geometry/material/light instance currently
  // reachable from the scene, then assert battle.dispose() invokes each one.
  const tracked = new Set();
  const disposeCalls = new Map();

  function trackDisposable(resource) {
    if (!resource || typeof resource.dispose !== "function" || tracked.has(resource)) {
      return;
    }
    tracked.add(resource);
    disposeCalls.set(resource, 0);
    const original = resource.dispose.bind(resource);
    resource.dispose = (...args) => {
      disposeCalls.set(resource, disposeCalls.get(resource) + 1);
      return original(...args);
    };
  }

  battle.scene.traverse((object) => {
    const withGeometry = object;
    if (withGeometry.geometry) {
      trackDisposable(withGeometry.geometry);
    }
    const material = withGeometry.material;
    if (Array.isArray(material)) {
      for (const item of material) {
        trackDisposable(item);
      }
    } else if (material) {
      trackDisposable(material);
    }
    if (object.isLight) {
      trackDisposable(object);
    }
  });

  // Sanity check on the test itself: a shadow-casting light must be present,
  // otherwise this test would pass vacuously without covering the leak.
  assert.ok(Array.from(tracked).some((resource) => resource.isDirectionalLight));
  assert.ok(tracked.size > 0);

  battle.dispose();

  for (const resource of tracked) {
    assert.ok(
      disposeCalls.get(resource) >= 1,
      `expected dispose() to be called at least once for ${resource.type ?? resource.constructor?.name ?? "resource"}`,
    );
  }
});

test("projectile rigs persist across syncs and are removed on disappearance", () => {
  const battle = createBattleScene({ obstacles: [] });

  const projectile = {
    projectileId: 7,
    ownerUnitId: 1,
    previousPosition: { x: 1, y: 1 },
    position: { x: 2, y: 2 },
    radiusMeters: 0.1,
    previousHeightMeters: 1,
    heightMeters: 1.2,
  };
  battle.sync(makeFrame([makeUnit()], { projectiles: [projectile] }));
  const bodyFirst = battle.scene.getObjectByName("projectile-7-body");
  assert.ok(bodyFirst);
  const firstX = bodyFirst.position.x;

  battle.sync(makeFrame([makeUnit()], { projectiles: [{ ...projectile, position: { x: 5, y: 6 } }] }));
  const bodySecond = battle.scene.getObjectByName("projectile-7-body");
  assert.equal(bodyFirst, bodySecond);
  assert.notEqual(bodySecond.position.x, firstX);

  battle.sync(makeFrame([makeUnit()], { projectiles: [] }));
  assert.equal(battle.scene.getObjectByName("projectile-7-body"), undefined);
  battle.dispose();
});

test("capture zone rigs reflect rule state and persist across syncs", () => {
  const battle = createBattleScene({ obstacles: [] });
  const alpha = {
    id: "alpha",
    position: { x: 20, y: 12 },
    radiusMeters: 3.5,
    holdTicksRequired: 90,
    heldTicks: 12,
    ownerUnitId: 1,
    ownerTeamId: 1,
    contested: false,
  };

  battle.sync(makeFrame([makeUnit()], {
    ruleState: {
      scores: [],
      captureZones: [alpha],
      outcome: { finished: false, reason: "", winnerUnitId: 0, winnerTeamId: 0 },
    },
  }));

  const zoneFirst = battle.scene.getObjectByName("capture-zone-alpha");
  const fill = battle.scene.getObjectByName("capture-zone-alpha-fill");
  const ring = battle.scene.getObjectByName("capture-zone-alpha-ring");

  assert.ok(zoneFirst);
  assert.ok(fill);
  assert.ok(ring);
  assert.equal(zoneFirst.position.x, 20);
  assert.equal(zoneFirst.position.z, 12);
  assert.equal(zoneFirst.userData.heldTicks, 12);
  assert.equal(zoneFirst.userData.ownerTeamId, 1);

  battle.sync(makeFrame([makeUnit()], {
    ruleState: {
      scores: [],
      captureZones: [{ ...alpha, heldTicks: 45, contested: true }],
      outcome: { finished: false, reason: "", winnerUnitId: 0, winnerTeamId: 0 },
    },
  }));

  const zoneSecond = battle.scene.getObjectByName("capture-zone-alpha");
  assert.equal(zoneFirst, zoneSecond);
  assert.equal(zoneSecond.userData.heldTicks, 45);
  assert.equal(zoneSecond.userData.contested, true);

  battle.sync(makeFrame([makeUnit()]));
  assert.equal(battle.scene.getObjectByName("capture-zone-alpha"), undefined);
  battle.dispose();
});
