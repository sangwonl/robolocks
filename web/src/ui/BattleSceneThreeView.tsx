import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { BattleFrame, StaticObstacleFrame } from "../types/protocol";
import { buildBattleScene } from "./battleSceneThreeScene.ts";

type CameraMode = "top" | "iso";

export type BattleSceneThreeViewProps = {
  frame: BattleFrame | null;
  obstacles: StaticObstacleFrame[];
};

const ARENA_CENTER = new THREE.Vector3(20, 0, 12);
const VIEW_HEIGHT = 28;
const ISO_ELEVATION_DEG = 35.264;
const ISO_POLAR_ANGLE = THREE.MathUtils.degToRad(90 - ISO_ELEVATION_DEG);

export function BattleSceneThreeView({ frame, obstacles }: BattleSceneThreeViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("top");

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

    const camera = new THREE.OrthographicCamera(-20, 20, 13, -13, 0.1, 140);
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
    applyCameraMode(camera, controls, cameraMode);
    controls.addEventListener("change", () => {
      renderCurrentScene();
    });
    controls.update();
    controlsRef.current = controls;

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const aspect = width / height;
      const viewWidth = VIEW_HEIGHT * aspect;
      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = VIEW_HEIGHT / 2;
      camera.bottom = -VIEW_HEIGHT / 2;
      camera.updateProjectionMatrix();
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
    applyCameraMode(camera, controls, cameraMode);
    if (renderer && scene) {
      renderer.render(scene, camera);
    }
  }, [cameraMode]);

  useEffect(() => {
    const scene = buildBattleScene({ frame, obstacles });
    sceneRef.current = scene;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (renderer && camera) {
      controls?.update();
      renderer.render(scene, camera);
    }
    return () => {
      disposeScene(scene);
    };
  }, [frame, obstacles]);

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
): void {
  controls.target.copy(ARENA_CENTER);

  if (mode === "iso") {
    const distance = 54;
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
  camera.updateProjectionMatrix();
  controls.update();
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const item of material) {
        item.dispose();
      }
    } else if (material) {
      material.dispose();
    }
  });
}
