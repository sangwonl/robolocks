import type { BattleAction, BattleEvent, UnitFrame } from "../types/protocol";

export type FormattedItem = { label: string; value: string };

export function shapeLabel(shape: UnitFrame["bodyShape"]): string {
  if (shape.type === "box") {
    return `box ${shape.lengthMeters.toFixed(1)}x${shape.widthMeters.toFixed(1)}m`;
  }
  return `circle r=${shape.radiusMeters.toFixed(1)}m`;
}

export function moduleItems(unit: UnitFrame): FormattedItem[] {
  const muzzle = unit.modules.weapon.muzzleOffsetMeters;
  const muzzleLabel = `${muzzle.x.toFixed(1)},${muzzle.y.toFixed(1)},${muzzle.z.toFixed(1)}m`;
  return [
    { label: "move", value: `${unit.modules.mobility.id} ${unit.modules.mobility.maxSpeedMetersPerSecond.toFixed(1)}m/s ${unit.modules.mobility.maxHullTurnDegreesPerSecond.toFixed(0)}deg/s` },
    { label: "turret", value: `${unit.modules.turret.id} ${unit.modules.turret.maxTurnDegreesPerSecond.toFixed(0)}deg/s` },
    { label: "weapon", value: `${unit.modules.weapon.id} ${unit.modules.weapon.fireMode} dmg=${unit.modules.weapon.damage.toFixed(0)} pen=${unit.modules.weapon.penetrationMillimeters.toFixed(0)}mm v=${unit.modules.weapon.muzzleVelocityMetersPerSecond.toFixed(0)}m/s muzzle=${muzzleLabel} angle=${unit.modules.weapon.launchAngleDegrees.toFixed(0)}deg blast=${unit.modules.weapon.blastRadiusMeters.toFixed(1)}m reload=${unit.modules.weapon.reloadTicks}` },
    { label: "armor", value: `${unit.modules.armor.id} hp=${unit.modules.armor.integrity.toFixed(0)} ${unit.modules.armor.frontMillimeters.toFixed(0)}/${unit.modules.armor.sideMillimeters.toFixed(0)}/${unit.modules.armor.rearMillimeters.toFixed(0)}mm` },
    { label: "body", value: `${unit.modules.body.id} mass=${unit.modules.body.massKilograms.toFixed(0)}kg` },
    { label: "sensor", value: `${unit.modules.sensor.id} ${unit.modules.sensor.rangeMeters.toFixed(0)}m/${unit.modules.sensor.fovDegrees.toFixed(0)}deg` },
  ];
}

export function intentItems(unit: UnitFrame): FormattedItem[] {
  return [
    { label: "move", value: unit.intents.mobility.active ? `move (${unit.intents.mobility.target.x.toFixed(1)}, ${unit.intents.mobility.target.y.toFixed(1)}) rem=${unit.intents.mobility.remainingMeters.toFixed(1)}m age=${unit.intents.mobility.ageTicks}` : "idle" },
    { label: "turret", value: unit.intents.turret.active ? `aim (${unit.intents.turret.target.x.toFixed(1)}, ${unit.intents.turret.target.y.toFixed(1)}) err=${unit.intents.turret.errorDegrees.toFixed(1)}deg age=${unit.intents.turret.ageTicks}` : "idle" },
    { label: "hull", value: unit.intents.hull.active ? `face (${unit.intents.hull.target.x.toFixed(1)}, ${unit.intents.hull.target.y.toFixed(1)}) err=${unit.intents.hull.errorDegrees.toFixed(1)}deg age=${unit.intents.hull.ageTicks}` : "idle" },
    { label: "weapon", value: unit.intents.weapon.active ? `fire p>=${unit.intents.weapon.minHitChance.toFixed(2)} age=${unit.intents.weapon.ageTicks}` : "idle" },
  ];
}

export function actionItems(actions: BattleAction[]): FormattedItem[] {
  if (actions.length === 0) {
    return [{ label: "-", value: "no actions" }];
  }
  return actions.map((action) => ({
    label: action.channel,
    value: `${action.type}${actionTarget(action)}`,
  }));
}

export function eventItems(events: BattleEvent[]): FormattedItem[] {
  if (events.length === 0) {
    return [{ label: "-", value: "no events" }];
  }
  return events.map((event) => ({
    label: String(event.tick),
    value: `${event.code}${eventPayloadSummary(event)}`,
  }));
}

export function eventPayloadSummary(event: BattleEvent): string {
  const payload = event.payload;
  if (!payload || payload.damage <= 0) {
    return payload?.armorFacing ? ` ${payload.armorFacing}` : "";
  }
  const parts = [`-${payload.damage.toFixed(1)}`, `hp=${payload.remainingArmor.toFixed(1)}`];
  if (payload.damageType) {
    parts.push(payload.damageType);
  }
  if (payload.armorFacing) {
    parts.push(payload.armorFacing);
  }
  if (payload.blastRadiusMeters > 0) {
    parts.push(`d=${payload.impactDistanceMeters.toFixed(1)}/${payload.blastRadiusMeters.toFixed(1)}m`);
  }
  return ` ${parts.join(" ")}`;
}

export function actionTarget(action: BattleAction): string {
  if (action.position) {
    return ` (${action.position.x.toFixed(1)}, ${action.position.y.toFixed(1)})`;
  }
  if (action.target) {
    return ` (${action.target.x.toFixed(1)}, ${action.target.y.toFixed(1)})`;
  }
  if (typeof action.minHitChance === "number") {
    return ` p>=${action.minHitChance.toFixed(2)}`;
  }
  if (typeof action.directionDegrees === "number" && typeof action.widthDegrees === "number") {
    return ` ${action.directionDegrees.toFixed(0)}deg/${action.widthDegrees.toFixed(0)}deg`;
  }
  return "";
}
