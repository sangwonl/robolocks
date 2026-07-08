import type { BattleAction, BattleEvent, BattleFrame, BodyShapeFrame, ProjectileFrame, StaticObstacleFrame, UnitFrame, UnitIntentsFrame, UnitModulesFrame } from "../types/protocol";

export type BattleReplay = {
  type: "robolocks.replay.v1";
  tickRate: number;
  obstacles: StaticObstacleFrame[];
  frames: BattleFrame[];
};

type ReplayPayload = {
  type?: unknown;
  tickRate?: unknown;
  obstacles?: unknown;
  frames?: unknown;
};

type ReplayFramePayload = {
  tick?: unknown;
  units?: unknown;
  projectiles?: unknown;
  events?: unknown;
  actions?: unknown;
};

type ReplayUnitPayload = {
  unitId?: unknown;
  position?: unknown;
  hullHeadingDegrees?: unknown;
  turretHeadingDegrees?: unknown;
  armorIntegrity?: unknown;
  weaponCooldownTicks?: unknown;
  bodyShape?: unknown;
  modules?: unknown;
  intents?: unknown;
};

type ReplayBodyShapePayload = {
  type?: unknown;
  radiusMeters?: unknown;
  lengthMeters?: unknown;
  widthMeters?: unknown;
};

type ReplayObstaclePayload = {
  id?: unknown;
  position?: unknown;
  radiusMeters?: unknown;
  blocksMovement?: unknown;
  blocksLineOfSight?: unknown;
};

type ReplayEventPayload = {
  tick?: unknown;
  unitId?: unknown;
  code?: unknown;
  message?: unknown;
  payload?: unknown;
};

type ReplayActionPayload = {
  unitId?: unknown;
  type?: unknown;
  channel?: unknown;
  position?: unknown;
  target?: unknown;
  minHitChance?: unknown;
  directionDegrees?: unknown;
  widthDegrees?: unknown;
};

type ReplayProjectilePayload = {
  projectileId?: unknown;
  ownerUnitId?: unknown;
  previousPosition?: unknown;
  position?: unknown;
  radiusMeters?: unknown;
  previousHeightMeters?: unknown;
  heightMeters?: unknown;
};

type ReplayIntentPayload = {
  active?: unknown;
  target?: unknown;
  remainingMeters?: unknown;
  errorDegrees?: unknown;
  minHitChance?: unknown;
  ageTicks?: unknown;
};

type ReplayModulesPayload = {
  mobility?: unknown;
  turret?: unknown;
  weapon?: unknown;
  armor?: unknown;
  body?: unknown;
  sensor?: unknown;
};

export function parseBattleReplay(text: string): BattleReplay {
  const payload = JSON.parse(text) as ReplayPayload;
  if (payload.type !== "robolocks.replay.v1") {
    throw new Error("Unsupported replay type");
  }
  if (typeof payload.tickRate !== "number" || !Array.isArray(payload.frames)) {
    throw new Error("Invalid replay payload");
  }

  return {
    type: "robolocks.replay.v1",
    tickRate: payload.tickRate,
    obstacles: Array.isArray(payload.obstacles) ? payload.obstacles.map(parseObstacle) : [],
    frames: payload.frames.map(parseFrame),
  };
}

function parseFrame(payload: unknown): BattleFrame {
  const frame = payload as ReplayFramePayload;
  if (typeof frame.tick !== "number" || !Array.isArray(frame.units)) {
    throw new Error("Invalid replay frame");
  }

  return {
    tick: frame.tick,
    units: frame.units.map(parseUnit),
    projectiles: Array.isArray(frame.projectiles) ? frame.projectiles.map(parseProjectile) : [],
    events: Array.isArray(frame.events) ? frame.events.map(parseEvent) : [],
    actions: Array.isArray(frame.actions) ? frame.actions.map(parseAction) : [],
  };
}

function parseProjectile(payload: unknown): ProjectileFrame {
  const projectile = payload as ReplayProjectilePayload;
  if (
    typeof projectile !== "object" ||
    projectile === null ||
    typeof projectile.projectileId !== "number" ||
    typeof projectile.ownerUnitId !== "number" ||
    typeof projectile.radiusMeters !== "number"
  ) {
    throw new Error("Invalid replay projectile");
  }

  return {
    projectileId: projectile.projectileId,
    ownerUnitId: projectile.ownerUnitId,
    previousPosition: parseVec(projectile.previousPosition, "Invalid replay projectile previous position"),
    position: parseVec(projectile.position, "Invalid replay projectile position"),
    radiusMeters: projectile.radiusMeters,
    previousHeightMeters: typeof projectile.previousHeightMeters === "number"
      ? projectile.previousHeightMeters
      : typeof projectile.heightMeters === "number" ? projectile.heightMeters : 0,
    heightMeters: typeof projectile.heightMeters === "number" ? projectile.heightMeters : 0,
  };
}

