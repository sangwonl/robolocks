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
    for (const projectile of input.frame.projectiles) {
      const mesh = createProjectile(projectile);
      scene.add(mesh);
    }
  }

  return scene;
}

export function replayToWorld(position: { x: number; y: number }, heightM = 0): THREE.Vector3 {
  return new THREE.Vector3(position.x, heightM, position.y);
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
    new THREE.CylinderGeometry(obstacle.radiusM, obstacle.radiusM, 0.9, 32),
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
    radiusM: obstacle.radiusM,
    blocksMovement: obstacle.blocksMovement,
    blocksLineOfSight: obstacle.blocksLineOfSight,
  };
  return mesh;
}

function createUnit(unit: UnitFrame): THREE.Group {
  const group = new THREE.Group();
  group.name = `unit-${unit.unitId}`;
  group.position.copy(replayToWorld(unit.position, 0));
  group.rotation.y = -THREE.MathUtils.degToRad(unit.hullHeadingDeg);
  group.userData = {
    unitId: unit.unitId,
    name: unit.name,
    armorIntegrity: unit.armorIntegrity,
  };

  const hull = createHull(unit);
  const turret = createTurret(unit);
  turret.rotation.y = -THREE.MathUtils.degToRad(unit.turretHeadingDeg - unit.hullHeadingDeg);

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
    new THREE.BoxGeometry(metrics.lengthM, HULL_HEIGHT_M, metrics.widthM),
    material,
  );
  mesh.name = `unit-${unit.unitId}-hull`;
  mesh.position.y = HULL_HEIGHT_M / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    lengthM: metrics.lengthM,
    widthM: metrics.widthM,
    heightM: HULL_HEIGHT_M,
  };
  return mesh;
}

function createTurret(unit: UnitFrame): THREE.Group {
  const metrics = shapeMetrics(unit.bodyShape);
  const group = new THREE.Group();
  group.name = `unit-${unit.unitId}-turret`;

  const turretLength = metrics.lengthM * TURRET_LENGTH_RATIO;
  const turretWidth = metrics.widthM * TURRET_WIDTH_RATIO;
  const turret = new THREE.Mesh(
    new THREE.BoxGeometry(turretLength, TURRET_HEIGHT_M, turretWidth),
    new THREE.MeshStandardMaterial({ color: "#d7dfc1", roughness: 0.72, metalness: 0.06 }),
  );
  turret.name = `unit-${unit.unitId}-turret-block`;
  turret.position.x = turretLength * 0.08;
  turret.position.y = HULL_HEIGHT_M + TURRET_HEIGHT_M / 2;
  turret.castShadow = true;
  group.add(turret);

  const muzzle = unit.modules.weapon.muzzleOffsetM;
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
    muzzleOffsetM: muzzle,
    muzzleEndLocal: { x: muzzle.x, y: muzzle.z, z: muzzle.y },
  };
  group.add(barrel);

  return group;
}

function createProjectile(projectile: BattleFrame["projectiles"][number]): THREE.Group {
  const group = new THREE.Group();
  group.name = `projectile-${projectile.projectileId}`;

  const radius = Math.max(0.09, projectile.radiusM);
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
  mesh.position.copy(replayToWorld(projectile.position, projectile.heightM));
  mesh.castShadow = true;
  group.add(mesh);

  const trailGeometry = new THREE.BufferGeometry().setFromPoints([
    replayToWorld(projectile.previousPosition, projectile.previousHeightM),
    replayToWorld(projectile.position, projectile.heightM),
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
    radiusM: projectile.radiusM,
    previousHeightM: projectile.previousHeightM,
    heightM: projectile.heightM,
  };
  return group;
}

function shapeMetrics(shape: BodyShapeFrame): { lengthM: number; widthM: number } {
  if (shape.type === "box") {
    return { lengthM: shape.lengthM, widthM: shape.widthM };
  }
  return { lengthM: shape.radiusM * 2, widthM: shape.radiusM * 2 };
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
