<template>
  <div>
    <nav class="navbar">
      <div class="brand">
        <div class="dot"></div>
        <div class="split" ref="splitRef">{{ appTitle }}</div>
      </div>
      <div class="menu">
        <!-- Camera selection dropdown -->
        <div class="dropdown" :class="{ open: openCamera }">
          <button
            class="btn"
            ref="cameraButtonRef"
            @click="toggleCamera"
            @keydown="onCameraButtonKeydown"
            aria-haspopup="listbox"
            :aria-expanded="openCamera"
            aria-controls="camera-listbox"
            :disabled="running"
          >
          <div v-if="!selectedDevices">
            Camera Selection
          </div>
          <div v-else>
            Add More Cameras
          </div>
          </button>
          <div
            class="dropdown-menu"
            id="camera-listbox"
            ref="cameraListRef"
            role="listbox"
            tabindex="0"
            :aria-activedescendant="activeCameraOptionId"
            @keydown="onCameraListKeydown"
          >
            <h4>Detected cameras</h4>
            <div v-if="devices.length === 0" class="device">
              <div>
                <div>No cameras found</div>
                <small>We use a safe mock for now.</small>
              </div>
            </div>
            <div
              v-for="(d, i) in devices"
              :key="d.deviceId"
              class="device"
              role="option"
              :id="'cam-opt-' + i"
              :aria-selected="i === cameraHoverIndex"
              :class="{ hovered: i === cameraHoverIndex, active: selectedDevices != null && selectedDeviceId?.includes(d.deviceId) }"
              @click="selectDevice(d, i)"
            >
              <div>
                <div>{{ d.label || 'Camera ' + d.deviceId.substring(0,6) }}</div>
                <small>{{ d.kind }}</small>
              </div>
            </div>
          </div>
        </div>

        <!-- Person count dropdown -->
        <div class="dropdown" :class="{ open: openPersonCount }" style="margin-left: 12px;">
          <button class="btn" @click="togglePersonCount" :disabled="running">
            {{ personCount || 'Person Count' }}
          </button>
          <div class="dropdown-menu">
            <h4>Subjects</h4>
            <div class="device" v-for="p in personCountOptions" :key="p" @click="selectPersonCount(p)">
              <div>
                <div>{{ p }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tracking type dropdown -->
        <div class="dropdown" :class="{ open: openTrack }" style="margin-left: 12px;">
          <button class="btn" @click="toggleTrack" :disabled="running">
            {{ trackingType || 'Tracking Type' }}
          </button>
          <div class="dropdown-menu">
            <h4>Tracking</h4>
            <div class="device" v-for="t in trackingOptions" :key="t" @click="selectTracking(t)">
              <div>
                <div>{{ t }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Output option dropdown -->
        <div class="dropdown" :class="{ open: openOutput }" style="margin-left: 12px;">
          <button class="btn" @click="toggleOutput" :disabled="running">
            {{ outputOption || 'Output' }}
          </button>
          <div class="dropdown-menu">
            <h4>Output</h4>
            <div class="device" v-for="o in outputOptions" :key="o" @click="selectOutput(o)">
              <div>
                <div>{{ o }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right side: sign-in area -->
      <div class="nav-right">
        <div class="menu-right">
          <button class="btn btn-icon" @click="toggleSignIn" aria-label="Settings" :disabled="running">
            <img src="/assets/settings.svg" alt="">
          </button>
        </div>
      </div>
    </nav>

    <div class="sidenav">
      <div class="brand">
        Camera Config:
      </div>
      <div style="width: 100%;" v-for="(d, i) in selectedDevices">
        <div
          class="camera-list"
          :style="{
            width: '100%',
            boxShadow: sceneCameras[i] ? `inset 4px 0 0 ${sceneCameras[i].color}` : 'none',
            paddingLeft: sceneCameras[i] ? '8px' : '0',
          }"
        >
          <div class="camera-text">
            {{ d.label }}
            <button class="button btn" style="padding: 3px 5px;" v-on:click="rotateCamera(d, i)" :disabled="running">
              <img style="width: 30px;" src="/assets/anticlockwise-2-line.svg" alt="">
            </button>
          </div>
          <div :id="`camera-box${i}`">
            <video 
              style="width: 100%;"
              :id="`cameraFeed${i}`" 
              autoplay
              playsinline
            >
            </video>
          </div>
        </div>
      </div>

      <div class="iris-controls" v-if="selectedDevices">
        <button v-on:click="startIris" class="button btn" :disabled="running">
          Start IRIS
        </button>
        <button v-on:click="stopIris" class="button btn" :disabled="!running">
          Stop IRIS
        </button>
      </div>
    </div>

    <section class="scene" ref="sceneRef"></section>
    <div class="hud">
      <label class="hud-item">
        <input type="checkbox" v-model="showModel" />
        <span>Show model</span>
      </label>
      <div class="hud-sep"></div>
      <div class="hud-item">
        <span :class="['dot', running ? 'ok' : 'warn']"></span>
        <span>{{ running ? 'IRIS running' : 'IRIS inavtive' }}</span>
      </div>
      <div class="hud-sep" v-if="isDev"></div>
      <button class="btn btn-mini" v-if="isDev" @click="debugOpen = !debugOpen">{{ debugOpen ? 'Hide' : 'Show' }} debug</button>
    </div>

    <!-- License Badge -->
    <div
      class="license-badge-container"
      :class="{ 'clickable': !isValidLicense || planType === 'Trial' }"
      @click="(!isValidLicense || planType === 'Trial') ? showSettings = true : null"
    >
      <div v-if="isValidLicense" class="badge glass">
        <span class="badge-dot" :class="planType?.toLowerCase()"></span>
        <span class="badge-text">{{ planType || 'Trial' }} License</span>
      </div>
      <div v-else class="badge-upgrade glass">
        <span class="badge-dot invalid"></span>
        <span class="badge-text">FREE Trial</span>
        <div class="upgrade-action">
          Upgrade
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </div>
    </div>
    <!-- Settings Modal -->
    <Transition name="fade">
      <div v-if="showSettings" class="modal-overlay" @click.self="showSettings = false">
        <div class="modal-content fade-up">
          <button class="modal-close" @click="showSettings = false">×</button>
          
          <div class="modal-header">
            <h2 class="modal-title">Settings</h2>
            <p class="modal-subtitle">Manage your license key</p>
          </div>

          <div class="settings-section">
            <div class="settings-group">
              <label>License Management</label>
              <div class="license-input-wrapper">
                <input 
                  v-model="licenseKeyInput" 
                  type="text" 
                  placeholder="Enter License Key"
                  class="license-input"
                  :disabled="isChecking"
                  @keyup.enter="handleLicenseSubmit"
                />
                <button 
                  class="btn-activate" 
                  @click="handleLicenseSubmit"
                  :disabled="isChecking || !licenseKeyInput"
                >
                  <span v-if="isChecking">Checking...</span>
                  <span v-else>{{ isValidLicense ? 'Update' : 'Activate' }}</span>
                </button>
              </div>
              <Transition name="fade">
                <div v-if="licenseError" class="license-msg error">{{ licenseError }}</div>
                <div v-else-if="isValidLicense" class="license-msg success">License active and valid</div>
              </Transition>
            </div>
            
            <div v-if="isValidLicense" class="settings-actions">
              <button class="btn-deactivate" @click="licenseLogout">Deactivate License</button>
            </div>

            <!-- Upgrade Section -->
            <div v-if="!isPaidLicense" class="settings-footer">
              <div class="divider"><span>Support Us</span></div>
              <button class="btn-buy" @click="buyLicense">
                Get a License
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
  
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick, computed } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useCameras } from './composables/useCameras';
import { useSceneCameras } from './composables/useSceneCameras';
import { useLicense } from './composables/useLicense';
import { FBXLoader } from 'three/examples/jsm/Addons.js';