function parseUnit(payload: unknown): UnitFrame {
  const unit = payload as ReplayUnitPayload;
  const position = unit.position as { x?: unknown; y?: unknown };
  if (
    typeof unit.unitId !== "number" ||
    typeof position !== "object" ||
    position === null ||
    typeof position.x !== "number" ||
    typeof position.y !== "number" ||
    typeof unit.hullHeadingDegrees !== "number" ||
    typeof unit.turretHeadingDegrees !== "number" ||
    typeof unit.armorIntegrity !== "number"
  ) {
    throw new Error("Invalid replay unit");
  }

  return {
    unitId: unit.unitId,
    name: unitName(unit.unitId),
    position: { x: position.x, y: position.y },
    hullHeadingDegrees: unit.hullHeadingDegrees,
    turretHeadingDegrees: unit.turretHeadingDegrees,
    armorIntegrity: unit.armorIntegrity,
    weaponCooldownTicks: typeof unit.weaponCooldownTicks === "number" ? unit.weaponCooldownTicks : 0,
    bodyShape: parseBodyShape(unit.bodyShape),
    modules: parseModules(unit.modules),
    intents: parseIntents(unit.intents),
  };
}

function parseModules(payload: unknown): UnitModulesFrame {
  const modules = payload as ReplayModulesPayload;
  if (typeof modules !== "object" || modules === null) {
    return defaultModules();
  }
  return {
    mobility: {
      id: stringField(modules.mobility, "id"),
      maxSpeedMetersPerSecond: numberField(modules.mobility, "maxSpeedMetersPerSecond"),
      maxHullTurnDegreesPerSecond: numberField(modules.mobility, "maxHullTurnDegreesPerSecond"),
    },
    turret: {
      id: stringField(modules.turret, "id"),
      maxTurnDegreesPerSecond: numberField(modules.turret, "maxTurnDegreesPerSecond"),
    },
    weapon: {
      id: stringField(modules.weapon, "id"),
      fireMode: stringField(modules.weapon, "fireMode"),
      damage: numberField(modules.weapon, "damage"),
      penetrationMillimeters: numberField(modules.weapon, "penetrationMillimeters"),
      rangeMeters: numberField(modules.weapon, "rangeMeters"),
      muzzleVelocityMetersPerSecond: numberField(modules.weapon, "muzzleVelocityMetersPerSecond"),
      muzzleOffsetMeters: vec3Field(modules.weapon, "muzzleOffsetMeters"),
      launchAngleDegrees: numberField(modules.weapon, "launchAngleDegrees"),
      gravityMetersPerSecondSquared: numberField(modules.weapon, "gravityMetersPerSecondSquared"),
      blastRadiusMeters: numberField(modules.weapon, "blastRadiusMeters"),
      projectileRadiusMeters: numberField(modules.weapon, "projectileRadiusMeters"),
      aimToleranceDegrees: numberField(modules.weapon, "aimToleranceDegrees"),
      reloadTicks: numberField(modules.weapon, "reloadTicks"),
    },
    armor: {
      id: stringField(modules.armor, "id"),
      integrity: numberField(modules.armor, "integrity"),
      frontMillimeters: numberField(modules.armor, "frontMillimeters"),
      sideMillimeters: numberField(modules.armor, "sideMillimeters"),
      rearMillimeters: numberField(modules.armor, "rearMillimeters"),
    },
    body: {
      id: stringField(modules.body, "id"),
      massKilograms: numberField(modules.body, "massKilograms"),
    },
    sensor: {
      id: stringField(modules.sensor, "id"),
      rangeMeters: numberField(modules.sensor, "rangeMeters"),
      fovDegrees: numberField(modules.sensor, "fovDegrees"),
      refreshTicks: numberField(modules.sensor, "refreshTicks"),
    },
  };
}

function stringField(payload: unknown, key: string): string {
  const object = payload as Record<string, unknown>;
  return typeof object === "object" && object !== null && typeof object[key] === "string"
    ? object[key]
    : "";
}

function numberField(payload: unknown, key: string): number {
  const object = payload as Record<string, unknown>;
  return typeof object === "object" && object !== null && typeof object[key] === "number"
    ? object[key]
    : 0;
}

