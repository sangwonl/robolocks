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
  hullHeadingDeg?: unknown;
  turretHeadingDeg?: unknown;
  armorIntegrity?: unknown;
  weaponCooldownTicks?: unknown;
  bodyShape?: unknown;
  modules?: unknown;
  intents?: unknown;
};

type ReplayBodyShapePayload = {
  type?: unknown;
  radiusM?: unknown;
  lengthM?: unknown;
  widthM?: unknown;
};

type ReplayObstaclePayload = {
  id?: unknown;
  position?: unknown;
  radiusM?: unknown;
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
  centerDeg?: unknown;
  widthDeg?: unknown;
};

type ReplayProjectilePayload = {
  projectileId?: unknown;
  ownerUnitId?: unknown;
  previousPosition?: unknown;
  position?: unknown;
  radiusM?: unknown;
  heightM?: unknown;
};

type ReplayIntentPayload = {
  active?: unknown;
  target?: unknown;
  remainingM?: unknown;
  errorDeg?: unknown;
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
    typeof projectile.radiusM !== "number"
  ) {
    throw new Error("Invalid replay projectile");
  }

  return {
    projectileId: projectile.projectileId,
    ownerUnitId: projectile.ownerUnitId,
    previousPosition: parseVec(projectile.previousPosition, "Invalid replay projectile previous position"),
    position: parseVec(projectile.position, "Invalid replay projectile position"),
    radiusM: projectile.radiusM,
    heightM: typeof projectile.heightM === "number" ? projectile.heightM : 0,
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
    typeof unit.hullHeadingDeg !== "number" ||
    typeof unit.turretHeadingDeg !== "number" ||
    typeof unit.armorIntegrity !== "number"
  ) {
    throw new Error("Invalid replay unit");
  }

  return {
    unitId: unit.unitId,
    name: unitName(unit.unitId),
    position: { x: position.x, y: position.y },
    hullHeadingDeg: unit.hullHeadingDeg,
    turretHeadingDeg: unit.turretHeadingDeg,
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
      maxSpeedMps: numberField(modules.mobility, "maxSpeedMps"),
      maxHullTurnDegps: numberField(modules.mobility, "maxHullTurnDegps"),
    },
    turret: {
      id: stringField(modules.turret, "id"),
      maxTurnDegps: numberField(modules.turret, "maxTurnDegps"),
    },
    weapon: {
      id: stringField(modules.weapon, "id"),
      fireMode: stringField(modules.weapon, "fireMode"),
      damage: numberField(modules.weapon, "damage"),
      penetrationMm: numberField(modules.weapon, "penetrationMm"),
      rangeM: numberField(modules.weapon, "rangeM"),
      muzzleVelocityMps: numberField(modules.weapon, "muzzleVelocityMps"),
      launchAngleDeg: numberField(modules.weapon, "launchAngleDeg"),
      gravityMps2: numberField(modules.weapon, "gravityMps2"),
      blastRadiusM: numberField(modules.weapon, "blastRadiusM"),
      projectileRadiusM: numberField(modules.weapon, "projectileRadiusM"),
      aimToleranceDeg: numberField(modules.weapon, "aimToleranceDeg"),
      reloadTicks: numberField(modules.weapon, "reloadTicks"),
    },
    armor: {
      id: stringField(modules.armor, "id"),
      integrity: numberField(modules.armor, "integrity"),
      frontMm: numberField(modules.armor, "frontMm"),
      sideMm: numberField(modules.armor, "sideMm"),
      rearMm: numberField(modules.armor, "rearMm"),
    },
    body: {
      id: stringField(modules.body, "id"),
      massKg: numberField(modules.body, "massKg"),
    },
    sensor: {
      id: stringField(modules.sensor, "id"),
      rangeM: numberField(modules.sensor, "rangeM"),
      fovDeg: numberField(modules.sensor, "fovDeg"),
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

function defaultModules(): UnitModulesFrame {
  return {
    mobility: { id: "", maxSpeedMps: 0, maxHullTurnDegps: 0 },
    turret: { id: "", maxTurnDegps: 0 },
    weapon: { id: "", fireMode: "direct", damage: 0, penetrationMm: 0, rangeM: 0, muzzleVelocityMps: 0, launchAngleDeg: 0, gravityMps2: 9.81, blastRadiusM: 0, projectileRadiusM: 0, aimToleranceDeg: 0, reloadTicks: 0 },
    armor: { id: "", integrity: 0, frontMm: 0, sideMm: 0, rearMm: 0 },
    body: { id: "", massKg: 0 },
    sensor: { id: "", rangeM: 0, fovDeg: 0, refreshTicks: 0 },
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
    remainingM: typeof intent.remainingM === "number" ? intent.remainingM : 0,
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
    errorDeg: typeof intent.errorDeg === "number" ? intent.errorDeg : 0,
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
    mobility: { active: false, target: zero, remainingM: 0, ageTicks: 0 },
    turret: { active: false, target: zero, errorDeg: 0, ageTicks: 0 },
    hull: { active: false, target: zero, errorDeg: 0, ageTicks: 0 },
    weapon: { active: false, minHitChance: 0, ageTicks: 0 },
  };
}

function parseBodyShape(payload: unknown): BodyShapeFrame {
  const shape = payload as ReplayBodyShapePayload;
  if (
    typeof shape !== "object" ||
    shape === null ||
    typeof shape.type !== "string" ||
    typeof shape.radiusM !== "number"
  ) {
    throw new Error("Invalid replay body shape");
  }
  if (shape.type === "circle") {
    return { type: "circle", radiusM: shape.radiusM };
  }
  if (
    shape.type === "box" &&
    typeof shape.lengthM === "number" &&
    typeof shape.widthM === "number"
  ) {
    return {
      type: "box",
      radiusM: shape.radiusM,
      lengthM: shape.lengthM,
      widthM: shape.widthM,
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
    typeof obstacle.radiusM !== "number" ||
    typeof obstacle.blocksMovement !== "boolean" ||
    typeof obstacle.blocksLineOfSight !== "boolean"
  ) {
    throw new Error("Invalid replay obstacle");
  }

  return {
    id: obstacle.id,
    position: { x: position.x, y: position.y },
    radiusM: obstacle.radiusM,
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
    penetrationMm: numberField(eventPayload, "penetrationMm"),
    armorMm: numberField(eventPayload, "armorMm"),
    impactDistanceM: numberField(eventPayload, "impactDistanceM"),
    blastRadiusM: numberField(eventPayload, "blastRadiusM"),
  };
}

function defaultEventPayload(): BattleEvent["payload"] {
  return {
    projectileId: 0,
    damageType: "",
    armorFacing: "",
    damage: 0,
    remainingArmor: 0,
    penetrationMm: 0,
    armorMm: 0,
    impactDistanceM: 0,
    blastRadiusM: 0,
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
  if (typeof action.centerDeg === "number") {
    parsed.centerDeg = action.centerDeg;
  }
  if (typeof action.widthDeg === "number") {
    parsed.widthDeg = action.widthDeg;
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
