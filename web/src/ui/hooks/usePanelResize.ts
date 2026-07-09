import { useState } from "react";

const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 640;

// Exposed so callers (keyboard handlers rendering aria-valuemin/max) can
// reflect the same bounds the pointer-drag path already clamps to below.
export const PANEL_WIDTH_MIN = MIN_PANEL_WIDTH;
export const PANEL_WIDTH_MAX = MAX_PANEL_WIDTH;

// A single keyboard press moves the panel edge by this many pixels - large
// enough to be noticeable, small enough for a few presses to fine-tune.
export const PANEL_WIDTH_KEYBOARD_STEP = 16;

export type UsePanelResizeResult = {
  leftPanelWidth: number;
  rightPanelWidth: number;
  beginPanelResize: (panel: "left" | "right", pointerStartX: number) => void;
  stepPanelWidth: (panel: "left" | "right", deltaPx: number) => void;
};

export function usePanelResize(): UsePanelResizeResult {
  const [leftPanelWidth, setLeftPanelWidth] = useState(MAX_PANEL_WIDTH);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);

  function beginPanelResize(panel: "left" | "right", pointerStartX: number): void {
    const startWidth = panel === "left" ? leftPanelWidth : rightPanelWidth;
    const applyWidth = panel === "left" ? setLeftPanelWidth : setRightPanelWidth;

    function handlePointerMove(event: PointerEvent): void {
      const delta = event.clientX - pointerStartX;
      const nextWidth = panel === "left" ? startWidth + delta : startWidth - delta;
      applyWidth(clamp(nextWidth, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH));
    }

    function handlePointerUp(): void {
      document.body.classList.remove("is-resizing-panel");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    document.body.classList.add("is-resizing-panel");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  // Keyboard equivalent of the pointer-drag path above: same clamp, applied
  // as a one-shot delta against the panel's current width instead of a
  // continuous pointer position.
  function stepPanelWidth(panel: "left" | "right", deltaPx: number): void {
    const applyWidth = panel === "left" ? setLeftPanelWidth : setRightPanelWidth;
    applyWidth((current) => clamp(current + deltaPx, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH));
  }

  return { leftPanelWidth, rightPanelWidth, beginPanelResize, stepPanelWidth };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
