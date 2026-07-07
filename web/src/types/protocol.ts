export type Vec2 = {
  x: number;
  y: number;
};

export type BodyShapeFrame =
  | {
      type: "box";
      radiusM: number;
      lengthM: number;
      widthM: number;
    }
  | {
      type: "circle";
      radiusM: number;
    };

export type UnitFrame = {
  unitId: number;
  name: string;
  position: Vec2;
  hullHeadingDeg: number;
  turretHeadingDeg: number;
  armorIntegrity: number;
  weaponCooldownTicks: number;
  bodyShape: BodyShapeFrame;
  modules: UnitModulesFrame;
  intents: UnitIntentsFrame;
};

export type UnitModulesFrame = {
  mobility: {
    id: string;
    maxSpeedMps: number;
    maxHullTurnDegps: number;
  };
  turret: {
    id: string;
    maxTurnDegps: number;
  };
  weapon: {
    id: string;
    fireMode: string;
    damage: number;
    penetrationMm: number;
    rangeM: number;
    muzzleVelocityMps: number;
    launchAngleDeg: number;
    gravityMps2: number;
    blastRadiusM: number;
    projectileRadiusM: number;
    aimToleranceDeg: number;
    reloadTicks: number;
  };
  armor: {
    id: string;
    integrity: number;
    frontMm: number;
    sideMm: number;
    rearMm: number;
  };
  body: {
    id: string;
    massKg: number;
  };
  sensor: {
    id: string;
    rangeM: number;
    fovDeg: number;
    refreshTicks: number;
  };
};

export type UnitIntentsFrame = {
  mobility: {
    active: boolean;
    target: Vec2;
    remainingM: number;
    ageTicks: number;
  };
  turret: {
    active: boolean;
    target: Vec2;
    errorDeg: number;
    ageTicks: number;
  };
  hull: {
    active: boolean;
    target: Vec2;
    errorDeg: number;
    ageTicks: number;
  };
  weapon: {
    active: boolean;
    minHitChance: number;
    ageTicks: number;
  };
};

export type StaticObstacleFrame = {
  id: string;
  position: Vec2;
  radiusM: number;
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
};

export type BattleEvent = {
  tick: number;
  unitId: number;
  code: string;
  message: string;
  payload: BattleEventPayload;
};

export type BattleEventPayload = {
  projectileId: number;
  damageType: string;
  armorFacing: string;
  damage: number;
  remainingArmor: number;
  penetrationMm: number;
  armorMm: number;
  impactDistanceM: number;
  blastRadiusM: number;
};

export type BattleAction = {
  unitId: number;
  type: string;
  channel: string;
  position?: Vec2;
  target?: Vec2;
  minHitChance?: number;
  centerDeg?: number;
  widthDeg?: number;
};

export type ProjectileFrame = {
  projectileId: number;
  ownerUnitId: number;
  previousPosition: Vec2;
  position: Vec2;
  radiusM: number;
  heightM: number;
};

export type BattleFrame = {
  tick: number;
  units: UnitFrame[];
  projectiles: ProjectileFrame[];
  events: BattleEvent[];
  actions: BattleAction[];
};

export type SimWorkerRequest =
  | { type: "liveReset" }
  | { type: "liveStep" }
  | { type: "livePlay"; tickLimit: number }
  | { type: "livePause" };

export type SimWorkerResponse =
  | { type: "battleStatic"; obstacles: StaticObstacleFrame[] }
  | { type: "battleFrame"; frame: BattleFrame }
  | { type: "battleComplete"; finalFrame: BattleFrame }
  | { type: "battlePaused" };
