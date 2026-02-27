import { ref, watch, type Ref } from 'vue';
import * as THREE from 'three';
import cameraConfig from '../../public/assets/cameraPositions.json';

export interface SceneCameraDef {
  name: string;
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  color: string;
}

export interface SceneCameraEntry {
  name: string;
  color: string;
  camera: THREE.PerspectiveCamera;
  gizmoMesh: THREE.Group;
  visible: boolean;
}

const GIZMO_SCALE = 0.2;

function createCameraGizmo(
  position: { x: number; y: number; z: number },
  lookAt: { x: number; y: number; z: number },
  color: string,
  rotationDeg: number = 0,
): THREE.Group {
  const s = GIZMO_SCALE;

  const hw = s * 0.8;
  const hh = s * 0.45;

  const fd = s * 1.6;

  const apex: [number, number, number] = [0, 0, 0];

  const tl: [number, number, number] = [-hw,  hh, fd];
  const tr: [number, number, number] = [ hw,  hh, fd];
  const br: [number, number, number] = [ hw, -hh, fd];
  const bl: [number, number, number] = [-hw, -hh, fd];

  const lineVerts = new Float32Array([
    ...tl, ...tr,
    ...tr, ...br,
    ...br, ...bl,
    ...bl, ...tl,

    ...apex, ...tl,
    ...apex, ...tr,
    ...apex, ...br,
    ...apex, ...bl,
  ]);

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lineVerts, 3));

  const lineMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    depthTest: true,
  });

  const lines = new THREE.LineSegments(lineGeo, lineMat);

  // Apply camera body rotation around the local Z axis (the viewing direction)
  const rotRad = (rotationDeg * Math.PI) / 180;
  lines.rotation.z = rotRad;

  const gap   = s * 0.08;
  const triH  = s * 0.3;
  const triW  = s * 0.25;
  const triY  = hh + gap;

  const triVerts = new Float32Array([
    -triW, triY,        fd,
     triW, triY,        fd,
        0, triY + triH, fd,
  ]);

  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.BufferAttribute(triVerts, 3));
  triGeo.setIndex([0, 1, 2]);

  const triMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    side: THREE.DoubleSide,
    depthTest: true,
  });

  const triMesh = new THREE.Mesh(triGeo, triMat);
  triMesh.rotation.z = rotRad;

  const group = new THREE.Group();
  group.add(lines);
  group.add(triMesh);

  group.position.set(position.x, position.y, position.z);

  group.lookAt(lookAt.x, lookAt.y, lookAt.z);

  return group;
}

export function useSceneCameras(selectedCount?: Ref<number>) {
  const sceneCameras = ref<SceneCameraEntry[]>([]);
  let attachedScene: THREE.Scene | null = null;

  function addToScene(scene: THREE.Scene) {
    attachedScene = scene;
    const defs = (cameraConfig.staticCameras ?? []) as SceneCameraDef[];

    for (const def of defs) {
      const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 100);
      cam.position.set(def.position.x, def.position.y, def.position.z);
      cam.lookAt(def.lookAt.x, def.lookAt.y, def.lookAt.z);
      cam.name = def.name;
      cam.updateProjectionMatrix();

      const gizmoMesh = createCameraGizmo(def.position, def.lookAt, def.color);
      gizmoMesh.name = `${def.name}_gizmo`;
      gizmoMesh.visible = false;

      scene.add(cam);
      scene.add(gizmoMesh);

      sceneCameras.value.push({
        name: def.name,
        color: def.color,
        camera: cam,
        gizmoMesh,
        visible: false,
      });
    }

    syncVisibility();
  }

  /** Show only the first N scene cameras, where N = selected physical camera count. */
  function syncVisibility() {
    const count = selectedCount?.value ?? 0;
    for (let i = 0; i < sceneCameras.value.length; i++) {
      const show = i < count;
      sceneCameras.value[i].gizmoMesh.visible = show;
      sceneCameras.value[i].visible = show;
    }
  }

  /** Update the rotation of a scene camera gizmo by index. */
  function setGizmoRotation(index: number, rotationDeg: number) {
    const entry = sceneCameras.value[index];
    if (!entry) return;

    const rotRad = (rotationDeg * Math.PI) / 180;
    // Both children (lines + triangle) rotate together
    for (const child of entry.gizmoMesh.children) {
      child.rotation.z = rotRad;
    }
  }

  if (selectedCount) {
    watch(selectedCount, () => syncVisibility());
  }

  function dispose() {
    for (const entry of sceneCameras.value) {
      attachedScene?.remove(entry.gizmoMesh);
      attachedScene?.remove(entry.camera);
      entry.gizmoMesh.traverse((child) => {
        if ((child as THREE.Mesh).geometry) {
          (child as THREE.Mesh).geometry.dispose();
        }
        if ((child as THREE.Mesh).material) {
          ((child as THREE.Mesh).material as THREE.Material).dispose();
        }
      });
    }
    sceneCameras.value = [];
    attachedScene = null;
  }

  return {
    sceneCameras,
    addToScene,
    syncVisibility,
    setGizmoRotation,
    dispose,
  } as const;
}
