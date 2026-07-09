import assert from "node:assert/strict";
import test from "node:test";

import {
  computeSteppedPanelWidth,
  PANEL_WIDTH_MAX,
  PANEL_WIDTH_MIN,
} from "../src/ui/hooks/usePanelResize.ts";

test("computeSteppedPanelWidth grows the left panel on a positive delta", () => {
  assert.equal(computeSteppedPanelWidth("left", 300, 16), 316);
});

test("computeSteppedPanelWidth shrinks the left panel on a negative delta", () => {
  assert.equal(computeSteppedPanelWidth("left", 300, -16), 284);
});

test("computeSteppedPanelWidth shrinks the right panel on a positive delta (ArrowRight)", () => {
  // Mirrors mouse-drag: moving the separator right grows the scene and
  // shrinks the right panel, matching ArrowRight per the WAI-ARIA window
  // splitter convention.
  assert.equal(computeSteppedPanelWidth("right", 300, 16), 284);
});

test("computeSteppedPanelWidth grows the right panel on a negative delta (ArrowLeft)", () => {
  assert.equal(computeSteppedPanelWidth("right", 300, -16), 316);
});

test("computeSteppedPanelWidth clamps to the minimum width", () => {
  assert.equal(computeSteppedPanelWidth("left", PANEL_WIDTH_MIN, -16), PANEL_WIDTH_MIN);
  assert.equal(computeSteppedPanelWidth("right", PANEL_WIDTH_MIN, 16), PANEL_WIDTH_MIN);
});

test("computeSteppedPanelWidth clamps to the maximum width", () => {
  assert.equal(computeSteppedPanelWidth("left", PANEL_WIDTH_MAX, 16), PANEL_WIDTH_MAX);
  assert.equal(computeSteppedPanelWidth("right", PANEL_WIDTH_MAX, -16), PANEL_WIDTH_MAX);
});