const appTitle = import.meta.env.VITE_APP_TITLE as string || 'Example App';
const isDev = import.meta.env.DEV;

const sceneRef = ref<HTMLElement | null>(null);
const splitRef = ref<HTMLElement | null>(null);
// Individual dropdown open flags
const openCamera = ref(false);
const openPersonCount = ref(false);
const openTrack = ref(false);
const openOutput = ref(false);
// Camera menu focus + ARIA state
const cameraButtonRef = ref<HTMLButtonElement | null>(null);
const cameraListRef = ref<HTMLElement | null>(null);
const cameraActiveIndex = ref(0);
// Sign-in state
const showSettings = ref(false);
const licenseKeyInput = ref('');
const { 
  licenseKey: storedLicenseKey,
  isValid: isValidLicense, 
  isChecking, 
  error: licenseError, 
  planType,
  validateLicense, 
  logout: licenseLogout 
} = useLicense();

const isPaidLicense = computed(() => {
  if (!isValidLicense.value) return false;
  const plan = planType.value?.toLowerCase();
  return plan === 'creator' || plan === 'studio';
});

// Sync local input with stored key on mount
watch(storedLicenseKey, (newKey) => {
  licenseKeyInput.value = newKey;
}, { immediate: true });
const cameraHoverIndex = ref(0);

const cameraRotation = ref<Record<string, number>>({});

