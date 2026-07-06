export type Vec2 = {
  x: number;
  y: number;
};

export type UnitFrame = {
  unitId: number;
  name: string;
  position: Vec2;
  armorIntegrity: number;
};

export type BattleEvent = {
  tick: number;
  unitId: number;
  code: string;
  message: string;
};

export type BattleFrame = {
  tick: number;
  units: UnitFrame[];
  events: BattleEvent[];
};

export type RunPresetDuelRequest = {
  type: "runPresetDuel";
  ticks: number;
};

export type SimWorkerRequest = RunPresetDuelRequest;

export type SimWorkerResponse =
  | { type: "battleFrame"; frame: BattleFrame }
  | { type: "battleComplete"; finalFrame: BattleFrame };
