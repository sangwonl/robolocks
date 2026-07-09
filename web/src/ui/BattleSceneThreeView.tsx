import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { BattleFrame, StaticObstacleFrame } from "../types/protocol";
import { createBattleScene, type BattleScene } from "./battleSceneThreeScene.ts";

type CameraMode = "top" | "iso";

export type BattleSceneThreeViewProps = {
  frame: BattleFrame | null;
  obstacles: StaticObstacleFrame[];
};

const ARENA_CENTER = new THREE.Vector3(20, 0, 12);
const ARENA_FIT_BOUNDS = {
  minX: 0,
  maxX: 40,
  minY: 0,
  maxY: 8,
  minZ: 0,
  maxZ: 24,
};
const FIT_PADDING = 1.12;
const ISO_ELEVATION_DEG = 35.264;
const ISO_POLAR_ANGLE = THREE.MathUtils.degToRad(90 - ISO_ELEVATION_DEG);

export function BattleSceneThreeView({ frame, obstacles }: BattleSceneThreeViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const battleSceneRef = useRef<BattleScene | null>(null);
  const frameRef = useRef<BattleFrame | null>(frame);
  const aspectRef = useRef(1);
  const cameraModeRef = useRef<CameraMode>("iso");
  const [cameraMode, setCameraMode] = useState<CameraMode>("iso");

  frameRef.current = frame;

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
    renderer.shadowMap.enabled = true;
    renderer.domElement.className = "battle-scene-webgl";
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const camera = new THREE.OrthographicCamera(-20, 20, 13, -13, 0.1, 220);
    cameraRef.current = camera;

    const renderCurrentScene = () => {
      const scene = sceneRef.current;
      if (scene) {
        renderer.render(scene, camera);
      }
    };

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
    applyCameraMode(camera, controls, cameraModeRef.current, aspectRef.current);
    controls.addEventListener("change", () => {
      renderCurrentScene();
    });
    controls.update();
    controlsRef.current = controls;

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      aspectRef.current = width / height;
      applyCameraMode(camera, controls, cameraModeRef.current, aspectRef.current);
      renderer.setSize(width, height, false);
      renderCurrentScene();
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
    applyCameraMode(camera, controls, cameraMode, aspectRef.current);
    if (renderer && scene) {
      renderer.render(scene, camera);
    }
  }, [cameraMode]);

  // Scene lifetime is tied to the loaded replay (its obstacle set). Statics build
  // once here; frame stepping never recreates the scene.
  useEffect(() => {
    const battleScene = createBattleScene({ obstacles });
    battleSceneRef.current = battleScene;
    sceneRef.current = battleScene.scene;
    battleScene.sync(frameRef.current);
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (renderer && camera) {
      controls?.update();
      renderer.render(battleScene.scene, camera);
    }
    return () => {
      battleScene.dispose();
      battleSceneRef.current = null;
      sceneRef.current = null;
    };
  }, [obstacles]);

  // Frame stepping only updates the persistent rigs in place — no allocation of a
  // new scene, no disposal.
  useEffect(() => {
    const battleScene = battleSceneRef.current;
    if (!battleScene) {
      return;
    }
    battleScene.sync(frame);
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (renderer && camera) {
      renderer.render(battleScene.scene, camera);
    }
  }, [frame]);

  return (
    <div ref={hostRef} className="battle-scene-three" aria-label="Battle scene viewport">
      <div className="view-mode-menu" aria-label="Camera mode">
        <button
          type="button"
          className={cameraMode === "top" ? "active" : ""}
          onClick={() => setCameraMode("top")}
        >
          Top
        </button>
        <button
          type="button"
          className={cameraMode === "iso" ? "active" : ""}
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
): void {
  controls.target.copy(ARENA_CENTER);

  if (mode === "iso") {
    const distance = 64;
    const horizontal = distance * Math.cos(THREE.MathUtils.degToRad(ISO_ELEVATION_DEG));
    const height = distance * Math.sin(THREE.MathUtils.degToRad(ISO_ELEVATION_DEG));
    const diagonal = horizontal / Math.sqrt(2);
    camera.up.set(0, 1, 0);
    camera.position.set(ARENA_CENTER.x + diagonal, ARENA_CENTER.y + height, ARENA_CENTER.z + diagonal);
    controls.enableRotate = true;
    controls.minPolarAngle = ISO_POLAR_ANGLE;
    controls.maxPolarAngle = ISO_POLAR_ANGLE;
  } else {
    camera.up.set(0, 0, -1);
    camera.position.set(ARENA_CENTER.x, ARENA_CENTER.y + 58, ARENA_CENTER.z);
    controls.enableRotate = false;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = 0.02;
  }

  camera.lookAt(ARENA_CENTER);
  camera.updateMatrixWorld(true);
  fitCameraToArena(camera, aspect);
  camera.updateProjectionMatrix();
  controls.update();
}

function fitCameraToArena(camera: THREE.OrthographicCamera, aspect: number): void {
  const inverseCameraMatrix = camera.matrixWorldInverse;
  const corners = [
    new THREE.Vector3(ARENA_FIT_BOUNDS.minX, ARENA_FIT_BOUNDS.minY, ARENA_FIT_BOUNDS.minZ),
    new THREE.Vector3(ARENA_FIT_BOUNDS.minX, ARENA_FIT_BOUNDS.minY, ARENA_FIT_BOUNDS.maxZ),
    new THREE.Vector3(ARENA_FIT_BOUNDS.maxX, ARENA_FIT_BOUNDS.minY, ARENA_FIT_BOUNDS.minZ),
    new THREE.Vector3(ARENA_FIT_BOUNDS.maxX, ARENA_FIT_BOUNDS.minY, ARENA_FIT_BOUNDS.maxZ),
    new THREE.Vector3(ARENA_FIT_BOUNDS.minX, ARENA_FIT_BOUNDS.maxY, ARENA_FIT_BOUNDS.minZ),
    new THREE.Vector3(ARENA_FIT_BOUNDS.minX, ARENA_FIT_BOUNDS.maxY, ARENA_FIT_BOUNDS.maxZ),
    new THREE.Vector3(ARENA_FIT_BOUNDS.maxX, ARENA_FIT_BOUNDS.maxY, ARENA_FIT_BOUNDS.minZ),
    new THREE.Vector3(ARENA_FIT_BOUNDS.maxX, ARENA_FIT_BOUNDS.maxY, ARENA_FIT_BOUNDS.maxZ),
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

  const projectedWidth = Math.max(1, Math.max(Math.abs(minX), Math.abs(maxX)) * 2) * FIT_PADDING;
  const projectedHeight = Math.max(1, Math.max(Math.abs(minY), Math.abs(maxY)) * 2) * FIT_PADDING;
  const viewHeight = Math.max(projectedHeight, projectedWidth / Math.max(aspect, 0.01));
  const viewWidth = viewHeight * Math.max(aspect, 0.01);

  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
}
