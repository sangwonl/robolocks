import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { BattleFrame, StaticObstacleFrame } from "../types/protocol";
import { buildBattleScene } from "./battleSceneThreeScene.ts";

export type BattleSceneThreeViewProps = {
  frame: BattleFrame | null;
  obstacles: StaticObstacleFrame[];
};

export function BattleSceneThreeView({ frame, obstacles }: BattleSceneThreeViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

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
    camera.position.set(20, 58, 12);
    camera.lookAt(20, 0, 12);
    cameraRef.current = camera;

    const renderCurrentScene = () => {
      const scene = sceneRef.current;
      if (scene) {
        renderer.render(scene, camera);
      }
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(20, 0, 12);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.screenSpacePanning = true;
    controls.minZoom = 0.45;
    controls.maxZoom = 4;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = Math.PI / 3;
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
      renderCurrentScene();
    });
    controls.update();
    controlsRef.current = controls;

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const aspect = width / height;
      const viewHeight = 28;
      const viewWidth = viewHeight * aspect;
      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
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

  return <div ref={hostRef} className="battle-scene-three" aria-label="Battle scene viewport" />;
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
