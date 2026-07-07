import type { BattleFrame, BodyShapeFrame, StaticObstacleFrame, UnitFrame, Vec2 } from "../types/protocol";

const METERS_TO_PX = 12;
const ORIGIN_OFFSET_PX = 40;
const FALLBACK_WIDTH_PX = 960;
const FALLBACK_HEIGHT_PX = 640;

export type BattlefieldRenderer = {
  clear(): void;
  drawStaticObstacles(obstacles: StaticObstacleFrame[]): void;
  drawFrame(frame: BattleFrame): void;
};

export function createBattlefieldRenderer(container: HTMLElement): BattlefieldRenderer {
  const canvas = container.ownerDocument.createElement("canvas");
  canvas.classList.add("battlefield-canvas");
  container.appendChild(canvas);

  const maybeContext = canvas.getContext("2d");
  if (!maybeContext) {
    throw new Error("2D canvas context is not available");
  }
  const context = maybeContext;

  let staticObstacles: StaticObstacleFrame[] = [];
  let lastFrame: BattleFrame | null = null;

  function render(): void {
    const size = resizeCanvas(canvas, container);
    context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    drawGrid(context, size.width, size.height);
    for (const obstacle of staticObstacles) {
      drawObstacle(context, obstacle);
    }
    if (lastFrame) {
      for (const unit of lastFrame.units) {
        drawUnit(context, unit, lastFrame);
      }
      drawWeaponTracers(context, lastFrame);
    }
  }

  return {
    clear(): void {
      staticObstacles = [];
      lastFrame = null;
      render();
    },
    drawStaticObstacles(obstacles: StaticObstacleFrame[]): void {
      staticObstacles = obstacles;
      render();
    },
    drawFrame(frame: BattleFrame): void {
      lastFrame = frame;
      render();
    },
  };
}

function resizeCanvas(canvas: HTMLCanvasElement, container: HTMLElement): { width: number; height: number; dpr: number } {
  const width = Math.max(1, container.clientWidth || FALLBACK_WIDTH_PX);
  const height = Math.max(1, container.clientHeight || FALLBACK_HEIGHT_PX);
  const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);

  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth;
  }
  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight;
  }
  return { width, height, dpr };
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save();
  context.fillStyle = "#2a3028";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(255, 255, 255, 0.055)";
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x <= width; x += 32) {
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += 32) {
    context.moveTo(0, y);
    context.lineTo(width, y);
  }
  context.stroke();
  context.restore();
}

function drawObstacle(context: CanvasRenderingContext2D, obstacle: StaticObstacleFrame): void {
  const position = worldToCanvas(obstacle.position);
  context.save();
  context.beginPath();
  context.arc(position.x, position.y, obstacle.radiusM * METERS_TO_PX, 0, Math.PI * 2);
  context.fillStyle = "#5c6659";
  context.fill();
  context.strokeStyle = "rgba(15, 17, 13, 0.82)";
  context.lineWidth = 1.5;
  context.stroke();
  context.restore();
}

function drawUnit(context: CanvasRenderingContext2D, unit: UnitFrame, frame: BattleFrame): void {
  const position = worldToCanvas(unit.position);
  const color = unitColor(unit);

  context.save();
  context.translate(position.x, position.y);

  drawCollisionFootprint(context, unit.bodyShape);

  context.rotate(degToRad(unit.hullHeadingDeg));
  drawHull(context, unit.bodyShape, color, unit);
  drawTurret(context, unit);

  context.restore();

  drawUnitLabel(context, unit, position);
  drawArmorBar(context, unit, position);
  drawDamageFlash(context, unit, position, frame);
}