const {
  devices,
  selectedDeviceId,
  selectedDevices,
  enumerateCameras,
  selectDevice: selectCamera,
  init: initCameras,
  dispose: disposeCameras,
} = useCameras({
  autoReselect: true,
  onSend: (msg) => { try { lastSentMsg.value = JSON.stringify(msg, null, 2); } catch {} },
});

// Construct scene camera
const selectedCameraCount = computed(() => selectedDevices.value?.length ?? 0);
const { sceneCameras, addToScene: addSceneCameras, setGizmoRotation, dispose: disposeSceneCameras } = useSceneCameras(selectedCameraCount);

const activeCameraOptionId = computed(() => (devices.value.length > 0 ? `cam-opt-${cameraHoverIndex.value}` : undefined));

// Tracking options
const trackingOptions = ['Full body', 'Hand', 'Face'];
const trackingType = ref<string | null>('Full body');

// Person count options
const personCountOptions = ['Single Person', 'Multi-Person'];
const personCount = ref<string | null>('Single Person');

// Output options
const outputOptions = ['SteamVR', 'Unity', 'Unreal', 'Gadot'];
const outputOption = ref<string | null>(null);

const debugOpen = ref(false);
const lastSentMsg = ref('');

const running = ref(false)

// Skeleton always visible by default

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let frameId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let controls: OrbitControls | null = null;
let jointSpheres: THREE.Mesh[] = [];
let boneLines: THREE.LineSegments | null = null;
let modelsRoot: THREE.Object3D[] | null = null;

let spheresMesh: THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshBasicMaterial, THREE.InstancedMeshEventMap> | null = null;
let skeletonLine: THREE.LineSegments<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.LineBasicMaterial, THREE.Object3DEventMap> | null  = null;
const position = new THREE.Object3D()

const halpe26_pairs = [
  [0,1], [0,2], [1,3], [2,4],
  [17,18], [18,5], [18,6],
  [5,7], [7,9],
  [6,8], [8,10],
  [5,6],
  [11,12],
  [11,13], [13,15],
  [12,14], [14,16],
  [18,19], [19,11], [19,12],
  [15,20], [15,22], [15,24],
  [16,21], [16,23], [16,25]
]

const linePositions = new Float32Array(halpe26_pairs.length * 3 * 2)

let irisData: IrisData[] | IrisData | null;

const manager = new THREE.LoadingManager();
let mixer: THREE.AnimationMixer[] | null;
const showModel = ref(false); // off by default

function onCameraButtonKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!openCamera.value) {
      openCamera.value = true; openTrack.value = false; openOutput.value = false;
      setInitialCameraActiveIndex(e.key === 'ArrowDown' ? 'first' : 'last');
      e.preventDefault();
      focusCameraListSoon();
    }
  } else if (e.key === 'Enter' || e.key === ' ') {
    openCamera.value = !openCamera.value;
    if (openCamera.value) { setInitialCameraActiveIndex('current-or-first'); focusCameraListSoon(); }
    e.preventDefault();
  } else if (e.key === 'Escape') {
    openCamera.value = false; e.preventDefault();
  }
}

function onCameraListKeydown(e: KeyboardEvent) {
  if (devices.value.length === 0) {
    if (e.key === 'Escape') { openCamera.value = false; cameraButtonRef.value?.focus(); e.preventDefault(); }
    return;
  }
  const max = devices.value.length - 1;
  if (e.key === 'ArrowDown') { cameraActiveIndex.value = Math.min(max, cameraActiveIndex.value + 1); e.preventDefault(); scrollActiveIntoView(); }
  else if (e.key === 'ArrowUp') { cameraActiveIndex.value = Math.max(0, cameraActiveIndex.value - 1); e.preventDefault(); scrollActiveIntoView(); }
  else if (e.key === 'Home') { cameraActiveIndex.value = 0; e.preventDefault(); scrollActiveIntoView(); }
  else if (e.key === 'End') { cameraActiveIndex.value = max; e.preventDefault(); scrollActiveIntoView(); }
  else if (e.key === 'Enter') { const d = devices.value[cameraActiveIndex.value]; if (d) selectDevice(d, cameraActiveIndex.value); e.preventDefault(); }
  else if (e.key === 'Escape') { openCamera.value = false; cameraButtonRef.value?.focus(); e.preventDefault(); }
}

function setInitialCameraActiveIndex(mode: 'first' | 'last' | 'current-or-first'){
  if (devices.value.length === 0) { cameraActiveIndex.value = 0; return; }
  if (mode === 'last') cameraActiveIndex.value = devices.value.length - 1;
  else if (mode === 'current-or-first') {
    const idx = selectedDeviceId.value ? devices.value.findIndex(d => (selectedDeviceId.value ? selectedDeviceId.value : []).includes(d.deviceId)) : -1;
    cameraActiveIndex.value = idx >= 0 ? idx : 0;
  } else cameraActiveIndex.value = 0;
}

