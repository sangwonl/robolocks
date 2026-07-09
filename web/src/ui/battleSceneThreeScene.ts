import * as THREE from "three";

import type { BattleFrame, BodyShapeFrame, StaticObstacleFrame, UnitFrame } from "../types/protocol";
import { teamColor } from "./teamPalette.ts";

const HULL_HEIGHT_M = 1.2;
const TURRET_HEIGHT_M = 0.35;
const TURRET_WIDTH_RATIO = 0.48;
const TURRET_LENGTH_RATIO = 0.52;
const MIN_BARREL_LENGTH_M = 0.25;
const MIN_TRACK_WIDTH_M = 0.28;
const ARMOR_OVERLAY_HEIGHT_M = 0.06;

type ScanAction = BattleFrame["actions"][number];
type ProjectileFrame = BattleFrame["projectiles"][number];

type SensorMount = {
  base: THREE.Vector3;
  origin: THREE.Vector3;
};

/**
 * Persistent per-unit render rig. The geometry/materials are built once when the
 * unit is first seen (its module specs and body shape never change during a
 * battle) and reused every frame; only transforms, tint, and the scan-arc are
 * mutated per frame. Owned resources are disposed when the unit disappears or
 * when the whole scene is torn down.
 */
type UnitRig = {
  group: THREE.Group;
  turret: THREE.Group;
  sensor: THREE.Group;
  scanArc: THREE.Mesh;
  hullMaterial: THREE.MeshStandardMaterial;
  armorMaterial: THREE.MeshStandardMaterial;
  scanArcMaterial: THREE.MeshBasicMaterial;
  mount: SensorMount;
  lastArcKey: string;
};

/**
 * Persistent per-projectile render rig. Projectiles appear/disappear frequently,
 * but a given projectile keeps a constant radius across its lifetime, so its
 * sphere geometry is built once and reused; the trail's endpoints are updated in
 * place (no per-frame allocation). Body/trail materials are shared at scene level.
 */
type ProjectileRig = {
  group: THREE.Group;
  body: THREE.Mesh;
  sphereGeometry: THREE.SphereGeometry;
  trailGeometry: THREE.BufferGeometry;
  trailPositions: THREE.Float32BufferAttribute;
};

export type BattleSceneInput = {
  obstacles: StaticObstacleFrame[];
};

export type BattleScene = {
  /** The persistent THREE scene. Statics (ground/grid/lights/obstacles) live for the whole handle. */
  readonly scene: THREE.Scene;
  /** Reconcile the persistent unit/projectile rigs to the given frame. Allocates nothing per frame except documented exceptions (new rigs, scan-arc geometry rebuild on param change, new projectile radii). */
  sync(frame: BattleFrame | null): void;
  /** Fully dispose the scene, every rig, and shared resources. Called on replay switch. */
  dispose(): void;
};

/**
 * Builds the static scene once (ground, grid, lights, obstacles, shared projectile
 * materials) and returns a handle whose `sync` updates persistent unit/projectile
 * rigs per frame. Nothing here is rebuilt on frame stepping; `dispose` tears the
 * whole thing down on replay switch.
 */