function drawCollisionFootprint(context: CanvasRenderingContext2D, shape: BodyShapeFrame): void {
  const metrics = shapeMetrics(shape);
  context.save();
  context.beginPath();
  if (shape.type === "box") {
    context.rect(-metrics.lengthPx / 2, -metrics.widthPx / 2, metrics.lengthPx, metrics.widthPx);
  } else {
    context.arc(0, 0, shape.radiusM * METERS_TO_PX, 0, Math.PI * 2);
  }
  context.setLineDash([4, 4]);
  context.strokeStyle = "rgba(237, 240, 234, 0.22)";
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}

function drawHull(context: CanvasRenderingContext2D, shape: BodyShapeFrame, color: UnitColors, unit: UnitFrame): void {
  const metrics = shapeMetrics(shape);
  const hullColor = unit.armorIntegrity <= 25 ? desaturate(color.hull) : color.hull;
  context.save();
  context.beginPath();
  context.rect(-metrics.lengthPx / 2, -metrics.widthPx / 2, metrics.lengthPx, metrics.widthPx);
  context.fillStyle = hullColor;
  context.fill();
  context.strokeStyle = color.stroke;
  context.lineWidth = 2;
  context.stroke();

  // Direction marker
  context.beginPath();
  context.moveTo(metrics.lengthPx / 2 - 8, 0);
  context.lineTo(metrics.lengthPx / 2 - 18, -metrics.widthPx / 2 + 5);
  context.lineTo(metrics.lengthPx / 2 - 18, metrics.widthPx / 2 - 5);
  context.closePath();
  context.fillStyle = color.marker;
  context.fill();
  context.restore();
}

function drawTurret(context: CanvasRenderingContext2D, unit: UnitFrame): void {
  const shape = shapeMetrics(unit.bodyShape);
  const turretLength = Math.max(18, shape.lengthPx * 0.48);
  const turretWidth = Math.max(12, shape.widthPx * 0.56);
  const barrelLength = Math.max(18, shape.lengthPx * 0.48);

  context.save();
  context.rotate(degToRad(unit.turretHeadingDeg - unit.hullHeadingDeg));
  context.beginPath();
  context.rect(-turretLength * 0.35, -turretWidth / 2, turretLength, turretWidth);
  context.fillStyle = "rgba(238, 244, 216, 0.62)";
  context.fill();
  context.strokeStyle = "rgba(5, 8, 5, 0.78)";
  context.lineWidth = 1.5;
  context.stroke();

  context.beginPath();
  context.rect(turretLength * 0.18, -2, barrelLength, 4);
  context.fillStyle = "#11140f";
  context.fill();
  context.restore();
}

function drawUnitLabel(context: CanvasRenderingContext2D, unit: UnitFrame, position: Vec2): void {
  context.save();
  context.font = "700 11px Inter, ui-sans-serif, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.fillStyle = "#edf0ea";
  context.strokeStyle = "rgba(10, 12, 10, 0.86)";
  context.lineWidth = 3;
  context.strokeText(unit.name, position.x, position.y - unit.bodyShape.radiusM * METERS_TO_PX - 5);
  context.fillText(unit.name, position.x, position.y - unit.bodyShape.radiusM * METERS_TO_PX - 5);
  context.restore();
}

const ARMOR_BAR_WIDTH_PX = 44;
const ARMOR_BAR_HEIGHT_PX = 5;
const ARMOR_BAR_OFFSET_PX = 18;

function drawArmorBar(context: CanvasRenderingContext2D, unit: UnitFrame, position: Vec2): void {
  const ratio = Math.max(0, unit.armorIntegrity / 100);
  const barY = position.y + unit.bodyShape.radiusM * METERS_TO_PX + ARMOR_BAR_OFFSET_PX;

  context.save();
  // background
  context.fillStyle = "rgba(10, 12, 10, 0.72)";
  context.fillRect(
    position.x - ARMOR_BAR_WIDTH_PX / 2 - 1,
    barY - 1,
    ARMOR_BAR_WIDTH_PX + 2,
    ARMOR_BAR_HEIGHT_PX + 2,
  );

  // bar
  const barColor = ratio > 0.5 ? "#6abf4b" : ratio > 0.25 ? "#e0a840" : "#df4b4b";
  context.fillStyle = barColor;
  context.fillRect(
    position.x - ARMOR_BAR_WIDTH_PX / 2,
    barY,
    ARMOR_BAR_WIDTH_PX * ratio,
    ARMOR_BAR_HEIGHT_PX,
  );
  context.restore();
}

