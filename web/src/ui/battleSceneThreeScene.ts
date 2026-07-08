import * as THREE from "three";

import type { BattleFrame, BodyShapeFrame, StaticObstacleFrame, UnitFrame } from "../types/protocol";

const HULL_HEIGHT_M = 1.2;
const TURRET_HEIGHT_M = 0.35;
const TURRET_WIDTH_RATIO = 0.48;
const TURRET_LENGTH_RATIO = 0.52;
const MIN_BARREL_LENGTH_M = 0.25;

export type BattleSceneInput = {
  frame: BattleFrame | null;
  obstacles: StaticObstacleFrame[];
};

export function buildBattleScene(input: BattleSceneInput): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = "robolocks-battle-scene";
  scene.background = new THREE.Color("#1b211b");

  scene.add(createGround());
  scene.add(createLights());

  for (const obstacle of input.obstacles) {
    scene.add(createObstacle(obstacle));
  }

  if (input.frame) {
    for (const unit of input.frame.units) {
      scene.add(createUnit(unit));
    }
    for (const unit of input.frame.units) {
      const scanAction = input.frame.actions.find((action) => action.unitId === unit.unitId && action.type === "scanArc");
      scene.add(createScanArc(unit, scanAction));
    }
    for (const projectile of input.frame.projectiles) {
      const mesh = createProjectile(projectile);
      scene.add(mesh);
    }
  }

  return scene;
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

function createUnit(unit: UnitFrame): THREE.Group {
  const group = new THREE.Group();
  group.name = `unit-${unit.unitId}`;
  group.position.copy(replayToWorld(unit.position, 0));
  group.rotation.y = -THREE.MathUtils.degToRad(unit.hullHeadingDegrees);
  group.userData = {
    unitId: unit.unitId,
    name: unit.name,
    armorIntegrity: unit.armorIntegrity,
  };

  const hull = createHull(unit);
  const turret = createTurret(unit);
  turret.rotation.y = -THREE.MathUtils.degToRad(unit.turretHeadingDegrees - unit.hullHeadingDegrees);

  group.add(hull);
  group.add(turret);
  return group;
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

function createTurret(unit: UnitFrame): THREE.Group {
  const metrics = shapeMetrics(unit.bodyShape);
  const group = new THREE.Group();
  group.name = `unit-${unit.unitId}-turret`;

  const turretLength = metrics.lengthMeters * TURRET_LENGTH_RATIO;
  const turretWidth = metrics.widthMeters * TURRET_WIDTH_RATIO;
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
  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(barrelLength, 0.14, 0.18),
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

  return group;
}

function createProjectile(projectile: BattleFrame["projectiles"][number]): THREE.Group {
  const group = new THREE.Group();
  group.name = `projectile-${projectile.projectileId}`;

  const radius = Math.max(0.09, projectile.radiusMeters);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshStandardMaterial({
      color: "#ffe36a",
      emissive: "#7a4d13",
      emissiveIntensity: 0.35,
      roughness: 0.45,
    }),
  );
  mesh.name = `projectile-${projectile.projectileId}-body`;
  mesh.position.copy(replayToWorld(projectile.position, projectile.heightMeters));
  mesh.castShadow = true;
  group.add(mesh);

  const trailGeometry = new THREE.BufferGeometry().setFromPoints([
    replayToWorld(projectile.previousPosition, projectile.previousHeightMeters),
    replayToWorld(projectile.position, projectile.heightMeters),
  ]);
  const trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({
      color: "#fff1a8",
      transparent: true,
      opacity: 0.7,
    }),
  );
  trail.name = `projectile-${projectile.projectileId}-trail`;
  group.add(trail);

  mesh.userData = {
    projectileId: projectile.projectileId,
    ownerUnitId: projectile.ownerUnitId,
    radiusMeters: projectile.radiusMeters,
    previousHeightMeters: projectile.previousHeightMeters,
    heightMeters: projectile.heightMeters,
  };
  return group;
}

function createScanArc(unit: UnitFrame, action?: BattleFrame["actions"][number]): THREE.Mesh {
  const sensorRange = Math.max(0, unit.modules.sensor.rangeMeters);
  const actionRange = typeof action?.rangeMeters === "number" && action.rangeMeters > 0 ? action.rangeMeters : sensorRange;
  const rangeMeters = Math.min(actionRange, sensorRange);
  const directionDegrees = action?.directionDegrees ?? unit.hullHeadingDegrees;
  const widthDegrees = Math.max(0, Math.min(action?.widthDegrees ?? unit.modules.sensor.fovDegrees, unit.modules.sensor.fovDegrees));
  const segmentCount = Math.max(8, Math.ceil(widthDegrees / 6));
  const startDegrees = directionDegrees - widthDegrees / 2;
  const vertices: number[] = [0, 0.04, 0];

  for (let index = 0; index <= segmentCount; index += 1) {
    const degrees = startDegrees + (widthDegrees * index) / segmentCount;
    const radians = THREE.MathUtils.degToRad(degrees);
    vertices.push(Math.cos(radians) * rangeMeters, 0.04, Math.sin(radians) * rangeMeters);
  }

  const indices: number[] = [];
  for (let index = 1; index <= segmentCount; index += 1) {
    indices.push(0, index, index + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: unit.name.toLowerCase().includes("red") ? "#ff7a70" : "#77b7ff",
      transparent: true,
      opacity: action ? 0.24 : 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.name = `unit-${unit.unitId}-scan-arc`;
  mesh.position.copy(replayToWorld(unit.position, 0));
  mesh.renderOrder = 1;
  mesh.userData = {
    unitId: unit.unitId,
    rangeMeters,
    directionDegrees,
    widthDegrees,
  };
  return mesh;
}

function shapeMetrics(shape: BodyShapeFrame): { lengthMeters: number; widthMeters: number } {
  if (shape.type === "box") {
    return { lengthMeters: shape.lengthMeters, widthMeters: shape.widthMeters };
  }
  return { lengthMeters: shape.radiusMeters * 2, widthMeters: shape.radiusMeters * 2 };
}

function unitColor(unit: UnitFrame): THREE.ColorRepresentation {
  if (unit.armorIntegrity <= 0) {
    return "#4a4d46";
  }
  const name = unit.name.toLowerCase();
  if (name.includes("red")) {
    return "#b9564f";
  }
  if (name.includes("blue")) {
    return "#527ead";
  }
  return "#788470";
}