export function createBattleScene(input: BattleSceneInput): BattleScene {
  const scene = new THREE.Scene();
  scene.name = "robolocks-battle-scene";
  scene.background = new THREE.Color("#1b211b");

  const ground = createGround();
  const lighting = createLights();
  scene.add(ground);
  scene.add(lighting);

  const obstacleMeshes: THREE.Mesh[] = [];
  for (const obstacle of input.obstacles) {
    const mesh = createObstacle(obstacle);
    obstacleMeshes.push(mesh);
    scene.add(mesh);
  }

  // Shared, scene-lifetime projectile resources. Their color is constant across
  // every projectile and every replay, so a single instance is reused by all
  // projectile rigs and disposed exactly once on teardown.
  const projectileMaterial = new THREE.MeshStandardMaterial({
    color: "#ffe36a",
    emissive: "#7a4d13",
    emissiveIntensity: 0.35,
    roughness: 0.45,
  });
  const trailMaterial = new THREE.LineBasicMaterial({
    color: "#fff1a8",
    transparent: true,
    opacity: 0.7,
  });

  const unitRigs = new Map<number, UnitRig>();
  const projectileRigs = new Map<number, ProjectileRig>();

  const syncUnits = (frame: BattleFrame): void => {
    const seen = new Set<number>();
    for (const unit of frame.units) {
      seen.add(unit.unitId);
      const scanAction = frame.actions.find(
        (action) => action.unitId === unit.unitId && action.type === "scanArc",
      );
      let rig = unitRigs.get(unit.unitId);
      if (!rig) {
        rig = createUnitRig(unit, scanAction);
        unitRigs.set(unit.unitId, rig);
        scene.add(rig.group);
        scene.add(rig.scanArc);
      }
      updateUnitRig(rig, unit, scanAction);
    }
    for (const [unitId, rig] of unitRigs) {
      if (!seen.has(unitId)) {
        destroyUnitRig(scene, rig);
        unitRigs.delete(unitId);
      }
    }
  };

  const syncProjectiles = (frame: BattleFrame): void => {
    const seen = new Set<number>();
    for (const projectile of frame.projectiles) {
      seen.add(projectile.projectileId);
      let rig = projectileRigs.get(projectile.projectileId);
      if (!rig) {
        rig = createProjectileRig(projectile, projectileMaterial, trailMaterial);
        projectileRigs.set(projectile.projectileId, rig);
        scene.add(rig.group);
      }
      updateProjectileRig(rig, projectile);
    }
    for (const [projectileId, rig] of projectileRigs) {
      if (!seen.has(projectileId)) {
        destroyProjectileRig(scene, rig);
        projectileRigs.delete(projectileId);
      }
    }
  };

  return {
    scene,
    sync(frame: BattleFrame | null): void {
      if (!frame) {
        for (const [, rig] of unitRigs) {
          destroyUnitRig(scene, rig);
        }
        unitRigs.clear();
        for (const [, rig] of projectileRigs) {
          destroyProjectileRig(scene, rig);
        }
        projectileRigs.clear();
        return;
      }
      syncUnits(frame);
      syncProjectiles(frame);
    },
    dispose(): void {
      for (const [, rig] of unitRigs) {
        destroyUnitRig(scene, rig);
      }
      unitRigs.clear();
      for (const [, rig] of projectileRigs) {
        destroyProjectileRig(scene, rig);
      }
      projectileRigs.clear();

      disposeObjectTree(ground);
      scene.remove(ground);
      scene.remove(lighting);
      for (const mesh of obstacleMeshes) {
        disposeObjectTree(mesh);
        scene.remove(mesh);
      }
      obstacleMeshes.length = 0;

      projectileMaterial.dispose();
      trailMaterial.dispose();
    },
  };
}

export function replayToWorld(position: { x: number; y: number }, heightMeters = 0): THREE.Vector3 {
  return new THREE.Vector3(position.x, heightMeters, position.y);
}

function createGround(): THREE.Group {
  const group = new THREE.Group();
  group.name = "terrain";

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(56, 36),
    new THREE.MeshStandardMaterial({ color: "#252d24", roughness: 0.92 }),
  );
  plane.name = "terrain-plane";
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(20, -0.03, 12);
  plane.receiveShadow = true;
  group.add(plane);

  const grid = new THREE.GridHelper(56, 28, "#62705c", "#394137");
  grid.name = "terrain-grid";
  grid.position.set(20, 0, 12);
  group.add(grid);

  return group;
}