function vec3Field(payload: unknown, key: string): { x: number; y: number; z: number } {
  const object = payload as Record<string, unknown>;
  const value = typeof object === "object" && object !== null ? object[key] : null;
  const vector = value as { x?: unknown; y?: unknown; z?: unknown };
  if (
    typeof vector === "object" &&
    vector !== null &&
    typeof vector.x === "number" &&
    typeof vector.y === "number" &&
    typeof vector.z === "number"
  ) {
    return { x: vector.x, y: vector.y, z: vector.z };
  }
  return { x: 0, y: 0, z: 0 };
}

function defaultModules(): UnitModulesFrame {
  return {
    mobility: { id: "", maxSpeedMetersPerSecond: 0, maxHullTurnDegreesPerSecond: 0 },
    turret: { id: "", maxTurnDegreesPerSecond: 0 },
    weapon: { id: "", fireMode: "direct", damage: 0, penetrationMillimeters: 0, rangeMeters: 0, muzzleVelocityMetersPerSecond: 0, muzzleOffsetMeters: { x: 0, y: 0, z: 0 }, launchAngleDegrees: 0, gravityMetersPerSecondSquared: 9.81, blastRadiusMeters: 0, projectileRadiusMeters: 0, aimToleranceDegrees: 0, reloadTicks: 0 },
    armor: { id: "", integrity: 0, frontMillimeters: 0, sideMillimeters: 0, rearMillimeters: 0 },
    body: { id: "", massKilograms: 0 },
    sensor: { id: "", rangeMeters: 0, fovDegrees: 0, refreshTicks: 0 },
  };
}

function parseIntents(payload: unknown): UnitIntentsFrame {
  const intents = payload as { mobility?: unknown; turret?: unknown; hull?: unknown; weapon?: unknown };
  if (typeof intents !== "object" || intents === null) {
    return defaultIntents();
  }
  return {
    mobility: parseMobilityIntent(intents.mobility),
    turret: parseAngularIntent(intents.turret),
    hull: parseAngularIntent(intents.hull),
    weapon: parseWeaponIntent(intents.weapon),
  };
}

function parseMobilityIntent(payload: unknown): UnitIntentsFrame["mobility"] {
  const intent = payload as ReplayIntentPayload;
  if (typeof intent !== "object" || intent === null || typeof intent.active !== "boolean") {
    return defaultIntents().mobility;
  }
  return {
    active: intent.active,
    target: parseOptionalVec(intent.target),
    remainingMeters: typeof intent.remainingMeters === "number" ? intent.remainingMeters : 0,
    ageTicks: typeof intent.ageTicks === "number" ? intent.ageTicks : 0,
  };
}

function parseAngularIntent(payload: unknown): UnitIntentsFrame["turret"] {
  const intent = payload as ReplayIntentPayload;
  if (typeof intent !== "object" || intent === null || typeof intent.active !== "boolean") {
    return defaultIntents().turret;
  }
  return {
    active: intent.active,
    target: parseOptionalVec(intent.target),
    errorDegrees: typeof intent.errorDegrees === "number" ? intent.errorDegrees : 0,
    ageTicks: typeof intent.ageTicks === "number" ? intent.ageTicks : 0,
  };
}

function parseWeaponIntent(payload: unknown): UnitIntentsFrame["weapon"] {
  const intent = payload as ReplayIntentPayload;
  if (typeof intent !== "object" || intent === null || typeof intent.active !== "boolean") {
    return defaultIntents().weapon;
  }
  return {
    active: intent.active,
    minHitChance: typeof intent.minHitChance === "number" ? intent.minHitChance : 0,
    ageTicks: typeof intent.ageTicks === "number" ? intent.ageTicks : 0,
  };
}

function defaultIntents(): UnitIntentsFrame {
  const zero = { x: 0, y: 0 };
  return {
    mobility: { active: false, target: zero, remainingMeters: 0, ageTicks: 0 },
    turret: { active: false, target: zero, errorDegrees: 0, ageTicks: 0 },
    hull: { active: false, target: zero, errorDegrees: 0, ageTicks: 0 },
    weapon: { active: false, minHitChance: 0, ageTicks: 0 },
  };
}

function parseBodyShape(payload: unknown): BodyShapeFrame {
  const shape = payload as ReplayBodyShapePayload;
  if (
    typeof shape !== "object" ||
    shape === null ||
    typeof shape.type !== "string" ||
    typeof shape.radiusMeters !== "number"
  ) {
    throw new Error("Invalid replay body shape");
  }
  if (shape.type === "circle") {
    return { type: "circle", radiusMeters: shape.radiusMeters };
  }
  if (
    shape.type === "box" &&
    typeof shape.lengthMeters === "number" &&
    typeof shape.widthMeters === "number"
  ) {
    return {
      type: "box",
      radiusMeters: shape.radiusMeters,
      lengthMeters: shape.lengthMeters,
      widthMeters: shape.widthMeters,
    };
  }
  throw new Error("Invalid replay body shape");
}

