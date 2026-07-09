import type { BattleFrame, StaticObstacleFrame } from "../types/protocol";
import { parseFrame } from "./frameParsing.ts";

export type BattleReplay = {
  type: "robolocks.replay.v1";
  tickRate: number;
  obstacles: StaticObstacleFrame[];
  frames: BattleFrame[];
};

type ReplayPayload = {
  type?: unknown;
  tickRate?: unknown;
  obstacles?: unknown;
  frames?: unknown;
};

type ReplayObstaclePayload = {
  id?: unknown;
  position?: unknown;
  radiusMeters?: unknown;
  blocksMovement?: unknown;
  blocksLineOfSight?: unknown;
};

export function parseBattleReplay(text: string): BattleReplay {
  const payload = JSON.parse(text) as ReplayPayload;
  if (payload.type !== "robolocks.replay.v1") {
    throw new Error("Unsupported replay type");
  }
  if (typeof payload.tickRate !== "number" || !Array.isArray(payload.frames)) {
    throw new Error("Invalid replay payload");
  }

  return {
    type: "robolocks.replay.v1",
    tickRate: payload.tickRate,
    obstacles: Array.isArray(payload.obstacles) ? payload.obstacles.map(parseObstacle) : [],
    frames: payload.frames.map(parseFrame),
  };
}

function parseObstacle(payload: unknown): StaticObstacleFrame {
  const obstacle = payload as ReplayObstaclePayload;
  const position = obstacle.position as { x?: unknown; y?: unknown };
  if (
    typeof obstacle.id !== "string" ||
    typeof position !== "object" ||
    position === null ||
    typeof position.x !== "number" ||
    typeof position.y !== "number" ||
    typeof obstacle.radiusMeters !== "number" ||
    typeof obstacle.blocksMovement !== "boolean" ||
    typeof obstacle.blocksLineOfSight !== "boolean"
  ) {
    throw new Error("Invalid replay obstacle");
  }

  return {
    id: obstacle.id,
    position: { x: position.x, y: position.y },
    radiusMeters: obstacle.radiusMeters,
    blocksMovement: obstacle.blocksMovement,
    blocksLineOfSight: obstacle.blocksLineOfSight,
  };
}