function createLights(): THREE.Group {
  const group = new THREE.Group();
  group.name = "lighting";

  const ambient = new THREE.HemisphereLight("#dce8cf", "#121711", 1.35);
  ambient.name = "hemisphere-light";
  group.add(ambient);

  const key = new THREE.DirectionalLight("#f4f1d0", 2.4);
  key.name = "key-light";
  key.position.set(12, 24, 8);
  key.castShadow = true;
  group.add(key);

  return group;
}

function createObstacle(obstacle: StaticObstacleFrame): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(obstacle.radiusMeters, obstacle.radiusMeters, 0.9, 32),
    new THREE.MeshStandardMaterial({
      color: obstacle.blocksLineOfSight ? "#606b59" : "#485041",
      roughness: 0.86,
    }),
  );
  mesh.name = `obstacle-${obstacle.id}`;
  mesh.position.copy(replayToWorld(obstacle.position, 0.45));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    radiusMeters: obstacle.radiusMeters,
    blocksMovement: obstacle.blocksMovement,
    blocksLineOfSight: obstacle.blocksLineOfSight,
  };
  return mesh;
}

function createUnitRig(unit: UnitFrame, scanAction: ScanAction | undefined): UnitRig {
  const group = new THREE.Group();
  group.name = `unit-${unit.unitId}`;
  group.userData = {
    unitId: unit.unitId,
    name: unit.name,
    armorIntegrity: unit.armorIntegrity,
  };

  const hull = createHull(unit);
  const mobility = createMobilityModule(unit);
  const armor = createArmorModule(unit);
  const turret = createTurret(unit);
  const sensor = createSensorModule(unit);

  group.add(mobility);
  group.add(hull);
  group.add(armor);
  group.add(turret);
  group.add(sensor);

  const mount = sensorMountForUnit(unit);
  const scanArc = createScanArc(unit, scanAction, mount);

  const rig: UnitRig = {
    group,
    turret,
    sensor,
    scanArc,
    hullMaterial: hull.material as THREE.MeshStandardMaterial,
    armorMaterial: (armor.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial,
    scanArcMaterial: scanArc.material as THREE.MeshBasicMaterial,
    mount,
    lastArcKey: scanArc.userData.arcKey as string,
  };
  return rig;
}

function updateUnitRig(rig: UnitRig, unit: UnitFrame, scanAction: ScanAction | undefined): void {
  rig.group.position.set(unit.position.x, 0, unit.position.y);
  rig.group.rotation.y = -THREE.MathUtils.degToRad(unit.hullHeadingDegrees);
  rig.group.userData.armorIntegrity = unit.armorIntegrity;

  const turretRelative = -THREE.MathUtils.degToRad(unit.turretHeadingDegrees - unit.hullHeadingDegrees);
  rig.turret.rotation.y = turretRelative;
  rig.sensor.rotation.y = turretRelative;

  rig.hullMaterial.color.set(unitColor(unit));
  rig.armorMaterial.color.set(armorColorForIntegrity(unit.armorIntegrity, unit.modules.armor.integrity));

  updateScanArc(rig, unit, scanAction);
}

function destroyUnitRig(scene: THREE.Scene, rig: UnitRig): void {
  scene.remove(rig.group);
  scene.remove(rig.scanArc);
  disposeObjectTree(rig.group);
  disposeObjectTree(rig.scanArc);
}

function createHull(unit: UnitFrame): THREE.Mesh {
  const metrics = shapeMetrics(unit.bodyShape);
  const material = new THREE.MeshStandardMaterial({
    color: unitColor(unit),
    roughness: 0.78,
    metalness: 0.08,
  });
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(metrics.lengthMeters, HULL_HEIGHT_M, metrics.widthMeters),
    material,
  );
  mesh.name = `unit-${unit.unitId}-hull`;
  mesh.position.y = HULL_HEIGHT_M / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    lengthMeters: metrics.lengthMeters,
    widthMeters: metrics.widthMeters,
    heightMeters: HULL_HEIGHT_M,
  };
  return mesh;
}

