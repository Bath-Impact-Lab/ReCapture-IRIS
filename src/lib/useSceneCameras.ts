import { ref, watch, type Ref } from 'vue';
import * as THREE from 'three'; 
import { PLYLoader } from 'three/examples/jsm/Addons.js';
export interface SceneCameraDef {
  name: string;
  position: { x: number; y: number; z: number };
  rotation: number[];
  color: string;
}

export interface SceneCameraEntry {
  name: string;
  color: string;
  camera: THREE.PerspectiveCamera;
  gizmoMesh: THREE.Group;
  frustumLines: THREE.LineSegments;
  visible: boolean;
}

export interface CameraFootprint {
  color: string;
  polygon: THREE.Vector3[];
}

export interface PlaySpaceBounds {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
  height: number; // suggested capture height
  centerX: number; centerZ: number;
  width: number; depth: number;
  polygons: THREE.Vector3[][]; // intersection footprint polygons
  cameraFootprints: CameraFootprint[]; // per-camera floor polygons
}

interface Extrinsics {
  cameras: cameras[],
  frames_used: number,
  mean_reprojection_error: number,
  success: boolean,
}

interface cameras {
    cam_id: number,
    extrinsics: {
      R: number[],
      cam_id: number,
      t: number[],
    },
    reprojection_error: number,
    success: boolean,
}

const GIZMO_SCALE = 0.2;

function createCameraGizmo(
  position: { x: number; y: number; z: number },
  rotation: number[],
  color: string,
  rotationDeg: number = 0,
): THREE.Group {
  const s = GIZMO_SCALE;

  const hw = s * 0.8;
  const hh = s * 0.45;

  const fd = s * 1.6;

  const apex: [number, number, number] = [0, 0, 0];

  const tl: [number, number, number] = [-hw, hh, fd];
  const tr: [number, number, number] = [hw, hh, fd];
  const br: [number, number, number] = [hw, -hh, fd];
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
    transparent: true,
    depthTest: true,
  });

  const lines = new THREE.LineSegments(lineGeo, lineMat);

  // Apply camera body rotation around the local Z axis (the viewing direction)
  const rotRad = ((rotationDeg+180) * Math.PI) / 180;
  lines.rotation.z = rotRad;

  const gap = s * 0.08;
  const triH = s * 0.3;
  const triW = s * 0.25;
  const triY = hh + gap;

  const triVerts = new Float32Array([
    -triW, triY, fd,
    triW, triY, fd,
    0, triY + triH, fd,
  ]);

  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.BufferAttribute(triVerts, 3));
  triGeo.setIndex([0, 1, 2]);

  const triMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: true,
  });

  const triMesh = new THREE.Mesh(triGeo, triMat);
  triMesh.rotation.z = rotRad;

  const group = new THREE.Group();
  group.add(lines);
  group.add(triMesh);

  group.position.set(position.x, position.y, position.z);

  const Rotation = new THREE.Matrix4()
  Rotation.set(
    rotation[0], rotation[1], rotation[2], 0,
    rotation[3], rotation[4], rotation[5], 0,    
    rotation[6], rotation[7], rotation[8], 0,
    0, 0, 0, 1,
  )

  group.setRotationFromMatrix(Rotation);
  
  return group;
}

// Segments layout (each = 2 verts × 3 floats = 6 floats):
//  0-3   : apex → 4 floor corners  (4 segs)
//  4-7   : near-plane rectangle    (4 segs)
//  8-11  : near corner → floor corner (4 segs)
//  12-15 : floor rectangle         (4 segs)
// Total: 16 segments = 96 floats
const FRUSTUM_SEG_COUNT = 16;

function createFrustumLines(cam: THREE.PerspectiveCamera, color: string): THREE.LineSegments {
  const lineMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.2,
    depthTest: true,
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FRUSTUM_SEG_COUNT * 6), 3));

  const lines = new THREE.LineSegments(geo, lineMat);
  lines.frustumCulled = false;
  return lines;
} 

