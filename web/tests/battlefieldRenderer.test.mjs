import assert from "node:assert/strict";
import test from "node:test";

import { createBattlefieldRenderer } from "../src/ui/battlefieldRenderer.ts";

class FakeClassList {
  values = new Set();

  add(value) {
    this.values.add(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeCanvasContext {
  calls = [];

  setTransform(...args) { this.calls.push(["setTransform", args]); }
  clearRect(...args) { this.calls.push(["clearRect", args]); }
  save(...args) { this.calls.push(["save", args]); }
  restore(...args) { this.calls.push(["restore", args]); }
  fillRect(...args) { this.calls.push(["fillRect", args]); }
  beginPath(...args) { this.calls.push(["beginPath", args]); }
  moveTo(...args) { this.calls.push(["moveTo", args]); }
  lineTo(...args) { this.calls.push(["lineTo", args]); }
  closePath(...args) { this.calls.push(["closePath", args]); }
  stroke(...args) { this.calls.push(["stroke", args]); }
  fill(...args) { this.calls.push(["fill", args]); }
  arc(...args) { this.calls.push(["arc", args]); }
  translate(...args) { this.calls.push(["translate", args]); }
  rotate(...args) { this.calls.push(["rotate", args]); }
  rect(...args) { this.calls.push(["rect", args]); }
  setLineDash(...args) { this.calls.push(["setLineDash", args]); }
  strokeText(...args) { this.calls.push(["strokeText", args]); }
  fillText(...args) { this.calls.push(["fillText", args]); }
}

class FakeCanvas {
  classList = new FakeClassList();
  width = 0;
  height = 0;

  constructor(context) {
    this.context = context;
  }

  getContext(type) {
    return type === "2d" ? this.context : null;
  }
}

class FakeDocument {
  constructor(context) {
    this.context = context;
  }

  createElement(tagName) {
    assert.equal(tagName, "canvas");
    return new FakeCanvas(this.context);
  }
}

class FakeContainer {
  children = [];
  clientWidth = 900;
  clientHeight = 600;

  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

function frame(tick, blueX, redX) {
  return {
    tick,
    units: [
      {
        unitId: 1,
        name: "Blue",
        position: { x: blueX, y: 12 },
        hullHeadingDeg: 0,
        turretHeadingDeg: 0,
        armorIntegrity: 100,
        weaponCooldownTicks: 0,
        bodyShape: { type: "box", radiusM: 1.2, lengthM: 5.6, widthM: 2.8 },
      },
      {
        unitId: 2,
        name: "Red",
        position: { x: redX, y: 12 },
        hullHeadingDeg: 180,
        turretHeadingDeg: 180,
        armorIntegrity: 100,
        weaponCooldownTicks: 0,
        bodyShape: { type: "box", radiusM: 1.2, lengthM: 5.6, widthM: 2.8 },
      },
    ],
    events: [],
    actions: [],
  };
}

test("battlefield renderer owns one canvas surface", () => {
  const context = new FakeCanvasContext();
  const document = new FakeDocument(context);
  const container = new FakeContainer(document);
  const renderer = createBattlefieldRenderer(container);

  renderer.drawFrame(frame(1, 6.2, 33.8));
  renderer.drawFrame(frame(2, 6.4, 33.6));

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].classList.contains("battlefield-canvas"), true);
  assert.equal(container.children[0].width, 900);
  assert.equal(container.children[0].height, 600);
});

test("battlefield renderer draws box hulls using meter scale", () => {
  const context = new FakeCanvasContext();
  const document = new FakeDocument(context);
  const container = new FakeContainer(document);
  const renderer = createBattlefieldRenderer(container);

  renderer.drawFrame(frame(1, 6, 34));

  assert(context.calls.some(([name, args]) => name === "translate" && args[0] === 112 && args[1] === 184));
  assert(context.calls.some(([name, args]) => name === "rect" && nearlyEqual(args[0], -33.6) && nearlyEqual(args[1], -16.8) && nearlyEqual(args[2], 67.2) && nearlyEqual(args[3], 33.6)));
  assert(context.calls.some(([name, args]) => name === "rotate" && args[0] === Math.PI));
});

test("battlefield renderer draws static obstacle radius on canvas", () => {
  const context = new FakeCanvasContext();
  const document = new FakeDocument(context);
  const container = new FakeContainer(document);
  const renderer = createBattlefieldRenderer(container);

  renderer.drawStaticObstacles([
    {
      id: "north_cover",
      position: { x: 20, y: 6 },
      radiusM: 1.5,
      blocksMovement: true,
      blocksLineOfSight: true,
    },
  ]);

  assert.equal(container.children.length, 1);
  assert(context.calls.some(([name, args]) => name === "arc" && args[0] === 280 && args[1] === 112 && args[2] === 18));
});

test("battlefield renderer draws box footprint using body shape instead of fallback radius", () => {
  const context = new FakeCanvasContext();
  const document = new FakeDocument(context);
  const container = new FakeContainer(document);
  const renderer = createBattlefieldRenderer(container);

  renderer.drawFrame(frame(1, 6, 34));

  assert(context.calls.some(([name, args]) => name === "rect" && nearlyEqual(args[0], -33.6) && nearlyEqual(args[1], -16.8) && nearlyEqual(args[2], 67.2) && nearlyEqual(args[3], 33.6)));
  assert(!context.calls.some(([name, args]) => name === "arc" && args[0] === 0 && args[1] === 0 && args[2] === 14.399999999999999));
});

test("battlefield renderer draws weapon tracers for fired shots", () => {
  const context = new FakeCanvasContext();
  const document = new FakeDocument(context);
  const container = new FakeContainer(document);
  const renderer = createBattlefieldRenderer(container);
  const shotFrame = frame(1, 6, 34);
  shotFrame.actions = [
    { unitId: 1, type: "aimAt", channel: "turret", target: { x: 34, y: 12 } },
    { unitId: 1, type: "fireIfSolution", channel: "weapon", minHitChance: 0.58 },
  ];
  shotFrame.events = [
    { tick: 0, unitId: 1, code: "weapon_fired", message: "Weapon fired with a valid direct-fire solution." },
  ];

  renderer.drawFrame(shotFrame);

  assert(context.calls.some(([name, args]) => name === "moveTo" && args[0] === 112 && args[1] === 184));
  assert(context.calls.some(([name, args]) => name === "lineTo" && args[0] === 448 && args[1] === 184));
});

function nearlyEqual(actual, expected) {
  return Math.abs(actual - expected) < 0.000001;
}