function createMobilityModule(unit: UnitFrame): THREE.Group {
  const metrics = shapeMetrics(unit.bodyShape);
  const group = new THREE.Group();
  group.name = `unit-${unit.unitId}-mobility-module`;

  const trackWidth = Math.max(MIN_TRACK_WIDTH_M, metrics.widthMeters * 0.18);
  const trackLength = metrics.lengthMeters * 1.02;
  const trackHeight = 0.34 + Math.min(0.18, unit.modules.mobility.maxSpeedMetersPerSecond / 80);
  const trackOffsetZ = metrics.widthMeters / 2 + trackWidth * 0.32;
  const turnScore = Math.min(1, unit.modules.mobility.maxHullTurnDegreesPerSecond / 180);

  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(
      new THREE.BoxGeometry(trackLength, trackHeight, trackWidth),
      new THREE.MeshStandardMaterial({
        color: "#161b16",
        roughness: 0.88,
        metalness: 0.12,
      }),
    );
    track.name = `unit-${unit.unitId}-track-${side < 0 ? "left" : "right"}`;
    track.position.set(0, trackHeight / 2, side * trackOffsetZ);
    track.castShadow = true;
    track.receiveShadow = true;
    group.add(track);

    const shoeCount = Math.max(5, Math.round(5 + turnScore * 5));
    const shoeLength = trackLength / (shoeCount * 1.7);
    for (let index = 0; index < shoeCount; index += 1) {
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(shoeLength, 0.035, trackWidth * 1.08),
        new THREE.MeshStandardMaterial({ color: "#30382f", roughness: 0.84 }),
      );
      shoe.name = `unit-${unit.unitId}-track-shoe-${side < 0 ? "left" : "right"}-${index}`;
      shoe.position.set(-trackLength / 2 + ((index + 0.5) * trackLength) / shoeCount, trackHeight + 0.02, side * trackOffsetZ);
      group.add(shoe);
    }
  }

  group.userData = {
    moduleId: unit.modules.mobility.id,
    maxSpeedMetersPerSecond: unit.modules.mobility.maxSpeedMetersPerSecond,
    maxHullTurnDegreesPerSecond: unit.modules.mobility.maxHullTurnDegreesPerSecond,
    trackWidth,
    trackLength,
  };
  return group;
}

function createArmorModule(unit: UnitFrame): THREE.Group {
  const metrics = shapeMetrics(unit.bodyShape);
  const group = new THREE.Group();
  group.name = `unit-${unit.unitId}-armor-module`;

  const maxArmor = Math.max(1, unit.modules.armor.frontMillimeters, unit.modules.armor.sideMillimeters, unit.modules.armor.rearMillimeters);
  const frontDepth = armorPlateDepth(unit.modules.armor.frontMillimeters, maxArmor);
  const sideDepth = armorPlateDepth(unit.modules.armor.sideMillimeters, maxArmor);
  const rearDepth = armorPlateDepth(unit.modules.armor.rearMillimeters, maxArmor);
  const armorColor = armorColorForIntegrity(unit.armorIntegrity, unit.modules.armor.integrity);
  const material = new THREE.MeshStandardMaterial({
    color: armorColor,
    roughness: 0.7,
    metalness: 0.16,
  });

  const front = new THREE.Mesh(
    new THREE.BoxGeometry(frontDepth, ARMOR_OVERLAY_HEIGHT_M, metrics.widthMeters * 1.02),
    material,
  );
  front.name = `unit-${unit.unitId}-armor-front`;
  front.position.set(metrics.lengthMeters / 2 + frontDepth / 2, HULL_HEIGHT_M + ARMOR_OVERLAY_HEIGHT_M / 2, 0);
  group.add(front);

  const rear = new THREE.Mesh(
    new THREE.BoxGeometry(rearDepth, ARMOR_OVERLAY_HEIGHT_M, metrics.widthMeters * 1.02),
    material,
  );
  rear.name = `unit-${unit.unitId}-armor-rear`;
  rear.position.set(-metrics.lengthMeters / 2 - rearDepth / 2, HULL_HEIGHT_M + ARMOR_OVERLAY_HEIGHT_M / 2, 0);
  group.add(rear);

  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(metrics.lengthMeters, ARMOR_OVERLAY_HEIGHT_M, sideDepth),
      material,
    );
    plate.name = `unit-${unit.unitId}-armor-${side < 0 ? "left" : "right"}`;
    plate.position.set(0, HULL_HEIGHT_M + ARMOR_OVERLAY_HEIGHT_M / 2, side * (metrics.widthMeters / 2 + sideDepth / 2));
    group.add(plate);
  }

  group.userData = {
    moduleId: unit.modules.armor.id,
    frontMillimeters: unit.modules.armor.frontMillimeters,
    sideMillimeters: unit.modules.armor.sideMillimeters,
    rearMillimeters: unit.modules.armor.rearMillimeters,
  };
  return group;
}

