import { useEffect, useRef, useState } from "react";
import { Repeat } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { BattleFrame, FieldBoundsFrame, StaticObstacleFrame } from "../types/protocol";
import { cn } from "../lib/utils.ts";
import { createBattleScene, type BattleScene } from "./battleSceneThreeScene.ts";

type CameraMode = "top" | "perspective" | "fpv";

export type BattleSceneThreeViewProps = {
  frame: BattleFrame | null;
  obstacles: StaticObstacleFrame[];
  field: FieldBoundsFrame;
};

// Vertical extent (metres) folded into the camera fit so tall units stay framed.
const FIELD_VERTICAL_M = 8;
const CAMERA_FOV_DEG = 50;
const FIT_PADDING = 0.78;
const ISO_ELEVATION_DEG = 35.264;
// Free-orbit tilt limits: stay above the ground and short of straight-down.
const MIN_POLAR_ANGLE = THREE.MathUtils.degToRad(2);
const MAX_POLAR_ANGLE = THREE.MathUtils.degToRad(85);

function fieldCenter(field: FieldBoundsFrame): THREE.Vector3 {
  return new THREE.Vector3((field.min.x + field.max.x) / 2, 0, (field.min.y + field.max.y) / 2);
}

export function BattleSceneThreeView({ frame, obstacles, field }: BattleSceneThreeViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const battleSceneRef = useRef<BattleScene | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<BattleFrame | null>(frame);
  const fieldRef = useRef<FieldBoundsFrame>(field);
  const aspectRef = useRef(1);
  const cameraModeRef = useRef<CameraMode>("perspective");
  const [cameraMode, setCameraMode] = useState<CameraMode>("perspective");
  // Which unit the first-person camera rides (null = default to Blue/first).
  const [fpvUnitId, setFpvUnitId] = useState<number | null>(null);
  const fpvUnitIdRef = useRef<number | null>(fpvUnitId);

  frameRef.current = frame;
  fieldRef.current = field;
  fpvUnitIdRef.current = fpvUnitId;

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  // Clicking FPV enters first-person; clicking it again cycles to the next unit.
  const handleFpvClick = () => {
    const units = frameRef.current ? [...frameRef.current.units].sort((a, b) => a.unitId - b.unitId) : [];
    if (cameraModeRef.current !== "fpv") {
      setCameraMode("fpv");
      // Pin to the default unit (Blue/first) so the next click cycles cleanly.
      if (fpvUnitIdRef.current === null && units.length > 0) {
        setFpvUnitId((units.find((unit) => unit.teamId === 1) ?? units[0]).unitId);
      }
      return;
    }
    if (units.length === 0) {
      return;
    }
    const currentIndex = units.findIndex((unit) => unit.unitId === fpvUnitIdRef.current);
    setFpvUnitId(units[(currentIndex + 1) % units.length].unitId);
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = false;
    renderer.domElement.className = "block h-full w-full";
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.1, 4000);
    cameraRef.current = camera;

    const renderCurrentScene = () => {
      const scene = sceneRef.current;
      const battleScene = battleSceneRef.current;
      if (scene) {
        battleScene?.faceCamera(camera);
        renderer.render(scene, camera);
      }
    };
    let renderQueued = false;
    const requestRender = () => {
      if (renderQueued) {
        return;
      }
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        renderCurrentScene();
      });
    };
    requestRenderRef.current = requestRender;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.screenSpacePanning = true;
    controls.enableRotate = true;
    controls.minPolarAngle = MIN_POLAR_ANGLE;
    controls.maxPolarAngle = MAX_POLAR_ANGLE;
    controls.minDistance = 8;
    controls.maxDistance = 600;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    controls.addEventListener("change", () => {
      requestRender();
    });
    controls.update();
    controlsRef.current = controls;

    // On resize only update the aspect + projection; do NOT re-run applyCameraMode,
    // which would yank the camera back to the preset and undo the user's free
    // navigation. The preset buttons are the only thing that reposition.
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      aspectRef.current = width / height;
      camera.aspect = Math.max(width / height, 0.01);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      requestRender();
    };

    // Frame the field once for the initial mount.
    applyCameraMode(camera, controls, cameraModeRef.current, host.clientWidth / Math.max(1, host.clientHeight), fieldRef.current);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // Continuous animation loop for real-time visual effects (the scan-cone sweep
    // pulse). This is cosmetic only and independent of the deterministic sim; it
    // advances a time uniform and redraws each frame while mounted.
    const startTime = performance.now();
    let animationHandle = requestAnimationFrame(function animate() {
      const timeSeconds = (performance.now() - startTime) / 1000;
      battleSceneRef.current?.advanceAnimation(timeSeconds);
      renderCurrentScene();
      animationHandle = requestAnimationFrame(animate);
    });

    return () => {
      cancelAnimationFrame(animationHandle);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      requestRenderRef.current = null;
    };
  }, []);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!camera || !controls) {
      return;
    }
    cameraModeRef.current = cameraMode;
    if (cameraMode === "fpv") {
      applyFpvCamera(camera, controls, frameRef.current, fieldRef.current, fpvUnitIdRef.current);
    } else {
      controls.enabled = true;
      applyCameraMode(camera, controls, cameraMode, aspectRef.current, fieldRef.current);
    }
    if (renderer && scene) {
      battleSceneRef.current?.faceCamera(camera);
      requestRenderRef.current?.();
    }
  }, [cameraMode, fpvUnitId]);

  // Scene lifetime is tied to the loaded replay (its obstacle set and play field).
  // Statics — ground, grid, boundary — build once here from the field bounds;
  // frame stepping never recreates the scene. The camera is refit to the field so
  // a larger/smaller arena stays framed.
  useEffect(() => {
    const battleScene = createBattleScene({ obstacles, field });
    battleSceneRef.current = battleScene;
    sceneRef.current = battleScene.scene;
    battleScene.sync(frameRef.current);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      applyCameraMode(camera, controls, cameraModeRef.current, aspectRef.current, field);
      battleScene.faceCamera(camera);
      requestRenderRef.current?.();
    }
    return () => {
      battleScene.dispose();
      battleSceneRef.current = null;
      sceneRef.current = null;
    };
  }, [obstacles, field]);

  // Frame stepping only updates the persistent rigs in place — no allocation of a
  // new scene, no disposal.
  useEffect(() => {
    const battleScene = battleSceneRef.current;
    if (!battleScene) {
      return;
    }
    battleScene.sync(frame);
    const camera = cameraRef.current;
    if (camera) {
      // First-person rides the unit, so re-place the camera as the unit moves.
      if (cameraModeRef.current === "fpv" && controlsRef.current) {
        applyFpvCamera(camera, controlsRef.current, frame, fieldRef.current, fpvUnitIdRef.current);
      }
      battleScene.faceCamera(camera);
      requestRenderRef.current?.();
    }
  }, [frame]);

  return (
    <div ref={hostRef} className="absolute inset-0 min-h-0 min-w-0" aria-label="Battle scene viewport">
      <div
        className="absolute right-3 top-3 z-[2] grid grid-cols-[repeat(3,54px)] gap-1 rounded-lg border border-[var(--brand-border-menu)] bg-[var(--overlay)] p-1 backdrop-blur-md"
        aria-label="Camera mode"
      >
        {([
          { mode: "top" as const, label: "Top" },
          { mode: "perspective" as const, label: "Persp." },
        ]).map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            className={cn(
              "w-[54px] rounded-[5px] border-0 bg-transparent px-0 py-2 text-[10px] font-semibold leading-none text-[var(--text-dim)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
              cameraMode === mode && "bg-[var(--brand)] text-[var(--ink)]",
            )}
            aria-pressed={cameraMode === mode}
            onClick={() => setCameraMode(mode)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={cn(
            "flex w-[54px] items-center justify-center gap-1 rounded-[5px] border-0 bg-transparent px-0 py-2 text-[10px] font-semibold leading-none text-[var(--text-dim)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] [&_svg]:h-3 [&_svg]:w-3",
            cameraMode === "fpv" && "bg-[var(--brand)] text-[var(--ink)]",
          )}
          aria-pressed={cameraMode === "fpv"}
          title="First-person view. Click again to cycle units."
          onClick={handleFpvClick}
        >
          FPV
          <Repeat aria-hidden="true" />
        </button>
      </div>
      {cameraMode === "fpv" ? (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[2] rounded-md border border-[var(--line)] bg-[var(--overlay)] px-2 py-1 text-[9px] font-semibold text-[var(--text-muted)] backdrop-blur-md">
          FPV: {pickFpvUnit(frame, fpvUnitId)?.name ?? "—"} · click FPV to cycle units
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[2] rounded-md border border-[var(--line)] bg-[var(--overlay)] px-2 py-1 text-[9px] font-semibold text-[var(--text-muted)] backdrop-blur-md">
          drag=rotate · right-drag / two-finger=move · wheel=zoom
        </div>
      )}
    </div>
  );
}

// Picks the unit the first-person camera rides: the selected unit if it is still
// in the frame, else Blue (team 1), else the first unit.
function pickFpvUnit(frame: BattleFrame | null, fpvUnitId: number | null) {
  if (!frame || frame.units.length === 0) {
    return null;
  }
  if (fpvUnitId !== null) {
    const selected = frame.units.find((unit) => unit.unitId === fpvUnitId);
    if (selected) {
      return selected;
    }
  }
  return frame.units.find((unit) => unit.teamId === 1) ?? frame.units[0];
}

// First-person camera: sit on the followed unit's turret and look down its aim
// (turret heading). OrbitControls is disabled so the view stays locked to the unit.
function applyFpvCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  frame: BattleFrame | null,
  field: FieldBoundsFrame,
  fpvUnitId: number | null,
): void {
  controls.enabled = false;
  const unit = pickFpvUnit(frame, fpvUnitId);
  if (!unit) {
    // No unit to ride yet: frame the field from a low angle as a placeholder.
    applyCameraMode(camera, controls, "perspective", camera.aspect, field);
    controls.enabled = false;
    return;
  }
  const theta = THREE.MathUtils.degToRad(unit.turretHeadingDegrees);
  const forwardX = Math.cos(theta);
  const forwardZ = Math.sin(theta);
  const EYE_HEIGHT_M = 2.6;
  const LOOK_HEIGHT_M = 1.6;
  const BACK_OFFSET_M = 1.2; // sit just behind the turret pivot
  const LOOK_AHEAD_M = 60;
  camera.up.set(0, 1, 0);
  camera.position.set(unit.position.x - forwardX * BACK_OFFSET_M, EYE_HEIGHT_M, unit.position.y - forwardZ * BACK_OFFSET_M);
  camera.lookAt(unit.position.x + forwardX * LOOK_AHEAD_M, LOOK_HEIGHT_M, unit.position.y + forwardZ * LOOK_AHEAD_M);
  camera.updateProjectionMatrix();
}

