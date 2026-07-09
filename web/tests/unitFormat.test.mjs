import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  actionItems,
  actionTarget,
  eventItems,
  eventPayloadSummary,
  intentItems,
  moduleItems,
  shapeLabel,
} from "../src/ui/unitFormat.ts";

const goldenUrl = new URL("../../fixtures/contracts/frame.golden.json", import.meta.url);
const golden = JSON.parse(readFileSync(goldenUrl, "utf8"));

const unit1 = golden.units[0];
const unit2 = golden.units[1];
const actionsForUnit1 = golden.actions.filter((action) => action.unitId === unit1.unitId);
const actionsForUnit2 = golden.actions.filter((action) => action.unitId === unit2.unitId);
const eventsForUnit1 = golden.events.filter((event) => event.unitId === unit1.unitId);
const eventsForUnit2 = golden.events.filter((event) => event.unitId === unit2.unitId);

test("shapeLabel formats a box shape from the golden fixture", () => {
  assert.equal(shapeLabel(unit1.bodyShape), "box 6.4x3.1m");
});

test("shapeLabel formats a circle shape from the golden fixture", () => {
  assert.equal(shapeLabel(unit2.bodyShape), "circle r=1.4m");
});

test("moduleItems formats every module summary line for a unit", () => {
  assert.deepEqual(moduleItems(unit1), [
    { label: "move", value: "tracked_chassis_mk2 7.5m/s 95deg/s" },
    { label: "turret", value: "heavy_turret_mk2 140deg/s" },
    {
      label: "weapon",
      value:
        "cannon_88mm_mk2 ballistic dmg=42 pen=132mm v=780m/s muzzle=3.6,0.2,1.6m angle=4deg blast=2.3m reload=72",
    },
    { label: "armor", value: "composite_armor_mk2 hp=89 120/70/45mm" },
    { label: "body", value: "heavy_hull_mk2 mass=42000kg" },
    { label: "sensor", value: "radar_optic_mk2 640m/220deg" },
  ]);
});

test("intentItems formats each active intent channel with target/error/age", () => {
  assert.deepEqual(intentItems(unit1), [
    { label: "move", value: "move (24.0, 14.0) rem=18.5m age=12" },
    { label: "turret", value: "aim (28.0, 16.5) err=6.5deg age=8" },
    { label: "hull", value: "face (22.0, 10.0) err=11.0deg age=5" },
    { label: "weapon", value: "fire p>=0.65 age=3" },
  ]);
});

test("intentItems reports idle for every channel when inactive", () => {
  assert.deepEqual(intentItems(unit2), [
    { label: "move", value: "idle" },
    { label: "turret", value: "idle" },
    { label: "hull", value: "idle" },
    { label: "weapon", value: "idle" },
  ]);
});

test("actionTarget prefers position, falling back to target/minHitChance/direction", () => {
  assert.equal(actionTarget({ position: { x: 24, y: 14 } }), " (24.0, 14.0)");
  assert.equal(actionTarget({ target: { x: 28, y: 16.5 } }), " (28.0, 16.5)");
  assert.equal(actionTarget({ minHitChance: 0.65 }), " p>=0.65");
  assert.equal(actionTarget({ directionDegrees: 90, widthDegrees: 120 }), " 90deg/120deg");
  assert.equal(actionTarget({}), "");
});

test("actionItems formats each action's channel and target from the golden fixture", () => {
  assert.deepEqual(actionItems(actionsForUnit1), [
    { label: "turret", value: "aimAt (28.0, 16.5)" },
    { label: "weapon", value: "fireIfSolution p>=0.65" },
    { label: "sensor", value: "scanArc 90deg/120deg" },
  ]);
  assert.deepEqual(actionItems(actionsForUnit2), [{ label: "mobility", value: "moveTo (24.0, 14.0)" }]);
});

test("actionItems reports a placeholder row when there are no actions", () => {
  assert.deepEqual(actionItems([]), [{ label: "-", value: "no actions" }]);
});

test("eventPayloadSummary formats damage, hp, type and blast distance", () => {
  assert.equal(eventPayloadSummary(eventsForUnit2[0]), " -42.0 hp=62.0 direct side d=15.5/2.3m");
});

test("eventPayloadSummary falls back to armor facing only when damage is zero", () => {
  assert.equal(
    eventPayloadSummary({
      payload: { damage: 0, armorFacing: "front", remainingArmor: 100, blastRadiusMeters: 0 },
    }),
    " front",
  );
});

test("eventPayloadSummary makes bounced armor hits explicit", () => {
  assert.equal(
    eventPayloadSummary({
      code: "armor_bounced",
      payload: { damage: 0, armorFacing: "front", remainingArmor: 100, blastRadiusMeters: 0 },
    }),
    " front no hp loss",
  );
});

test("eventItems formats each event's tick and payload summary from the golden fixture", () => {
  assert.deepEqual(eventItems(eventsForUnit2), [
    { label: "42", value: "armor_penetrated -42.0 hp=62.0 direct side d=15.5/2.3m" },
  ]);
});

test("eventItems reports a placeholder row when there are no events", () => {
  assert.deepEqual(eventItems(eventsForUnit1), [{ label: "-", value: "no events" }]);
  assert.deepEqual(eventItems([]), [{ label: "-", value: "no events" }]);
});