function createTurret(unit: UnitFrame): THREE.Group {
  const metrics = shapeMetrics(unit.bodyShape);
  const group = new THREE.Group();
  group.name = `unit-${unit.unitId}-turret`;

  const turnRatio = Math.max(0.45, Math.min(1.2, unit.modules.turret.maxTurnDegreesPerSecond / 180));
  const turretLength = metrics.lengthMeters * TURRET_LENGTH_RATIO * Math.max(0.88, 1.08 - turnRatio * 0.08);
  const turretWidth = metrics.widthMeters * TURRET_WIDTH_RATIO * Math.max(0.9, 1.12 - turnRatio * 0.08);
  const turret = new THREE.Mesh(
    new THREE.BoxGeometry(turretLength, TURRET_HEIGHT_M, turretWidth),
    new THREE.MeshStandardMaterial({ color: "#d7dfc1", roughness: 0.72, metalness: 0.06 }),
  );
  turret.name = `unit-${unit.unitId}-turret-block`;
  turret.position.x = turretLength * 0.08;
  turret.position.y = HULL_HEIGHT_M + TURRET_HEIGHT_M / 2;
  turret.castShadow = true;
  group.add(turret);

  const muzzle = unit.modules.weapon.muzzleOffsetMeters;
  const barrelBaseX = Math.min(muzzle.x - MIN_BARREL_LENGTH_M, turretLength * 0.35);
  const barrelLength = Math.max(MIN_BARREL_LENGTH_M, muzzle.x - barrelBaseX);
  const barrelCaliber = weaponCaliber(unit);
  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(barrelLength, barrelCaliber, barrelCaliber * 1.25),
    new THREE.MeshStandardMaterial({ color: "#11150f", roughness: 0.62, metalness: 0.22 }),
  );
  barrel.name = `unit-${unit.unitId}-barrel`;
  barrel.position.x = muzzle.x - barrelLength / 2;
  barrel.position.y = muzzle.z;
  barrel.position.z = muzzle.y;
  barrel.userData = {
    muzzleOffsetMeters: muzzle,
    muzzleEndLocal: { x: muzzle.x, y: muzzle.z, z: muzzle.y },
  };
  group.add(barrel);

  const muzzleCap = new THREE.Mesh(
    new THREE.BoxGeometry(barrelCaliber * 0.42, barrelCaliber * 1.18, barrelCaliber * 1.5),
    new THREE.MeshStandardMaterial({ color: "#080a08", roughness: 0.55, metalness: 0.28 }),
  );
  muzzleCap.name = `unit-${unit.unitId}-muzzle`;
  muzzleCap.position.set(muzzle.x + barrelCaliber * 0.12, muzzle.z, muzzle.y);
  group.add(muzzleCap);

  group.rotation.y = -THREE.MathUtils.degToRad(unit.turretHeadingDegrees - unit.hullHeadingDegrees);
  group.userData = {
    turretModuleId: unit.modules.turret.id,
    weaponModuleId: unit.modules.weapon.id,
    fireMode: unit.modules.weapon.fireMode,
    damage: unit.modules.weapon.damage,
    penetrationMillimeters: unit.modules.weapon.penetrationMillimeters,
    muzzleVelocityMetersPerSecond: unit.modules.weapon.muzzleVelocityMetersPerSecond,
    reloadTicks: unit.modules.weapon.reloadTicks,
    barrelLength,
    barrelCaliber,
  };
  return group;
}