export function useSceneCameras(selectedCount?: Ref<number>, showFrustums?: Ref<boolean>, showGizmos?: Ref<boolean>) {
  const sceneCameras = ref<SceneCameraEntry[]>([]);
  let attachedScene: THREE.Scene | null = null;
  let scenePoints: THREE.Points | null = null;

  const COLORS = ['#ff4466', '#44aaff', '#ffaa22', '#44dd88', '#cc44ff', '#00dddd'];

  /**
   * Convert an IRIS extrinsics entry (R row-major 3x3, t translation)
   * into a SceneCameraDef with world-space position and lookAt.
   *
   * IRIS convention: R and t define the world-to-camera transform.
   *   cam_point = R * world_point + t
   * So camera position in world space = -R^T * t
   * And the forward axis (look direction) = third row of R (Z column of R^T).
   */
  function extrinsicsToDef(entry: cameras, index: number, scale = 1): SceneCameraDef {
    // Support both field name variants
    const R: number[] = entry.extrinsics.R;
    const t: number[] = entry.extrinsics.t;

    const posX = t[0]* scale
    const posY = t[1]* scale
    const posZ = t[2]* scale

    // Forward direction = third row of R = [R[6], R[7], R[8]] (world Z axis of camera)

    return {
      name: `Camera ${entry.cam_id}`,
      position: { x: posX, y: posY, z: posZ }, //invert y and z since z is vertical axis in IRIS
      rotation: R,
      color: COLORS[index % COLORS.length],
    };
  }

  let isMockExtrinsics = false;

  function clearScenePoints() {
    if (!scenePoints) return;

    attachedScene?.remove(scenePoints);
    scenePoints.geometry.dispose();

    const material = scenePoints.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material.dispose();
    }

    scenePoints = null;
  }

  async function addToScene(scene: THREE.Scene) {
    attachedScene = scene;
    clearSceneCameras();
    clearScenePoints();

    let defs: SceneCameraDef[] = [];
    // Try loading live extrinsics via IPC; fall back to bundled mock
    try {
      const result = await window.ipc?.getExtrinsics();
      const extrinsics: Extrinsics = result;
      if (extrinsics?.cameras?.length) {
        const unit = ('m').replace(/[^a-z]/gi, '').toLowerCase();
        const scale = unit === 'mm' ? 0.001 : unit === 'cm' ? 0.01 : 1; // 4.5 instead of 1 for unscaled data
        defs = extrinsics.cameras
          .filter((c) => c.success !== false)
          .map((c, i: number) => extrinsicsToDef(c, i, scale));
        console.log(`[cameras] loaded ${defs.length} cameras from extrinsics (mock=${isMockExtrinsics}, unit=${unit}, scale=${scale})`);
      }
    } catch (err) {
      console.warn('[cameras] failed to load extrinsics, falling back to mock', err); 
    }

    function loadScenePoints(path: string) {
      const loader = new PLYLoader()
        loader.load(path, (geometry) => {
          geometry.computeVertexNormals()
          geometry.scale(1, 1, 1)

          const material = new THREE.PointsMaterial({
            size: 0.02,
            vertexColors: geometry.hasAttribute('color')
          })

          const points = new THREE.Points(geometry, material)
          scenePoints = points
          scene.add(points)
        })
    }
    const scenePath = await window.ipc?.getScene()
    if (scenePath) {
      loadScenePoints(scenePath)
    }

    for (const def of defs) {
      const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 100);
      cam.position.set(def.position.x, def.position.y, def.position.z);
      const swap = new THREE.Matrix4()
      swap.set(
        1, 0, 0, 0,
        0, -1, 0, 0, 
        0, 0, -1, 0, 
        0, 0, 0, 1,
      )
      const rotation = new THREE.Matrix4()
      rotation.set(
        def.rotation[0], def.rotation[1], def.rotation[2], 0,
        def.rotation[3], def.rotation[4], def.rotation[5], 0,
        def.rotation[6], def.rotation[7], def.rotation[8], 0,
        0, 0, 0, 1,
      )
      rotation.multiply(swap)

      cam.setRotationFromMatrix(rotation);
      cam.name = def.name;
      cam.updateProjectionMatrix();

      const gizmoMesh = createCameraGizmo(def.position, def.rotation, def.color);
      gizmoMesh.name = `${def.name}_gizmo`;
      gizmoMesh.visible = false;

      const frustumLines = createFrustumLines(cam, def.color);
      frustumLines.name = `${def.name}_frustum`;
      frustumLines.visible = false;

      scene.add(cam);
      scene.add(gizmoMesh);
      scene.add(frustumLines);

      const entry: SceneCameraEntry = {
        name: def.name,
        color: def.color,
        camera: cam,
        gizmoMesh,
        frustumLines,
        visible: false,
      };

      // updateFrustumLines(entry);
      sceneCameras.value.push(entry);
    }

    syncVisibility();
  }

  /** Show all cameras in mock mode; otherwise show only the first N matching selected physical cameras. */
  function syncVisibility(forceShowFrustums?: boolean, forceShowGizmos?: boolean) {
    const count = selectedCount?.value ?? 0;
    const showAll = true//isMockExtrinsics && count === 0;
    const frustumVis = forceShowFrustums !== undefined ? forceShowFrustums : (showFrustums?.value ?? true);
    const gizmoVis = forceShowGizmos !== undefined ? forceShowGizmos : (showGizmos?.value ?? true);

    for (let i = 0; i < sceneCameras.value.length; i++) {
      const show = showAll || i < count;
      const entry = sceneCameras.value[i];
      entry.gizmoMesh.visible = show && gizmoVis;
      entry.frustumLines.visible = show && frustumVis;
      entry.visible = show;
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
 

  /** Remove all scene camera objects and clear the list. */
  function clearSceneCameras() {
    for (const entry of sceneCameras.value) {
      attachedScene?.remove(entry.gizmoMesh);
      attachedScene?.remove(entry.camera);
      attachedScene?.remove(entry.frustumLines);
      entry.gizmoMesh.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        if ((child as THREE.Mesh).material) ((child as THREE.Mesh).material as THREE.Material).dispose();
      });
      entry.frustumLines.geometry.dispose();
      (entry.frustumLines.material as THREE.Material).dispose();
    }
    sceneCameras.value = [];
  }

  function clearSceneContent() {
    clearSceneCameras();
    clearScenePoints();
  }

  if (selectedCount) {
    let prevCount = 0;
    watch(selectedCount, async (count) => {
      if (prevCount === 0 && count > 0 && attachedScene) {
        // A real camera just connected — clear mock gizmos and reload from real extrinsics
        console.log('[cameras] real camera connected, clearing mock cameras and reloading extrinsics');
        clearSceneCameras();
        await addToScene(attachedScene);
      }
      prevCount = count;
      syncVisibility();
    });
  }

  if (showFrustums) {
    watch(showFrustums, () => syncVisibility());
  }

  if (showGizmos) {
    watch(showGizmos, () => syncVisibility());
  }

  function dispose() {
    clearSceneContent();
    attachedScene = null;
  }

  return {
    sceneCameras,
    addToScene,
    clearSceneContent,
    syncVisibility,
    setGizmoRotation, 
    dispose,
  } as const;
}
