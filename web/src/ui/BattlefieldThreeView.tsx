import { useEffect, useRef } from "react";
import * as THREE from "three";

import type { BattleFrame, StaticObstacleFrame } from "../types/protocol";
import { buildBattlefieldScene } from "./battlefieldThreeScene.ts";

export type BattlefieldThreeViewProps = {
  frame: BattleFrame | null;
  obstacles: StaticObstacleFrame[];
};

export function BattlefieldThreeView({ frame, obstacles }: BattlefieldThreeViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.domElement.className = "battlefield-webgl";
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const camera = new THREE.OrthographicCamera(-20, 20, 13, -13, 0.1, 140);
    camera.position.set(20, 58, 12);
    camera.lookAt(20, 0, 12);
    cameraRef.current = camera;

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

    const renderCurrentScene = () => {
      const scene = sceneRef.current;
      if (scene) {
        renderer.render(scene, camera);
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    return () => {
      observer.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
      rendererRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = buildBattlefieldScene({ frame, obstacles });
    sceneRef.current = scene;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (renderer && camera) {
      renderer.render(scene, camera);
    }
    return () => {
      disposeScene(scene);
    };
  }, [frame, obstacles]);

  return <div ref={hostRef} className="battlefield-three" aria-label="Battlefield viewport" />;
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
