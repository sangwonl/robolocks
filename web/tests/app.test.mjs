import assert from "node:assert/strict";
import test from "node:test";

import { renderApp } from "../src/ui/app.ts";

class FakeClassList {
  values = new Set();
  add(value) {
    this.values.add(value);
  }
}

class FakeCanvasContext {
  setTransform() {}
  clearRect() {}
  save() {}
  restore() {}
  fillRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  closePath() {}
  stroke() {}
  fill() {}
  arc() {}
  translate() {}
  rotate() {}
  rect() {}
  setLineDash() {}
  strokeText() {}
  fillText() {}
}

class FakeCanvas {
  classList = new FakeClassList();
  width = 0;
  height = 0;
  getContext(type) {
    return type === "2d" ? new FakeCanvasContext() : null;
  }
}

class FakeDocument {
  createElement(tagName) {
    assert.equal(tagName, "canvas");
    return new FakeCanvas();
  }
}

class FakeElement {
  innerHTML = "";
  textContent = "";
  disabled = false;
  value = "";
  files = null;
  listeners = new Map();

  constructor(ownerDocument = null) {
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.clientWidth = 900;
    this.clientHeight = 600;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

class FakeRoot extends FakeElement {
  constructor(elements) {
    super();
    this.elements = elements;
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }
}

test("workbench starts empty until a replay is loaded", async () => {
  const status = new FakeElement();
  const inspector = new FakeElement();
  const battlefield = new FakeElement(new FakeDocument());
  const replay = new FakeElement();
  const prev = new FakeElement();
  const play = new FakeElement();
  const next = new FakeElement();
  const elements = new Map([
    ["#status", status],
    ["#inspector", inspector],
    ["#battlefield", battlefield],
    ["#replay", replay],
    ["#prev", prev],
    ["#play", play],
    ["#next", next],
  ]);
  const root = new FakeRoot(elements);
  const fetched = [];

  renderApp(root, {
    fetchText: async (url) => {
      fetched.push(url);
      return JSON.stringify({
        type: "robolocks.replay.v1",
        tickRate: 30,
        obstacles: [],
        frames: [
          {
            tick: 0,
            units: [
              {
                unitId: 1,
                position: { x: 4, y: 5 },
                hullHeadingDeg: 35,
                turretHeadingDeg: 35,
                armorIntegrity: 100,
                weaponCooldownTicks: 0,
                bodyShape: { type: "box", radiusM: 1.2, lengthM: 5.6, widthM: 2.8 },
                modules: {
                  mobility: { id: "tracked_chassis_mk1", maxSpeedMps: 6, maxHullTurnDegps: 120 },
                  turret: { id: "light_turret_mk1", maxTurnDegps: 180 },
                  weapon: { id: "cannon_75mm_mk1", fireMode: "direct", damage: 25, penetrationMm: 120, rangeM: 80, muzzleVelocityMps: 620, launchAngleDeg: 0, gravityMps2: 9.81, blastRadiusM: 0, projectileRadiusM: 0.08, aimToleranceDeg: 5, reloadTicks: 30 },
                  armor: { id: "rolled_armor_mk1", integrity: 100, frontMm: 100, sideMm: 70, rearMm: 45 },
                  body: { id: "medium_hull_mk1", massKg: 30000 },
                  sensor: { id: "visual_optic_mk1", rangeM: 60, fovDeg: 120, refreshTicks: 1 },
                },
              },
            ],
            projectiles: [],
            events: [],
            actions: [],
          },
          {
            tick: 1,
            units: [
              {
                unitId: 1,
                position: { x: 4.1, y: 5.1 },
                hullHeadingDeg: 39,
                turretHeadingDeg: 35,
                armorIntegrity: 100,
                weaponCooldownTicks: 0,
                bodyShape: { type: "box", radiusM: 1.2, lengthM: 5.6, widthM: 2.8 },
              },
            ],
            projectiles: [],
            events: [],
            actions: [],
          },
        ],
      });
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(fetched, []);
  assert.equal(status.textContent, "Ready");
  assert.equal(play.disabled, true);
  assert.equal(battlefield.children.length, 1);
  assert.equal(inspector.innerHTML, "");
});