function drawDamageFlash(context: CanvasRenderingContext2D, unit: UnitFrame, position: Vec2, frame: BattleFrame): void {
  const damageEvent = frame.events.find(
    (e) => e.code === "armor_damage" && e.unitId === unit.unitId,
  );
  if (!damageEvent) {
    return;
  }

  context.save();
  context.font = "700 13px Inter, ui-sans-serif, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ff6b4a";
  context.strokeStyle = "rgba(10, 12, 10, 0.9)";
  context.lineWidth = 3;
  const textY = position.y - unit.bodyShape.radiusM * METERS_TO_PX - 22;
  context.strokeText("-25", position.x, textY);
  context.fillText("-25", position.x, textY);
  context.restore();
}

function drawWeaponTracers(context: CanvasRenderingContext2D, frame: BattleFrame): void {
  for (const event of frame.events) {
    if (event.code !== "weapon_fired") {
      continue;
    }
    const unit = frame.units.find((candidate) => candidate.unitId === event.unitId);
    if (!unit) {
      continue;
    }
    const aim = frame.actions.find((action) => action.unitId === event.unitId && action.type === "aimAt" && action.target);
    const target = aim?.target ?? tracerTargetFromTurret(unit);
    drawTracer(context, unit.position, target);
  }
}

function tracerTargetFromTurret(unit: UnitFrame): Vec2 {
  const radians = degToRad(unit.turretHeadingDeg);
  const lengthM = Math.max(20, unit.bodyShape.radiusM * 12);
  return {
    x: unit.position.x + Math.cos(radians) * lengthM,
    y: unit.position.y + Math.sin(radians) * lengthM,
  };
}

function drawTracer(context: CanvasRenderingContext2D, from: Vec2, to: Vec2): void {
  const start = worldToCanvas(from);
  const end = worldToCanvas(to);
  context.save();
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.strokeStyle = "rgba(255, 232, 122, 0.92)";
  context.lineWidth = 3;
  context.stroke();

  context.beginPath();
  context.arc(start.x, start.y, 4, 0, Math.PI * 2);
  context.fillStyle = "rgba(255, 250, 204, 0.9)";
  context.fill();
  context.restore();
}

function shapeMetrics(shape: BodyShapeFrame): { lengthPx: number; widthPx: number } {
  if (shape.type === "box") {
    return {
      lengthPx: shape.lengthM * METERS_TO_PX,
      widthPx: shape.widthM * METERS_TO_PX,
    };
  }
  return {
    lengthPx: shape.radiusM * 2 * METERS_TO_PX,
    widthPx: shape.radiusM * 2 * METERS_TO_PX,
  };
}

function worldToCanvas(position: Vec2): Vec2 {
  return {
    x: position.x * METERS_TO_PX + ORIGIN_OFFSET_PX,
    y: position.y * METERS_TO_PX + ORIGIN_OFFSET_PX,
  };
}

type UnitColors = {
  hull: string;
  stroke: string;
  marker: string;
};

function unitColor(unit: UnitFrame): UnitColors {
  if (unit.name.toLowerCase() === "blue") {
    return { hull: "#5f9ee6", stroke: "#10233c", marker: "#d5e8ff" };
  }
  if (unit.name.toLowerCase() === "red") {
    return { hull: "#df645b", stroke: "#3f1717", marker: "#ffe0dd" };
  }
  return { hull: "#8e9a58", stroke: "#0d0f0c", marker: "#edf0ea" };
}

function desaturate(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const gray = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
  const mix = (c: number) => Math.round(c * 0.45 + gray * 0.55).toString(16).padStart(2, "0");
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
