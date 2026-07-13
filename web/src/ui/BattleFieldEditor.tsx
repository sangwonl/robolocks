import { useEffect, useRef, useState } from "react";

import type { CustomBattleLayout, LayoutAction } from "../hangar/hangar.ts";
import { cn } from "../lib/utils.ts";
import { teamColor } from "./teamPalette.ts";

export type BattleFieldEditorProps = {
  layout: CustomBattleLayout;
  dispatch: (action: LayoutAction) => void;
  disabled?: boolean;
};

type ViewBox = { x: number; y: number; w: number; h: number };

type Drag =
  | { kind: "obstacle"; id: string }
  | { kind: "obstacle-resize"; id: string }
  | { kind: "flag" }
  | { kind: "spawn"; which: "blue" | "target" }
  | { kind: "field-resize" }
  | { kind: "field-move"; startClientX: number; startClientY: number; startWorldX: number; startWorldY: number; startCx: number; startCy: number; moved: boolean }
  | { kind: "pan"; startClientX: number; startClientY: number; startVB: ViewBox; scale: number };

const MIN_VIEW_W = 2;
const MAX_VIEW_W = 6000;

// svg-user-space point under a client (screen) coordinate.
function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    return { x: 0, y: 0 };
  }
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const local = point.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

// A 2D top-down field editor. Drawn in world coordinates (metres) with y flipped
// so +y points up like a map; the 3D Battle Scene tab supplies heights. Wheel
// zooms (around the cursor), dragging empty space pans, "Fit" reframes.
export function BattleFieldEditor({ layout, dispatch, disabled }: BattleFieldEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userView, setUserView] = useState<ViewBox | null>(null); // wheel/pan override; null = auto-fit
  const [dragFrozen, setDragFrozen] = useState<ViewBox | null>(null); // stable mapping during element drags

  const { cx, cy, rx, ry, shape } = layout.field;
  const margin = Math.max(rx, ry) * 0.12 + 4;
  const fitVB: ViewBox = { x: cx - rx - margin, y: -(cy + ry + margin), w: 2 * (rx + margin), h: 2 * (ry + margin) };
  const vb = dragFrozen ?? userView ?? fitVB;
  const viewBox = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
  const handleR = vb.w * 0.014 + 0.6; // grips sized to the current view so they stay grabbable

  const vbRef = useRef(vb);
  vbRef.current = vb;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  // Wheel zoom around the cursor. Attached natively (non-passive) so we can
  // preventDefault and keep the page/panel from scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (disabledRef.current) {
        return;
      }
      event.preventDefault();
      const cur = vbRef.current;
      const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
      const w = Math.max(MIN_VIEW_W, Math.min(MAX_VIEW_W, cur.w * factor));
      const scale = w / cur.w;
      const h = cur.h * scale;
      const p = svgPoint(svg, event.clientX, event.clientY);
      setUserView({ x: p.x - (p.x - cur.x) * scale, y: p.y - (p.y - cur.y) * scale, w, h });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const deleteObstacle = (id: string) => {
    dispatch({ type: "removeObstacle", id });
    setSelectedId((current) => (current === id ? null : current));
  };

  // Delete / Backspace removes the selected obstacle (ignored while typing in a
  // field so it doesn't fight text editing elsewhere).
  useEffect(() => {
    if (disabled || !selectedId) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      deleteObstacle(selectedId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, disabled]);

  const screenToWorld = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }
    const p = svgPoint(svg, clientX, clientY);
    return { x: p.x, y: -p.y };
  };

  const beginDrag = (drag: Exclude<Drag, { kind: "pan" | "field-move" }>) => (event: React.PointerEvent) => {
    if (disabled || event.button !== 0) {
      return; // left button only; right button is reserved for delete
    }
    event.stopPropagation();
    dragRef.current = drag;
    setDragFrozen(vb); // freeze the mapping so resizing doesn't feed back into the view
    if (drag.kind === "obstacle" || drag.kind === "obstacle-resize") {
      setSelectedId(drag.id);
    }
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  // Pressing the field body: dragging moves the whole field, a click adds an obstacle.
  const beginFieldBody = (event: React.PointerEvent) => {
    if (disabled || event.button !== 0) {
      return; // left button only; middle button pans, right button deletes
    }
    const world = screenToWorld(event.clientX, event.clientY);
    dragRef.current = {
      kind: "field-move",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWorldX: world.x,
      startWorldY: world.y,
      startCx: cx,
      startCy: cy,
      moved: false,
    };
    setDragFrozen(vb); // freeze the mapping so moving the field doesn't feed back into the view
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  // Pan the view: middle button anywhere, or left button on empty space outside the field.
  const onSvgPointerDown = (event: React.PointerEvent) => {
    if (disabled || dragRef.current) {
      return;
    }
    const onEmptySpace = event.target === svgRef.current;
    if (event.button !== 1 && !(event.button === 0 && onEmptySpace)) {
      return;
    }
    const ctm = svgRef.current?.getScreenCTM();
    dragRef.current = {
      kind: "pan",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startVB: vb,
      scale: ctm ? ctm.a : 1, // uniform screen-per-svg scale (preserveAspectRatio meet)
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    if (drag.kind === "pan") {
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      setUserView({ x: drag.startVB.x - dx / drag.scale, y: drag.startVB.y - dy / drag.scale, w: drag.startVB.w, h: drag.startVB.h });
      return;
    }
    if (drag.kind === "field-move") {
      if (!drag.moved && Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) < 4) {
        return; // still a click (add), not a move
      }
      drag.moved = true;
      const world = screenToWorld(event.clientX, event.clientY);
      // Absolute (anchored to drag start) so a mid-drag re-fork can't drift.
      dispatch({ type: "moveField", cx: drag.startCx + (world.x - drag.startWorldX), cy: drag.startCy + (world.y - drag.startWorldY) });
      return;
    }
    const world = screenToWorld(event.clientX, event.clientY);
    switch (drag.kind) {
      case "obstacle":
        dispatch({ type: "moveObstacle", id: drag.id, x: world.x, y: world.y });
        break;
      case "obstacle-resize": {
        const obstacle = layout.obstacles.find((o) => o.id === drag.id);
        if (obstacle) {
          dispatch({ type: "resizeObstacle", id: drag.id, radius: Math.hypot(world.x - obstacle.x, world.y - obstacle.y) });
        }
        break;
      }
      case "flag":
        dispatch({ type: "moveFlag", x: world.x, y: world.y });
        break;
      case "spawn":
        dispatch({ type: "moveSpawn", which: drag.which, x: world.x, y: world.y });
        break;
      case "field-resize":
        if (shape === "circle") {
          dispatch({ type: "resizeField", rx: Math.hypot(world.x - cx, world.y - cy), ry: 0 });
        } else {
          dispatch({ type: "resizeField", rx: Math.abs(world.x - cx), ry: Math.abs(world.y - cy) });
        }
        break;
    }
  };

  const endDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag?.kind === "field-move" && !drag.moved) {
      // A click on the field (no drag) adds an obstacle there.
      dispatch({ type: "addObstacle", x: drag.startWorldX, y: drag.startWorldY });
    }
    dragRef.current = null;
    setDragFrozen(null);
    svgRef.current?.releasePointerCapture?.(event.pointerId);
  };

  const blue = teamColor(1);
  const red = teamColor(2);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-dim)]">
        <span className="u-label">Shape</span>
        {(["rect", "circle"] as const).map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            className={cn(
              "rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)] disabled:opacity-55",
              shape === option && "border-[var(--brand)] text-[var(--brand)]",
            )}
            onClick={() => dispatch({ type: "setShape", shape: option })}
          >
            {option === "rect" ? "Rect" : "Circle"}
          </button>
        ))}
        <button
          type="button"
          className="rounded-md border border-[var(--line-control)] bg-[var(--surface-well)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)]"
          onClick={() => setUserView(null)}
          title="Reframe to fit the field"
        >
          Fit
        </button>
        <span className="ml-auto u-label text-[9px] text-[var(--text-muted)]">wheel=zoom · drag field=move · click=add · outside/mid-drag=pan</span>
        <button
          type="button"
          disabled={disabled || !selectedId}
          className="rounded-md border border-[var(--status-contested-border)] bg-[var(--surface-well)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)] disabled:opacity-40"
          onClick={() => {
            if (selectedId) {
              dispatch({ type: "removeObstacle", id: selectedId });
              setSelectedId(null);
            }
          }}
        >
          Delete
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="min-h-0 w-full flex-1 touch-none rounded-md border border-[var(--line)] bg-[var(--surface-inset)]"
        onPointerDown={onSvgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {/* Field body: drag to move the whole field, click to add an obstacle. */}
        {shape === "circle" ? (
          <circle cx={cx} cy={-cy} r={rx} fill="#252d2455" stroke="#8fae74" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ cursor: disabled ? "default" : "move" }} onPointerDown={beginFieldBody} />
        ) : (
          <rect x={cx - rx} y={-(cy + ry)} width={2 * rx} height={2 * ry} fill="#252d2455" stroke="#8fae74" strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ cursor: disabled ? "default" : "move" }} onPointerDown={beginFieldBody} />
        )}

        {/* Obstacles */}
        {layout.obstacles.map((obstacle) => (
          <g
            key={obstacle.id}
            onContextMenu={(event) => {
              if (!disabled) {
                event.preventDefault();
                deleteObstacle(obstacle.id);
              }
            }}
          >
            <circle
              cx={obstacle.x}
              cy={-obstacle.y}
              r={obstacle.radius}
              fill={obstacle.id === selectedId ? "#7c8b6c" : "#5a6650"}
              stroke={obstacle.id === selectedId ? "#cfe0b4" : "#8fae74"}
              strokeWidth={obstacle.id === selectedId ? 2 : 1}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: disabled ? "default" : "grab" }}
              onPointerDown={beginDrag({ kind: "obstacle", id: obstacle.id })}
            />
            {obstacle.id === selectedId && (
              <circle
                cx={obstacle.x + obstacle.radius}
                cy={-obstacle.y}
                r={handleR * 0.8}
                fill="#cfe0b4"
                stroke="#1b211b"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: disabled ? "default" : "ew-resize" }}
                onPointerDown={beginDrag({ kind: "obstacle-resize", id: obstacle.id })}
              />
            )}
          </g>
        ))}

        {/* Flag (capture zone marker) */}
        <g style={{ cursor: disabled ? "default" : "grab" }} onPointerDown={beginDrag({ kind: "flag" })}>
          <circle cx={layout.flag.x} cy={-layout.flag.y} r={handleR * 1.1} fill="#d4e16455" stroke="#d4e164" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <circle cx={layout.flag.x} cy={-layout.flag.y} r={handleR * 0.35} fill="#d4e164" />
        </g>

        {/* Spawns */}
        {([
          { which: "blue" as const, spawn: layout.blueSpawn, color: blue.body },
          { which: "target" as const, spawn: layout.targetSpawn, color: red.body },
        ]).map(({ which, spawn, color }) => (
          <g key={which} style={{ cursor: disabled ? "default" : "grab" }} onPointerDown={beginDrag({ kind: "spawn", which })}>
            <rect x={spawn.x - handleR} y={-spawn.y - handleR} width={handleR * 2} height={handleR * 2} rx={handleR * 0.3} fill={`${color}aa`} stroke="#0d0f0d" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </g>
        ))}

        {/* Field resize grip: rect = +x/+y corner, circle = +x radius. */}
        <circle
          cx={shape === "circle" ? cx + rx : cx + rx}
          cy={shape === "circle" ? -cy : -(cy + ry)}
          r={handleR}
          fill="#8fae74"
          stroke="#1b211b"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: disabled ? "default" : shape === "circle" ? "ew-resize" : "nwse-resize" }}
          onPointerDown={beginDrag({ kind: "field-resize" })}
        />
      </svg>
    </div>
  );
}
