import { useState } from "react";

const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 640;

export type UsePanelResizeResult = {
  leftPanelWidth: number;
  rightPanelWidth: number;
  beginPanelResize: (panel: "left" | "right", pointerStartX: number) => void;
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

  return { leftPanelWidth, rightPanelWidth, beginPanelResize };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