function createSensorModule(unit: UnitFrame): THREE.Group {
  const mount = sensorMountForUnit(unit);
  const group = new THREE.Group();
  group.name = `unit-${unit.unitId}-sensor-module`;
  group.rotation.y = -THREE.MathUtils.degToRad(unit.turretHeadingDegrees - unit.hullHeadingDegrees);

  const rangeRatio = Math.min(1.4, Math.max(0.45, unit.modules.sensor.rangeMeters / 60));
  const fovRatio = Math.min(1.25, Math.max(0.55, unit.modules.sensor.fovDegrees / 120));
  const mastHeight = 0.28 + rangeRatio * 0.42;
  const opticWidth = 0.28 + fovRatio * 0.32;

  const mast = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, mastHeight, 0.1),
    new THREE.MeshStandardMaterial({ color: "#171c17", roughness: 0.62, metalness: 0.16 }),
  );
  mast.name = `unit-${unit.unitId}-sensor-mast`;
  mast.position.set(mount.base.x, mount.base.y + mastHeight / 2, mount.base.z);
  group.add(mast);

  const optic = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.2, opticWidth),
    new THREE.MeshStandardMaterial({
      color: "#1f2a2d",
      emissive: "#163947",
      emissiveIntensity: 0.18,
      roughness: 0.52,
      metalness: 0.12,
    }),
  );
  optic.name = `unit-${unit.unitId}-sensor-optic`;
  optic.position.set(mount.origin.x, mount.origin.y, mount.origin.z);
  group.add(optic);

  group.userData = {
    moduleId: unit.modules.sensor.id,
    rangeMeters: unit.modules.sensor.rangeMeters,
    fovDegrees: unit.modules.sensor.fovDegrees,
    refreshTicks: unit.modules.sensor.refreshTicks,
    mastHeight,
    opticWidth,
    originLocal: { x: mount.origin.x, y: mount.origin.y, z: mount.origin.z },
  };
  return group;
}

