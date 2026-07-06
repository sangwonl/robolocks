import type { BattleFrame, UnitFrame } from "../types/protocol";

type InternalUnit = UnitFrame & {
  target: { x: number; y: number };
  speed: number;
};

export type KernelMatch = {
  step(): BattleFrame;
};

export function createPresetDuel(): KernelMatch {
  let tick = 0;
  const units: InternalUnit[] = [
    { unitId: 1, name: "Blue", position: { x: 6, y: 12 }, armorIntegrity: 100, target: { x: 20, y: 12 }, speed: 0.2 },
    { unitId: 2, name: "Red", position: { x: 34, y: 12 }, armorIntegrity: 100, target: { x: 20, y: 12 }, speed: 0.2 },
  ];

  return {
    step(): BattleFrame {
      tick += 1;
      for (const unit of units) {
        unit.position = advanceToward(unit.position, unit.target, unit.speed);
      }
      return {
        tick,
        units: units.map((unit) => ({
          unitId: unit.unitId,
          name: unit.name,
          position: { ...unit.position },
          armorIntegrity: unit.armorIntegrity,
        })),
        events: [],
      };
    },
  };
}

function advanceToward(from: { x: number; y: number }, to: { x: number; y: number }, maxDistance: number): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= maxDistance || len <= 0) {
    return { ...to };
  }
  return {
    x: from.x + (dx / len) * maxDistance,
    y: from.y + (dy / len) * maxDistance,
  };
}