function focusCameraListSoon(){ nextTick(() => cameraListRef.value?.focus()); }

function scrollActiveIntoView(){
  nextTick(() => {
    const el = document.getElementById(`cam-opt-${cameraActiveIndex.value}`);
    el?.scrollIntoView({ block: 'nearest' });
  });
}

function toggleCamera() {
  const willOpen = !openCamera.value;
  openCamera.value = willOpen;
  // close others
  if (willOpen) { openPersonCount.value = false; openTrack.value = false; openOutput.value = false; enumerateCameras(); }
}
function togglePersonCount() {
  const willOpen = !openPersonCount.value;
  openPersonCount.value = willOpen;
  if (willOpen) { openCamera.value = false; openTrack.value = false; openOutput.value = false; }
}
function toggleTrack() {
  const willOpen = !openTrack.value;
  openTrack.value = willOpen;
  if (willOpen) { openCamera.value = false; openPersonCount.value = false; openOutput.value = false; }
}
function toggleOutput() {
  const willOpen = !openOutput.value;
  openOutput.value = willOpen;
  if (willOpen) { openCamera.value = false; openPersonCount.value = false; openTrack.value = false; }
}
function onClickOutside(e: MouseEvent) {
  // close any open dropdown if click outside
  if (!openCamera.value && !openPersonCount.value && !openTrack.value && !openOutput.value) return;
  const dd = (e.target as HTMLElement)?.closest('.dropdown');
  if (!dd) { openCamera.value = false; openPersonCount.value = false; openTrack.value = false; openOutput.value = false; }
}



function selectDevice(d: MediaDeviceInfo, i: number){
  selectCamera(d);

  const isSelected = selectedDevices.value?.some(sd => sd.deviceId === d.deviceId);

  if (isSelected) {
    startCameraStream(d, i);
    // Initialize rotation angle for this device if not already set
    if (cameraRotation.value[d.deviceId] === undefined) {
      cameraRotation.value[d.deviceId] = 0;
    }
  } else {
    stopCameraStream(i);
  }
  
  // Send camera info to IRIS mock bridge (including rotation)
  const info = {
    type: 'camera-info',
    payload: {
      deviceId: d.deviceId,
      label: d.label,
      kind: d.kind,
      ts: Date.now(),
      rotation: cameraRotation.value[d.deviceId] || 0
    }
  };
  console.log('[IRIS send] camera-info', info);
  lastSentMsg.value = JSON.stringify(info, null, 2);
  (window as any).electronAPI?.irisSend?.(info);

  refresh();
  if (isSelected) {
    startCameraStream(d, i);
    // Initialize rotation angle for this device if not already set
    if (cameraRotation.value[d.deviceId] === undefined) {
      cameraRotation.value[d.deviceId] = 0;
    }
  } else {
    stopCameraStream(i);
  }
  refresh();
}

async function startCameraStream(camera: MediaDeviceInfo, index: number) {
  const stream = await navigator.mediaDevices.getUserMedia({video: {deviceId: {exact: camera.deviceId}, frameRate: 30}});

  const video = document.getElementById(`cameraFeed${index}`) as HTMLVideoElement;
  try {
    if (video) {
      video.srcObject = stream;
      // console.log("playing", selectedDevices.value);
    } 
  } catch (err) {
    console.error("Camera access failed: ", err);
  }
}

function stopCameraStream(index: number) {
  const video = document.getElementById(`cameraFeed${index}`) as HTMLVideoElement;
  const stream = video.srcObject as MediaStream;
  const tracks = stream.getTracks();

  tracks.forEach(track => {
    track.stop();
  });
  video.srcObject = null;
}

function refresh() {
  selectedDevices.value?.forEach((d, i) => {
    startCameraStream(d, i)
  })
}

function rotateCamera(d: MediaDeviceInfo, index: number) {
  const currentAngle = cameraRotation.value[d.deviceId] || 0;
  const newAngle = (currentAngle + 90) % 360;
  cameraRotation.value[d.deviceId] = newAngle;

  // Notify IRIS backend about the rotation change
  const info = {
    type: 'camera-info',
    payload: {
      deviceId: d.deviceId,
      label: d.label,
      kind: d.kind,
      ts: Date.now(),
      rotation: newAngle
    }
  };
  console.log('[IRIS send] camera-info (rotate)', info);
  lastSentMsg.value = JSON.stringify(info, null, 2);
  (window as any).electronAPI?.irisSend?.(info);

  // Update the 3D scene camera gizmo rotation
  setGizmoRotation(index, newAngle);

  rotation(d, newAngle, index);
  cameraRotation.value[d.deviceId] = newAngle;
  rotation(d, newAngle, index);
}