// Positions the free-orbit perspective camera for a preset viewpoint (iso or
// top) framed to the whole field. After this runs the OrbitControls are fully
// free — the user can rotate, tilt, dolly, and pan from here; the buttons just
// snap back to a known vantage.
function applyCameraMode(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  mode: CameraMode,
  aspect: number,
  field: FieldBoundsFrame,
): void {
  const center = fieldCenter(field);
  camera.up.set(0, 1, 0);
  camera.aspect = Math.max(aspect, 0.01);
  const distance = fitDistance(camera, field);

  if (mode === "top") {
    // Near-top-down; a tiny z offset avoids the up-vector/​view-dir singularity.
    camera.position.set(center.x, center.y + distance, center.z + 0.001);
  } else {
    const horizontal = distance * Math.cos(THREE.MathUtils.degToRad(ISO_ELEVATION_DEG));
    const height = distance * Math.sin(THREE.MathUtils.degToRad(ISO_ELEVATION_DEG));
    const diagonal = horizontal / Math.sqrt(2);
    camera.position.set(center.x + diagonal, center.y + height, center.z + diagonal);
  }

  controls.target.copy(center);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  controls.update();
}

// Distance at which the field dimensions fit within the camera frustum, plus
// modest padding. Fitting width/depth separately avoids the overly distant view
// produced by a diagonal bounding sphere.
function fitDistance(camera: THREE.PerspectiveCamera, field: FieldBoundsFrame): number {
  const width = field.max.x - field.min.x;
  const depth = field.max.y - field.min.y;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const verticalFit = (Math.max(depth, FIELD_VERTICAL_M) / 2) / Math.tan(vFov / 2);
  const horizontalFit = (width / 2) / Math.tan(Math.max(0.1, hFov) / 2);
  return Math.max(verticalFit, horizontalFit) * FIT_PADDING;
}