function createProjectileRig(
  projectile: ProjectileFrame,
  bodyMaterial: THREE.MeshStandardMaterial,
  trailMaterial: THREE.LineBasicMaterial,
): ProjectileRig {
  const group = new THREE.Group();
  group.name = `projectile-${projectile.projectileId}`;

  const radius = Math.max(0.09, projectile.radiusMeters);
  const sphereGeometry = new THREE.SphereGeometry(radius, 16, 12);
  const body = new THREE.Mesh(sphereGeometry, bodyMaterial);
  body.name = `projectile-${projectile.projectileId}-body`;
  body.castShadow = true;
  group.add(body);

  const trailPositions = new THREE.Float32BufferAttribute(new Float32Array(6), 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute("position", trailPositions);
  const trail = new THREE.Line(trailGeometry, trailMaterial);
  trail.name = `projectile-${projectile.projectileId}-trail`;
  group.add(trail);

  body.userData = {
    projectileId: projectile.projectileId,
    ownerUnitId: projectile.ownerUnitId,
    radiusMeters: projectile.radiusMeters,
    previousHeightMeters: projectile.previousHeightMeters,
    heightMeters: projectile.heightMeters,
  };

  return { group, body, sphereGeometry, trailGeometry, trailPositions };
}

function updateProjectileRig(rig: ProjectileRig, projectile: ProjectileFrame): void {
  rig.body.position.set(projectile.position.x, projectile.heightMeters, projectile.position.y);
  rig.body.userData.previousHeightMeters = projectile.previousHeightMeters;
  rig.body.userData.heightMeters = projectile.heightMeters;

  const array = rig.trailPositions.array as Float32Array;
  array[0] = projectile.previousPosition.x;
  array[1] = projectile.previousHeightMeters;
  array[2] = projectile.previousPosition.y;
  array[3] = projectile.position.x;
  array[4] = projectile.heightMeters;
  array[5] = projectile.position.y;
  rig.trailPositions.needsUpdate = true;
  rig.trailGeometry.computeBoundingSphere();
}

function destroyProjectileRig(scene: THREE.Scene, rig: ProjectileRig): void {
  scene.remove(rig.group);
  // Sphere + trail geometry are rig-owned; body/trail materials are shared and
  // disposed once at scene teardown, so they are intentionally not touched here.
  rig.sphereGeometry.dispose();
  rig.trailGeometry.dispose();
}

function createScanArc(unit: UnitFrame, action: ScanAction | undefined, mount: SensorMount): THREE.Mesh {
  const params = scanArcParams(unit, action, mount);
  const geometry = buildScanArcGeometry(params.rangeMeters, params.directionDegrees, params.widthDegrees);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: teamColor(unit.teamId).arc,
      transparent: true,
      opacity: action ? 0.24 : 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.name = `unit-${unit.unitId}-scan-arc`;
  mesh.renderOrder = 1;
  mesh.userData = {
    unitId: unit.unitId,
    rangeMeters: params.rangeMeters,
    directionDegrees: params.rawDirectionDegrees,
    widthDegrees: params.widthDegrees,
    originLocal: { x: mount.origin.x, y: mount.origin.y, z: mount.origin.z },
    originHeightMeters: mount.origin.y,
    arcKey: params.arcKey,
  };
  applyScanArcTransform(mesh, unit, mount);
  return mesh;
}

function updateScanArc(rig: UnitRig, unit: UnitFrame, action: ScanAction | undefined): void {
  const params = scanArcParams(unit, action, rig.mount);
  if (params.arcKey !== rig.lastArcKey) {
    // Documented per-frame exception: the scan-arc's triangle fan geometry depends
    // on range/direction/width, which change when a scan action is present. We only
    // rebuild (and dispose the old geometry) when those params actually change, so a
    // static sensor cone allocates nothing on subsequent frames.
    rig.scanArc.geometry.dispose();
    rig.scanArc.geometry = buildScanArcGeometry(params.rangeMeters, params.directionDegrees, params.widthDegrees);
    rig.lastArcKey = params.arcKey;
  }
  rig.scanArcMaterial.opacity = action ? 0.24 : 0.14;
  rig.scanArc.userData.rangeMeters = params.rangeMeters;
  rig.scanArc.userData.directionDegrees = params.rawDirectionDegrees;
  rig.scanArc.userData.widthDegrees = params.widthDegrees;
  rig.scanArc.userData.arcKey = params.arcKey;
  applyScanArcTransform(rig.scanArc, unit, rig.mount);
}

type ScanArcParams = {
  rangeMeters: number;
  directionDegrees: number;
  widthDegrees: number;
  rawDirectionDegrees: number;
  arcKey: string;
};

function scanArcParams(unit: UnitFrame, action: ScanAction | undefined, _mount: SensorMount): ScanArcParams {
  const sensorRange = Math.max(0, unit.modules.sensor.rangeMeters);
  const actionRange = typeof action?.rangeMeters === "number" && action.rangeMeters > 0 ? action.rangeMeters : sensorRange;
  const rangeMeters = Math.min(actionRange, sensorRange);
  const rawDirectionDegrees = action?.directionDegrees ?? unit.hullHeadingDegrees;
  const directionDegrees = rawDirectionDegrees - unit.hullHeadingDegrees;
  const widthDegrees = Math.max(0, Math.min(action?.widthDegrees ?? unit.modules.sensor.fovDegrees, unit.modules.sensor.fovDegrees));
  return {
    rangeMeters,
    directionDegrees,
    widthDegrees,
    rawDirectionDegrees,
    arcKey: `${rangeMeters}|${directionDegrees}|${widthDegrees}`,
  };
}

function buildScanArcGeometry(rangeMeters: number, directionDegrees: number, widthDegrees: number): THREE.BufferGeometry {
  const segmentCount = Math.max(8, Math.ceil(widthDegrees / 6));
  const startDegrees = directionDegrees - widthDegrees / 2;
  const vertices: number[] = [0, 0, 0];

  for (let index = 0; index <= segmentCount; index += 1) {
    const degrees = startDegrees + (widthDegrees * index) / segmentCount;
    const radians = THREE.MathUtils.degToRad(degrees);
    vertices.push(Math.cos(radians) * rangeMeters, 0, Math.sin(radians) * rangeMeters);
  }

  const indices: number[] = [];
  for (let index = 1; index <= segmentCount; index += 1) {
    indices.push(0, index, index + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function applyScanArcTransform(mesh: THREE.Mesh, unit: UnitFrame, mount: SensorMount): void {
  mesh.position.set(unit.position.x, mount.origin.y, unit.position.y);
  mesh.rotation.set(0, -THREE.MathUtils.degToRad(unit.hullHeadingDegrees), 0);
  mesh.translateX(mount.origin.x);
  mesh.translateZ(mount.origin.z);
}

function shapeMetrics(shape: BodyShapeFrame): { lengthMeters: number; widthMeters: number } {
  if (shape.type === "box") {
    return { lengthMeters: shape.lengthMeters, widthMeters: shape.widthMeters };
  }
  return { lengthMeters: shape.radiusMeters * 2, widthMeters: shape.radiusMeters * 2 };
}

function armorPlateDepth(millimeters: number, maxArmorMillimeters: number): number {
  return 0.08 + Math.max(0, millimeters / maxArmorMillimeters) * 0.26;
}

function armorColorForIntegrity(current: number, maximum: number): THREE.ColorRepresentation {
  const ratio = maximum > 0 ? current / maximum : 0;
  if (ratio <= 0.25) {
    return "#7b5147";
  }
  if (ratio <= 0.6) {
    return "#7c7358";
  }
  return "#8e9a84";
}

function weaponCaliber(unit: UnitFrame): number {
  const damageScale = Math.sqrt(Math.max(1, unit.modules.weapon.damage)) / 55;
  const penetrationScale = Math.sqrt(Math.max(1, unit.modules.weapon.penetrationMillimeters)) / 90;
  const ballisticBoost = unit.modules.weapon.fireMode === "ballistic" ? 0.04 : 0;
  return Math.max(0.12, Math.min(0.34, 0.11 + damageScale + penetrationScale + ballisticBoost));
}

function sensorMountForUnit(unit: UnitFrame): SensorMount {
  const metrics = shapeMetrics(unit.bodyShape);
  const rangeRatio = Math.min(1.4, Math.max(0.45, unit.modules.sensor.rangeMeters / 60));
  const mastHeight = 0.28 + rangeRatio * 0.42;
  const base = new THREE.Vector3(
    -metrics.lengthMeters * 0.16,
    HULL_HEIGHT_M + TURRET_HEIGHT_M,
    0,
  );
  return {
    base,
    origin: new THREE.Vector3(
      base.x + 0.18,
      base.y + mastHeight + 0.1,
      base.z,
    ),
  };
}

function unitColor(unit: UnitFrame): THREE.ColorRepresentation {
  if (unit.armorIntegrity <= 0) {
    return "#4a4d46";
  }
  return teamColor(unit.teamId).body;
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const item of material) {
        item.dispose();
      }
    } else if (material) {
      material.dispose();
    }
  });
}
