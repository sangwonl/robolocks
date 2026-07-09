export type Vec2 = {
  x: number;
  y: number;
};

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type BodyShapeFrame =
  | {
      type: "box";
      radiusMeters: number;
      lengthMeters: number;
      widthMeters: number;
    }
  | {
      type: "circle";
      radiusMeters: number;
    };

export type UnitFrame = {
  unitId: number;
  teamId: number;
  name: string;
  position: Vec2;
  hullHeadingDegrees: number;
  turretHeadingDegrees: number;
  armorIntegrity: number;
  weaponCooldownTicks: number;
  bodyShape: BodyShapeFrame;
  modules: UnitModulesFrame;
  intents: UnitIntentsFrame;
};

export type UnitModulesFrame = {
  mobility: {
    id: string;
    maxSpeedMetersPerSecond: number;
    maxHullTurnDegreesPerSecond: number;
  };
  turret: {
    id: string;
    headingDegrees: number;
    maxTurnDegreesPerSecond: number;
  };
  weapon: {
    id: string;
    fireMode: string;
    damage: number;
    penetrationMillimeters: number;
    rangeMeters: number;
    muzzleVelocityMetersPerSecond: number;
    muzzleOffsetMeters: Vec3;
    launchAngleDegrees: number;
    gravityMetersPerSecondSquared: number;
    blastRadiusMeters: number;
    projectileRadiusMeters: number;
    aimToleranceDegrees: number;
    reloadTicks: number;
  };
  armor: {
    id: string;
    integrity: number;
    frontMillimeters: number;
    sideMillimeters: number;
    rearMillimeters: number;
  };
  body: {
    id: string;
    massKilograms: number;
    shape?: BodyShapeFrame;
  };
  sensor: {
    id: string;
    rangeMeters: number;
    fovDegrees: number;
    refreshTicks: number;
  };
};

export type UnitIntentsFrame = {
  mobility: {
    active: boolean;
    target: Vec2;
    remainingMeters: number;
    ageTicks: number;
  };
  turret: {
    active: boolean;
    target: Vec2;
    errorDegrees: number;
    ageTicks: number;
  };
  hull: {
    active: boolean;
    target: Vec2;
    errorDegrees: number;
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
  radiusMeters: number;
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
  sourceUnitId: number;
  targetUnitId: number;
  sourceTeamId: number;
  targetTeamId: number;
  damageType: string;
  armorFacing: string;
  damage: number;
  remainingArmor: number;
  penetrationMillimeters: number;
  armorMillimeters: number;
  impactDistanceMeters: number;
  blastRadiusMeters: number;
};

export type BattleScoreFrame = {
  unitId: number;
  teamId: number;
  kills: number;
  deaths: number;
  damageDealt: number;
};

export type BattleOutcomeFrame = {
  finished: boolean;
  reason: string;
  winnerUnitId: number;
  winnerTeamId: number;
};

export type CaptureZoneFrame = {
  id: string;
  position: Vec2;
  radiusMeters: number;
  holdTicksRequired: number;
  heldTicks: number;
  ownerUnitId: number;
  ownerTeamId: number;
  contested: boolean;
};

export type BattleRuleStateFrame = {
  scores: BattleScoreFrame[];
  captureZones: CaptureZoneFrame[];
  outcome: BattleOutcomeFrame;
};

export type BattleAction = {
  unitId: number;
  type: string;
  channel: string;
  position?: Vec2;
  target?: Vec2;
  minHitChance?: number;
  directionDegrees?: number;
  widthDegrees?: number;
  rangeMeters?: number;
};

export type ProjectileFrame = {
  projectileId: number;
  ownerUnitId: number;
  previousPosition: Vec2;
  position: Vec2;
  radiusMeters: number;
  previousHeightMeters: number;
  heightMeters: number;
};

export type FieldBoundsFrame = {
  min: Vec2;
  max: Vec2;
};

export type BattleFrame = {
  tick: number;
  field: FieldBoundsFrame;
  units: UnitFrame[];
  projectiles: ProjectileFrame[];
  events: BattleEvent[];
  actions: BattleAction[];
  ruleState: BattleRuleStateFrame;
};
