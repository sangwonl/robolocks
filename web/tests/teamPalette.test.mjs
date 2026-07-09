import assert from "node:assert/strict";
import test from "node:test";

import { teamColor } from "../src/ui/teamPalette.ts";

test("team 1 maps to the current blue palette", () => {
  const colors = teamColor(1);

  assert.equal(colors.body, 0x527ead);
  assert.equal(colors.arc, 0x77b7ff);
  assert.equal(colors.accent, 0x5f9ee6);
  assert.equal(colors.css, "#5f9ee6");
});

test("team 2 maps to the current red palette", () => {
  const colors = teamColor(2);

  assert.equal(colors.body, 0xb9564f);
  assert.equal(colors.arc, 0xff7a70);
  assert.equal(colors.accent, 0xdf645b);
  assert.equal(colors.css, "#df645b");
});

test("unknown teams fall back to the neutral gray palette", () => {
  const zero = teamColor(0);
  const three = teamColor(3);

  assert.equal(zero.body, 0x788470);
  assert.equal(zero.arc, 0x788470);
  assert.deepEqual(zero, three);
});
