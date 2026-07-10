import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { BattleFrame, FieldBoundsFrame, StaticObstacleFrame } from "../types/protocol";
import { cn } from "../lib/utils.ts";
import { createBattleScene, type BattleScene } from "./battleSceneThreeScene.ts";

type CameraMode = "top" | "iso";

export type BattleSceneThreeViewProps = {
  frame: BattleFrame | null;
  obstacles: StaticObstacleFrame[];
  field: FieldBoundsFrame;
};

// Vertical extent (metres) folded into the camera fit so tall units stay framed.
const FIELD_VERTICAL_M = 8;
const FIT_PADDING = 1.1;
const FIT_BOTTOM_SAFE_AREA = 0.18;
const ISO_ELEVATION_DEG = 35.264;
const ISO_POLAR_ANGLE = THREE.MathUtils.degToRad(90 - ISO_ELEVATION_DEG);

function fieldCenter(field: FieldBoundsFrame): THREE.Vector3 {
  return new THREE.Vector3((field.min.x + field.max.x) / 2, 0, (field.min.y + field.max.y) / 2);
}

export function BattleSceneThreeView({ frame, obstacles, field }: BattleSceneThreeViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const battleSceneRef = useRef<BattleScene | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<BattleFrame | null>(frame);
  const fieldRef = useRef<FieldBoundsFrame>(field);
  const aspectRef = useRef(1);
  const cameraModeRef = useRef<CameraMode>("iso");
  const [cameraMode, setCameraMode] = useState<CameraMode>("iso");

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

    const camera = new THREE.OrthographicCamera(-20, 20, 13, -13, 0.1, 220);
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
    controls.minZoom = 0.45;
    controls.maxZoom = 4;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    applyCameraMode(camera, controls, cameraModeRef.current, aspectRef.current, fieldRef.current);
    controls.addEventListener("change", () => {
      requestRender();
    });
    controls.update();
    controlsRef.current = controls;

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      aspectRef.current = width / height;
      applyCameraMode(camera, controls, cameraModeRef.current, aspectRef.current, fieldRef.current);
      renderer.setSize(width, height, false);
      requestRender();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    return () => {
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
            cameraMode === "iso" && "bg-[var(--brand)] text-[var(--ink)]",
          )}
          aria-pressed={cameraMode === "iso"}
          onClick={() => setCameraMode("iso")}
        >
          Iso
        </button>
      </div>
    </div>
  );
}

function applyCameraMode(
  camera: THREE.OrthographicCamera,
  controls: OrbitControls,
  mode: CameraMode,
  aspect: number,
  field: FieldBoundsFrame,
): void {
  const center = fieldCenter(field);
  controls.target.copy(center);

  if (mode === "iso") {
    const distance = 64;
    const horizontal = distance * Math.cos(THREE.MathUtils.degToRad(ISO_ELEVATION_DEG));
    const height = distance * Math.sin(THREE.MathUtils.degToRad(ISO_ELEVATION_DEG));
    const diagonal = horizontal / Math.sqrt(2);
    camera.up.set(0, 1, 0);
    camera.position.set(center.x + diagonal, center.y + height, center.z + diagonal);
    controls.enableRotate = true;
    controls.minPolarAngle = ISO_POLAR_ANGLE;
    controls.maxPolarAngle = ISO_POLAR_ANGLE;
  } else {
    camera.up.set(0, 0, -1);
    camera.position.set(center.x, center.y + 58, center.z);
    controls.enableRotate = false;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = 0.02;
  }

  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  fitCameraToArena(camera, aspect, field);
  camera.updateProjectionMatrix();
  controls.update();
}

function fitCameraToArena(camera: THREE.OrthographicCamera, aspect: number, field: FieldBoundsFrame): void {
  const inverseCameraMatrix = camera.matrixWorldInverse;
  const corners = [
    new THREE.Vector3(field.min.x, 0, field.min.y),
    new THREE.Vector3(field.min.x, 0, field.max.y),
    new THREE.Vector3(field.max.x, 0, field.min.y),
    new THREE.Vector3(field.max.x, 0, field.max.y),
    new THREE.Vector3(field.min.x, FIELD_VERTICAL_M, field.min.y),
    new THREE.Vector3(field.min.x, FIELD_VERTICAL_M, field.max.y),
    new THREE.Vector3(field.max.x, FIELD_VERTICAL_M, field.min.y),
    new THREE.Vector3(field.max.x, FIELD_VERTICAL_M, field.max.y),
  ];

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const corner of corners) {
    const local = corner.clone().applyMatrix4(inverseCameraMatrix);
    minX = Math.min(minX, local.x);
    maxX = Math.max(maxX, local.x);
    minY = Math.min(minY, local.y);
    maxY = Math.max(maxY, local.y);
  }

  const projectedWidth = Math.max(1, maxX - minX);
  const projectedHeight = Math.max(1, maxY - minY);
  const paddedWidth = projectedWidth * FIT_PADDING;
  const paddedHeight = projectedHeight * FIT_PADDING;
  const aspectSafe = Math.max(aspect, 0.01);
  const contentHeight = Math.max(paddedHeight, paddedWidth / aspectSafe);
  const extraBottom = contentHeight * FIT_BOTTOM_SAFE_AREA;
  const viewHeight = contentHeight + extraBottom;
  const viewWidth = viewHeight * aspectSafe;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  camera.left = centerX - viewWidth / 2;
  camera.right = centerX + viewWidth / 2;
  camera.top = centerY + contentHeight / 2;
  camera.bottom = camera.top - viewHeight;
}