function parseObstacle(payload: unknown): StaticObstacleFrame {
  const obstacle = payload as ReplayObstaclePayload;
  const position = obstacle.position as { x?: unknown; y?: unknown };
  if (
    typeof obstacle.id !== "string" ||
    typeof position !== "object" ||
    position === null ||
    typeof position.x !== "number" ||
    typeof position.y !== "number" ||
    typeof obstacle.radiusMeters !== "number" ||
    typeof obstacle.blocksMovement !== "boolean" ||
    typeof obstacle.blocksLineOfSight !== "boolean"
  ) {
    throw new Error("Invalid replay obstacle");
  }

  return {
    id: obstacle.id,
    position: { x: position.x, y: position.y },
    radiusMeters: obstacle.radiusMeters,
    blocksMovement: obstacle.blocksMovement,
    blocksLineOfSight: obstacle.blocksLineOfSight,
  };
}

function parseEvent(payload: unknown): BattleEvent {
  const event = payload as ReplayEventPayload;
  if (
    typeof event.tick !== "number" ||
    typeof event.unitId !== "number" ||
    typeof event.code !== "string" ||
    typeof event.message !== "string"
  ) {
    throw new Error("Invalid replay event");
  }

  return {
    tick: event.tick,
    unitId: event.unitId,
    code: event.code,
    message: event.message,
    payload: parseEventPayload(event.payload),
  };
}

function parseEventPayload(payload: unknown): BattleEvent["payload"] {
  if (typeof payload !== "object" || payload === null) {
    return defaultEventPayload();
  }
  const eventPayload = payload as Partial<Record<string, unknown>>;
  return {
    projectileId: numberField(eventPayload, "projectileId"),
    damageType: stringField(eventPayload, "damageType"),
    armorFacing: stringField(eventPayload, "armorFacing"),
    damage: numberField(eventPayload, "damage"),
    remainingArmor: numberField(eventPayload, "remainingArmor"),
    penetrationMillimeters: numberField(eventPayload, "penetrationMillimeters"),
    armorMillimeters: numberField(eventPayload, "armorMillimeters"),
    impactDistanceMeters: numberField(eventPayload, "impactDistanceMeters"),
    blastRadiusMeters: numberField(eventPayload, "blastRadiusMeters"),
  };
}

function defaultEventPayload(): BattleEvent["payload"] {
  return {
    projectileId: 0,
    damageType: "",
    armorFacing: "",
    damage: 0,
    remainingArmor: 0,
    penetrationMillimeters: 0,
    armorMillimeters: 0,
    impactDistanceMeters: 0,
    blastRadiusMeters: 0,
  };
}

function parseAction(payload: unknown): BattleAction {
  const action = payload as ReplayActionPayload;
  if (
    typeof action.unitId !== "number" ||
    typeof action.type !== "string" ||
    typeof action.channel !== "string"
  ) {
    throw new Error("Invalid replay action");
  }

  const parsed: BattleAction = {
    unitId: action.unitId,
    type: action.type,
    channel: action.channel,
  };
  if (action.position !== undefined) {
    parsed.position = parseVec(action.position, "Invalid replay action position");
  }
  if (action.target !== undefined) {
    parsed.target = parseVec(action.target, "Invalid replay action target");
  }
  if (typeof action.minHitChance === "number") {
    parsed.minHitChance = action.minHitChance;
  }
  if (typeof action.directionDegrees === "number") {
    parsed.directionDegrees = action.directionDegrees;
  }
  if (typeof action.widthDegrees === "number") {
    parsed.widthDegrees = action.widthDegrees;
  }
  return parsed;
}

function parseVec(payload: unknown, errorMessage: string): { x: number; y: number } {
  const vec = payload as { x?: unknown; y?: unknown };
  if (
    typeof vec !== "object" ||
    vec === null ||
    typeof vec.x !== "number" ||
    typeof vec.y !== "number"
  ) {
    throw new Error(errorMessage);
  }
  return { x: vec.x, y: vec.y };
}

function parseOptionalVec(payload: unknown): { x: number; y: number } {
  const vec = payload as { x?: unknown; y?: unknown };
  if (
    typeof vec !== "object" ||
    vec === null ||
    typeof vec.x !== "number" ||
    typeof vec.y !== "number"
  ) {
    return { x: 0, y: 0 };
  }
  return { x: vec.x, y: vec.y };
}

function unitName(unitId: number): string {
  if (unitId === 1) {
    return "Blue";
  }
  if (unitId === 2) {
    return "Red";
  }
  return `Unit ${unitId}`;
}
