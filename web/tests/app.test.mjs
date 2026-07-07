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

test("workbench autoloads and autoplays the bundled preset replay", async () => {
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
    defaultReplayUrl: "/replays/preset_duel_python_v0.replay.json",
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
              },
            ],
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
            events: [],
            actions: [],
          },
        ],
      });
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(fetched, ["/replays/preset_duel_python_v0.replay.json"]);
  assert.equal(status.textContent, "Replay 1/2 - tick 0");
  assert.equal(play.textContent, "Pause");
  assert.equal(battlefield.children.length, 1);
  assert.match(inspector.innerHTML, /Blue/);

  play.listeners.get("click")();
});
