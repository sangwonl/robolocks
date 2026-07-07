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
  intents: UnitIntentsFrame;
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

export type BattleFrame = {
  tick: number;
  units: UnitFrame[];
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