async function rotation(d: MediaDeviceInfo, rotateAngle: number, i: number) {
  let isOdd: boolean
  let offsetX: number
  let offsetY: number = 0
  let origin: string
  
  const camera = await navigator.mediaDevices.getUserMedia({video: {deviceId: {exact: d.deviceId}}})
  let aspectRatio = camera.getVideoTracks()[0].getSettings().aspectRatio
  if (!aspectRatio) {
    aspectRatio = 1.777778
  }

  if (rotateAngle % 180 === 0) {
    isOdd = false
  }
  else {
    aspectRatio = 1/aspectRatio
    isOdd = true
  }

  const parent = document.getElementById(`camera-box${i}`) as HTMLDivElement
  parent.style.width = "100%"

  parent.style.aspectRatio = `${aspectRatio}`
  const video = document.getElementById(`cameraFeed${i}`) as HTMLVideoElement
  await new Promise(resolve => setTimeout(resolve, 50))
  if (isOdd) {
    const temp = parent.offsetWidth / aspectRatio
    parent.style.height = temp + "px"
    video.style.width = temp + "px"
    video.style.maxWidth = temp + "px"
    video.style.height = parent.offsetWidth + "px"
    video.style.maxHeight = parent.offsetWidth + "px"

    offsetX = video.offsetHeight
    origin = "top left"
    if (rotateAngle == 270) {
      offsetY = video.offsetWidth;
      offsetX = 0;
    }
  }
  else {
    video.style.width = parent.offsetWidth + "px"
    video.style.height = "auto"
    video.style.maxWidth = "100%"
    parent.style.height = "auto"

    offsetX = 0
    origin = "center"
  }
  video.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${rotateAngle}deg)`
  video.style.transformOrigin = origin
}

async function loadModel(scene: THREE.Scene, type: string) {
  const loader = new FBXLoader( manager );
  const file = `assets/${type}`

  try {
    loader.load(file, function (group) {
      if (modelsRoot) {
        modelsRoot.push(group)
      }
      else {
        modelsRoot = [group]
      }
      const modelRoot = modelsRoot[modelsRoot.length-1]
      modelRoot.castShadow = true
      modelRoot.receiveShadow = true
      modelRoot.scale.set(0.01, 0.01, 0.01)
      if (type === "Idle.fbx") {
        modelRoot.position.set(-1.5, 0, -1.5)
        modelRoot.setRotationFromAxisAngle(new THREE.Vector3(0, 1, 0), 45*(Math.PI/180))
      }
      if (modelRoot.animations && modelRoot.animations.length) {
        if (mixer){
          mixer.push(new THREE.AnimationMixer(modelRoot))
        }
        else{
          mixer = [new THREE.AnimationMixer(modelRoot)]
        }
        const mix = mixer[mixer.length-1] 
        const action = mix.clipAction(modelRoot.animations[0])
        action.play()
      }
      else {
        mixer = null
      }
      scene.add(modelRoot)

    })
  }
  catch (err) {
    console.log("error loading file")
    console.log(err)
  }
}

function initThree(container: HTMLElement){
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.setClearColor('#0b0f14');
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, width/height, 0.01, 1000);
  camera.position.set(5, 5, 5);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(2, 3, 2); dir.castShadow = true; scene.add(dir);

  const grid = new THREE.GridHelper(10, 20, 0x2a3340, 0x1b2430); scene.add(grid);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 0.1;
  controls.maxDistance = 100;

  loadModel(scene, "Flair.fbx")
  loadModel(scene, "Idle.fbx")
  if (modelsRoot) {
    modelsRoot.forEach((model) => model.visible = true) 
  }

  // Add scene cameras from JSON config
  addSceneCameras(scene);

  const clock = new THREE.Clock();

  //if using a positions json
  const fps = 30
  const frameDuration = 1000/fps

  let lastTime = 0
  let currentFrame = 0
  const animate = (time: number) => {
    requestAnimationFrame(animate)
    const delta = clock.getDelta()
    if (mixer) mixer.forEach((mix) => mix.update(delta))

    if (irisData) {
      //used for data from position json file
      if (time - lastTime >= frameDuration && Array.isArray(irisData)) {
        renderIRISdata(irisData[currentFrame])

        currentFrame = (currentFrame + 1) % irisData.length
        lastTime = time
      }
      //used for live data
      else if (!Array.isArray(irisData)) {
        renderIRISdata(irisData)
      }
    }
    controls?.update()
    renderer?.render(scene, camera)
  };
  animate(lastTime)

  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries){
      const w = entry.contentRect.width; const h = entry.contentRect.height;
      renderer!.setSize(w, h);
      camera.aspect = w/h; camera.updateProjectionMatrix();
    }
  });
  resizeObserver.observe(container);
}


onMounted(() => {
  document.addEventListener('click', onClickOutside);
  // Dev-only keyboard toggle for debug overlay
  if (isDev) {
    window.addEventListener('keydown', onKeyDown);
  }
  // Trigger split animation
  requestAnimationFrame(() => { splitRef.value?.classList.add('ready'); });

  if (sceneRef.value) initThree(sceneRef.value);
  initCameras();
  watch(openCamera, (isOpen) => {
    if (isOpen) { setInitialCameraActiveIndex('current-or-first'); focusCameraListSoon(); }
    else if (document.activeElement === cameraListRef.value) { cameraButtonRef.value?.focus(); }
  });

  window.ipc?.onIrisData((data) => {
    irisData = data
  })
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside);
  if (isDev) {
    window.removeEventListener('keydown', onKeyDown);
  }
  disposeCameras();
  disposeSceneCameras();
  if (frameId) cancelAnimationFrame(frameId);
  if (resizeObserver && sceneRef.value) resizeObserver.unobserve(sceneRef.value);
  if (renderer) { renderer.dispose(); renderer = null; }
});

function onKeyDown(e: KeyboardEvent) {
  if (!isDev) return;
  if (e.key === 'F2') {
    debugOpen.value = !debugOpen.value;
  }
}

function selectTracking(t: string) {
  trackingType.value = t;
  openTrack.value = false;
}

function selectPersonCount(p: string) {
  personCount.value = p;
  openPersonCount.value = false;
}

function selectOutput(o: string) {
  outputOption.value = o;
  openOutput.value = false;
}

function toggleSignIn() {
  showSettings.value = !showSettings.value;
}

async function handleLicenseSubmit() {
  await validateLicense(licenseKeyInput.value);
}

async function buyLicense() {
  const url = import.meta.env.VITE_LICENSE_URL || 'https://embodi.ecolizard.com/#pricing';
  console.log('Buy License clicked - opening:', url);
  
  if (!(window as any).electronAPI?.openExternal) {
    console.error('CRITICAL: electronAPI.openExternal is missing! Please restart the application.');
    return;
  }

  try {
    const result = await (window as any).electronAPI.openExternal(url);
    console.log('Open External Result:', result);
    if (result && !result.ok) {
      console.error('System failed to open URL:', result.error);
    }
  } catch (err) {
    console.error('IPC invocation failed:', err);
  }
}

async function startIris() {
  spheresMesh = null
  skeletonLine = null
  //Sends the camera information to IRIS
  if (selectedDevices.value) {
    const cameras = Array.from(selectedDevices.value, (d, i) => ({
      uri: String(i),
      width: 1920,
      height: 1080,
      fps: 100,
      rotation: cameraRotation.value[d.deviceId] ? cameraRotation.value[d.deviceId] : 0
    }))
    const options = {
      kp_format: "halpe26",
      subjects: personCount.value,
      cameras: cameras,
      camera_width: 1920,
      camera_height: 1080,
      video_fps: 100,
      output_dir: "",
      stream: true,
    }

    selectedDevices.value?.forEach((_, i) => {
      stopCameraStream(i)
    });
    await new Promise( resolve => setTimeout(resolve, 1000))

    running.value = true
    // iris start command goes here:
    await window.ipc?.startIRIS(options)
  }
}

async function stopIris() {
  running.value = false

  //stop iris command to ipc here
  const Id = "example"
  await window.ipc?.stopIRIS(Id)

  selectedDevices.value?.forEach((d, i) => {
    startCameraStream(d, i)
  })

  if (spheresMesh) scene.remove(spheresMesh)
  spheresMesh = null
  if (skeletonLine) scene.remove(skeletonLine)
  skeletonLine = null
  irisData = null
}

function renderIRISdata(poseInfo: IrisData) {
  try {
    poseInfo.entities.forEach((person, i) => {
      const neck = person.analysis.centers.neck
      const pelvis = person.analysis.centers.pelvis
      const spine_mid = person.analysis.centers.spine_mid
      const keypoints = [[neck.x, neck.y, neck.z], [pelvis.x, pelvis.y, pelvis.z], [spine_mid.x, spine_mid.y, spine_mid.z]]
      if (!(spheresMesh && skeletonLine)) {
        const sphereGeometry = new THREE.SphereGeometry(0.025, 8, 8)
        const material = new THREE.MeshBasicMaterial({color: 0xffffff})
        spheresMesh = new THREE.InstancedMesh(sphereGeometry, material, (keypoints.length + person.skeleton.keypoints_3d.length))
        scene.add(spheresMesh)

        const lMaterial = new THREE.LineBasicMaterial({color:0xff0000})
        const lGeometry = new THREE.BufferGeometry()
        lGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))

        skeletonLine = new THREE.LineSegments(lGeometry, lMaterial)
        scene.add(skeletonLine)
      }
      const positionAttr = skeletonLine.geometry.attributes.position
      let idx = 0

      keypoints.forEach((points, i) => {
        position.position.set(points[0], points[2], points[1])
        position.updateMatrix()
        spheresMesh?.setMatrixAt(i, position.matrix)
      })
      person.skeleton.keypoints_3d.forEach((points, i) => {
        position.position.set(points.x, points.z, points.y)
        position.updateMatrix()
        spheresMesh?.setMatrixAt(i+3, position.matrix)
      })

      halpe26_pairs.forEach(([a, b]) => {
        const pos1 = person.skeleton.keypoints_3d[a]
        const pos2 = person.skeleton.keypoints_3d[b]

        positionAttr.array[idx++] = pos1.x
        positionAttr.array[idx++] = pos1.z
        positionAttr.array[idx++] = pos1.y

        positionAttr.array[idx++] = pos2.x
        positionAttr.array[idx++] = pos2.z
        positionAttr.array[idx++] = pos2.y
      })

      positionAttr.needsUpdate = true
      spheresMesh.instanceMatrix.needsUpdate = true
    })
  }
  catch{
    console.log("unable to pass the IRIS data")
  }
}

</script>

<style scoped>
.hud{ position: fixed; left: 16px; bottom: 16px; display:flex; gap:8px; padding:8px 10px; background: rgba(12,18,25,.6); border:1px solid rgba(255,255,255,.08); border-radius: 12px; backdrop-filter: blur(10px); }
.hud-item{ display:flex; align-items:center; gap:8px; color:#e6edf3; font-weight:600; }
.hud-item input{ accent-color:#6be675; width:16px; height:16px; }
.hud-sep{ width:1px; background:rgba(255,255,255,.1); margin:0 6px; }
.dot{ width:8px; height:8px; border-radius:50%; display:inline-block; box-shadow:0 0 10px rgba(0,0,0,.5) }
.dot.ok{ background:#6be675 }
.dot.warn{ background:#ff9a5c }
.btn.btn-mini{ padding:6px 10px; font-size:.8rem; border-radius:8px; border:1px solid rgba(255,255,255,.08); background:rgba(26,35,48,.8); color:#e6edf3; cursor:pointer }
.debug{ position: fixed; left: 16px; bottom: 70px; width: 540px; max-width: calc(100vw - 32px); background: rgba(12,18,25,.85); border:1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 10px; backdrop-filter: blur(10px); box-shadow:0 10px 28px rgba(0,0,0,.35) }
.debug-row{ display:flex; gap:10px; align-items:center; margin-bottom:8px }
.debug-col{ flex:1; min-width:0 }
.debug-title{ color:#9fb1c1; font-weight:700; font-size:.8rem; margin-bottom:4px }
.debug-pre{ margin:0; max-height:140px; overflow:auto; background:#0e141b; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,.06); color:#cfe2f3; font-size:.78rem }

/* Navbar layout: brand left, menu centered, right side for sign-in */
.navbar{
  position: relative; /* enable absolute-centering of the menu */
  display:flex;
  align-items:center;
  justify-content: space-between; /* keep brand left and right area placed */
  gap:12px;
  padding:12px 18px;
}
.brand{ display:flex; align-items:center; gap:10px; color:#e6edf3; font-weight:700; z-index:2; }
.menu{
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 50%;
  transform-origin: center;
  transform: translate(-50%, -50%); /* center vertically and horizontally inside navbar */
  display:flex;
  align-items:center;
  gap:12px;
  z-index:1;
}
.nav-right{ display:flex; align-items:center; gap:12px; z-index:2; }
.btn-icon{
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 9px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(26,35,48,0.9);
  color: #e6edf3;
  cursor: pointer;
  transition: background 0.2s ease;
}
.btn-icon:hover{
  background: rgba(40,50,65,0.9);
}
.btn-icon svg{
  display: block;
}
/* Accessibility focus styles */
.btn:focus-visible, .btn.btn-mini:focus-visible {
  outline: 2px solid #6be675;
  outline-offset: 2px;
}
.dropdown-menu:focus { outline: none; }
.device.active { background: rgba(107, 230, 117, 0.12); border-radius: 8px; }
.device.active > div > div { color: #e6ffe9; }
/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: rgba(22, 30, 41, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  width: 100%;
  max-width: 480px;
  padding: 32px;
  position: relative;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.modal-close {
  position: absolute;
  top: 20px;
  right: 20px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 24px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.modal-close:hover { color: #fff; }

.modal-header { margin-bottom: 32px; text-align: center; }
.modal-title { font-size: 24px; margin-bottom: 8px; color: #fff; }
.modal-subtitle { color: rgba(255, 255, 255, 0.5); font-size: 14px; }

.settings-section { display: flex; flex-direction: column; gap: 24px; }
.settings-group { display: flex; flex-direction: column; gap: 12px; }
.settings-group label { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.7); }

.license-input-wrapper { display: flex; gap: 12px; }

.license-input {
  flex: 1;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 12px 16px;
  color: #fff;
  font-family: monospace;
  font-size: 16px;
}

.license-input:focus { border-color: #6be675; outline: none; }

.btn-activate {
  background: #6be675;
  color: #0b0f14;
  border: none;
  border-radius: 10px;
  padding: 0 20px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-activate:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-deactivate {
  background: transparent;
  border: 1px solid rgba(255, 59, 48, 0.3);
  color: #ff3b30;
  border-radius: 10px;
  padding: 10px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-deactivate:hover { background: rgba(255, 59, 48, 0.1); border-color: #ff3b30; }

.license-msg { font-size: 13px; margin-top: 4px; }
.license-msg.error { color: #ff9a5c; }
.license-msg.success { color: #6be675; }

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.fade-up { animation: fadeUp 0.4s ease-out; }
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* License Badge Styles */
.license-badge-container {
  position: fixed;
  left: 16px;
  bottom: 75px;
  z-index: 900;
  transition: transform 0.2s ease;
}

.license-badge-container.clickable {
  cursor: pointer;
}

.license-badge-container.clickable:hover {
  transform: translateY(-2px);
}

.badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #e6edf3;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.badge.glass {
  background: rgba(12, 18, 25, 0.6);
  backdrop-filter: blur(10px);
}

.badge.error {
  border-color: rgba(255, 59, 48, 0.3);
}

.badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6be675; /* Default to Premium green */
  box-shadow: 0 0 8px rgba(107, 230, 117, 0.4);
}

.badge-dot.trial {
  background: #ff9a5c;
  box-shadow: 0 0 8px rgba(255, 154, 92, 0.4);
}

.badge-dot.invalid {
  background: #ff3b30;
  box-shadow: 0 0 8px rgba(255, 59, 48, 0.4);
}

.badge-text {
  letter-spacing: 0.5px;
}

.badge-upgrade {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 14px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 600;
  color: #e6edf3;
  background-color: var(--bg);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.upgrade-action {
  background: linear-gradient(135deg, #6be675, #4ecb58);
  color: #0b0f14;
  padding: 6px 12px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 800;
  letter-spacing: 0.8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(107, 230, 117, 0.2);
}

.license-badge-container.clickable:hover .upgrade-action {
  transform: translateX(2px);
  filter: brightness(1.1);
  box-shadow: 0 4px 15px rgba(107, 230, 117, 0.4);
}

.settings-footer {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  color: rgba(255, 255, 255, 0.2);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.divider::before, .divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.divider:not(:empty)::before { margin-right: 12px; }
.divider:not(:empty)::after { margin-left: 12px; }

.btn-buy {
  background: rgba(107, 230, 117, 0.1);
  border: 1px solid rgba(107, 230, 117, 0.2);
  color: #6be675;
  border-radius: 12px;
  padding: 14px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.2s ease;
}

.btn-buy:hover {
  background: rgba(107, 230, 117, 0.15);
  border-color: #6be675;
  transform: translateY(-1px);
}

.sidenav {
  position: absolute; 
  right: 0px; 
  height: calc(100% - 63px); 
  width: 250px; 
  background-color: var(--sidebar);
  z-index: 10;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
}

.camera-list {
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  margin: 5px 0;
} 

.camera-text {
  display: flex;
  flex-direction: row;
  font-size: 14px;
  align-items: center;
  padding-bottom: 5px;
  justify-content: space-between;
}

.button {
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: var(--sidebar);
  border-radius: 10px;
}

.button:hover {
  background: rgba(18, 27, 36, 0.72);
}

.button:active {
  background: rgba(12, 18, 25, 0.808);
}

.iris-controls {
  padding: 10px 5px;
  background-color: var(--sidebar);
  position: absolute;
  bottom: 0px;
  width: 100%;
  height: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 100;
}

.iris-controls button {
  margin: 10px 0;
}

</style>
