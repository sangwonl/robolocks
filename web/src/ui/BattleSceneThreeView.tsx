import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { BattleFrame, FieldBoundsFrame, StaticObstacleFrame } from "../types/protocol";
import { cn } from "../lib/utils.ts";
import { createBattleScene, type BattleScene } from "./battleSceneThreeScene.ts";

type CameraMode = "top" | "perspective";

export type BattleSceneThreeViewProps = {
  frame: BattleFrame | null;
  obstacles: StaticObstacleFrame[];
  field: FieldBoundsFrame;
};

// Vertical extent (metres) folded into the camera fit so tall units stay framed.
const FIELD_VERTICAL_M = 8;
const CAMERA_FOV_DEG = 50;
const FIT_PADDING = 1.25;
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

  frameRef.current = frame;
  fieldRef.current = field;

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

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
    applyCameraMode(camera, controls, cameraMode, aspectRef.current, fieldRef.current);
    if (renderer && scene) {
      battleSceneRef.current?.faceCamera(camera);
      requestRenderRef.current?.();
    }
  }, [cameraMode]);

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
      battleScene.faceCamera(camera);
      requestRenderRef.current?.();
    }
  }, [frame]);

  return (
    <div ref={hostRef} className="absolute inset-0 min-h-0 min-w-0" aria-label="Battle scene viewport">
      <div
        className="absolute right-3 top-3 z-[2] grid grid-cols-[repeat(2,54px)] gap-1 rounded-lg border border-[var(--brand-border-menu)] bg-[var(--overlay)] p-1 backdrop-blur-md"
        aria-label="Camera mode"
      >
        <button
          type="button"
          className={cn(
            "w-[54px] rounded-[5px] border-0 bg-transparent px-0 py-2 text-[10px] font-semibold leading-none text-[var(--text-dim)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
            cameraMode === "top" && "bg-[var(--brand)] text-[var(--ink)]",
          )}
          aria-pressed={cameraMode === "top"}
          onClick={() => setCameraMode("top")}
        >
          Top
        </button>
        <button
          type="button"
          className={cn(
            "w-[54px] rounded-[5px] border-0 bg-transparent px-0 py-2 text-[10px] font-semibold leading-none text-[var(--text-dim)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
            cameraMode === "perspective" && "bg-[var(--brand)] text-[var(--ink)]",
          )}
          aria-pressed={cameraMode === "perspective"}
          onClick={() => setCameraMode("perspective")}
        >
          Persp.
        </button>
      </div>
    </div>
  );
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

// Distance at which the field's bounding sphere fits within the camera frustum
// (accounting for the narrower of the vertical/horizontal fov), plus padding.
function fitDistance(camera: THREE.PerspectiveCamera, field: FieldBoundsFrame): number {
  const width = field.max.x - field.min.x;
  const depth = field.max.y - field.min.y;
  const radius = 0.5 * Math.hypot(width, depth, FIELD_VERTICAL_M);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const fov = Math.max(0.1, Math.min(vFov, hFov));
  return (radius / Math.sin(fov / 2)) * FIT_PADDING;
}
