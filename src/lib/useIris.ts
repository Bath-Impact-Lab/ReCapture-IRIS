import { onBeforeUnmount, onMounted, ref } from 'vue';

export interface IrisCameraExtrinsics {
  R: number[];
  t: number[];
}

export interface IrisExtrinsicsCamera {
  cam_id?: number;
  name?: string;
  success?: boolean;
  reprojection_error?: number;
  extrinsics?: IrisCameraExtrinsics | null;
}

export interface IrisExtrinsicsResponse {
  cameras?: IrisExtrinsicsCamera[];
  frames_used?: number;
  mean_reprojection_error?: number;
  success?: boolean;
}

export interface IrisCamera {
  id: number;
  name: string;
  success: boolean;
  reprojectionError: number | null;
  extrinsics: IrisCameraExtrinsics | null;
}

export interface UseIrisOptions {
  autoFetch?: boolean;
  pollInterval?: number;
  autoCheck?: boolean;
}

export interface IrisCliOutput {
  channel: string;
  cameraIndex?: number;
  line: string;
}

export interface IrisStartCameraOption {
  uri: string;
  width: number;
  height: number;
  fps: number;
  rotation: number;
}

export interface IrisStartOptions {
  kp_format: string;
  subjects: string | null;
  cameras: IrisStartCameraOption[];
  camera_width: number;
  camera_height: number;
  video_fps: number;
  rotation: number;
  output_dir: string;
  capture_only?: boolean;
  is_ingest?: boolean;
  recordingPath?: string;
  video_paths?: string[];
  stream?: boolean;
}

export interface IrisHardwareCamera {
  id: number;
  name: string;
}

const cameras = ref<IrisCamera[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const isStarting = ref(false);
const isStopping = ref(false);
const startError = ref<string | null>(null);
const stopError = ref<string | null>(null);
const runtimeFound = ref<boolean | null>(null);
const runtimePath = ref<string | null>(null);
const activeSessionIds = ref<string[]>([]);
const isRunning = ref(false);
const lastFrame = ref<IrisData[] | IrisData | null>(null);
const cliOutput = ref<IrisCliOutput[]>([]);
const wsUrl = ref<string | null>(null);

let ipcListenersRegistered = false;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isHardwareCameraEntry(value: unknown): value is IrisHardwareCamera {
  if (!value || typeof value !== 'object') return false;

  const camera = value as Partial<IrisHardwareCamera>;
  return isFiniteNumber(camera.id) && typeof camera.name === 'string';
}

function normalizeExtrinsics(value: unknown): IrisCameraExtrinsics | null {
  if (!value || typeof value !== 'object') return null;

  const extrinsics = value as Partial<IrisCameraExtrinsics>;
  const rotation = Array.isArray(extrinsics.R) ? extrinsics.R.filter(isFiniteNumber) : null;
  const translation = Array.isArray(extrinsics.t) ? extrinsics.t.filter(isFiniteNumber) : null;

  if (!rotation || !translation) return null;

  return {
    R: rotation,
    t: translation,
  };
}

function areNumberArraysEqual(left: number[] | null | undefined, right: number[] | null | undefined) {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function areExtrinsicsEqual(left: IrisCameraExtrinsics | null, right: IrisCameraExtrinsics | null) {
  if (left === right) return true;
  if (!left || !right) return left === right;

  return areNumberArraysEqual(left.R, right.R) && areNumberArraysEqual(left.t, right.t);
}

function areIrisCamerasEqual(left: IrisCamera[], right: IrisCamera[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftCamera = left[index];
    const rightCamera = right[index];

    if (
      leftCamera.id !== rightCamera.id
      || leftCamera.name !== rightCamera.name
      || leftCamera.success !== rightCamera.success
      || leftCamera.reprojectionError !== rightCamera.reprojectionError
      || !areExtrinsicsEqual(leftCamera.extrinsics, rightCamera.extrinsics)
    ) {
      return false;
    }
  }

  return true;
}

function setCameraList(nextCameras: IrisCamera[]) {
  if (!areIrisCamerasEqual(cameras.value, nextCameras)) {
    cameras.value = nextCameras;
  }

  return cameras.value;
}

export function extractIrisCameras(result: unknown): IrisCamera[] {
  if (!result || typeof result !== 'object') return [];

  const response = result as IrisExtrinsicsResponse;
  if (!Array.isArray(response.cameras)) return [];

  return response.cameras
    .map((camera, index) => {
      const id = isFiniteNumber(camera.cam_id) ? camera.cam_id : index;
      const name = typeof camera.name === 'string' && camera.name.trim().length > 0
        ? camera.name.trim()
        : `Camera ${id}`;

      return {
        id,
        name,
        success: camera.success !== false,
        reprojectionError: isFiniteNumber(camera.reprojection_error) ? camera.reprojection_error : null,
        extrinsics: normalizeExtrinsics(camera.extrinsics),
      };
    })
    .sort((left, right) => left.id - right.id);
}

function extractHardwareIrisCameras(result: unknown): IrisCamera[] {
  if (!result || typeof result !== 'object') return [];

  const response = result as {
    ok?: boolean;
    data?: IrisHardwareCamera[];
  };

  if (response.ok !== true || !Array.isArray(response.data)) return [];

  return response.data
    .filter(isHardwareCameraEntry)
    .map((camera) => ({
      id: camera.id,
      name: camera.name.trim() || `Camera ${camera.id}`,
      success: true,
      reprojectionError: null,
      extrinsics: null,
    }))
    .sort((left, right) => left.id - right.id);
}

function trimCliOutput(nextLine: IrisCliOutput) {
  const nextOutput = [...cliOutput.value, nextLine];
  cliOutput.value = nextOutput.slice(-200);
}
 

function ensureIpcListeners() {
  if (ipcListenersRegistered || !window.ipc) return;

  window.ipc.onIrisData((data) => {
    lastFrame.value = data;
  });

  window.ipc.onIrisCliOutput?.((payload) => {
    trimCliOutput(payload);
  });

  ipcListenersRegistered = true;
}

export function useIris(options: UseIrisOptions = {}) {
  const { autoFetch = true, pollInterval = 0, autoCheck = true } = options;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function refreshCameras() {
    const getHardwareCameras = window.ipc?.getHardwareCameras;
    const getExtrinsics = window.ipc?.getExtrinsics;

    if (!getHardwareCameras && !getExtrinsics) {
      setCameraList([]);
      error.value = null;
      return cameras.value;
    }

    isLoading.value = true;
    error.value = null;

    try {
      if (getHardwareCameras) {
        const hardwareResult = await getHardwareCameras();
        const hardwareCameras = extractHardwareIrisCameras(hardwareResult);

        if (hardwareCameras.length > 0 || hardwareResult?.ok === true) {
          setCameraList(hardwareCameras);
          return cameras.value;
        }
      }

      if (!getExtrinsics) {
        setCameraList([]);
        return cameras.value;
      }

      const extrinsicsResult = await getExtrinsics();
      setCameraList(extractIrisCameras(extrinsicsResult));
      return cameras.value;
    } catch (err) {
      setCameraList([]);
      error.value = err instanceof Error ? err.message : 'Failed to fetch hardware camera data from IRIS.';
      console.warn('[useIris]', error.value, err);
      return cameras.value;
    } finally {
      isLoading.value = false;
    }
  }

  async function checkRuntime() {
    const checkIrisCli = window.ipc?.checkIrisCli;
    if (!checkIrisCli) {
      runtimeFound.value = null;
      runtimePath.value = null;
      return null;
    }

    try {
      const result = await checkIrisCli();
      runtimeFound.value = result.found;
      runtimePath.value = result.path;
      return result;
    } catch (err) {
      runtimeFound.value = null;
      runtimePath.value = null;
      console.warn('[useIris] Failed to check IRIS runtime.', err);
      return null;
    }
  }

  async function start(options: IrisStartOptions) {
    ensureIpcListeners();

    if (!window.ipc?.startIRIS) {
      startError.value = 'IRIS IPC is unavailable.';
      return { ok: false, error: startError.value };
    }

    if (isRunning.value) {
      startError.value = 'IRIS is already running.';
      return { ok: false, error: startError.value };
    }

    isStarting.value = true;
    startError.value = null;
    stopError.value = null;
    lastFrame.value = null;
    cliOutput.value = [];
    wsUrl.value = null;

    const sessionIds: string[] = [];
    let mocked = false;

    try {
      const startResult = await window.ipc.startIRIS(options); 

      if (!startResult?.ok && !mocked) {
        startError.value = startResult?.error ?? 'Failed to start IRIS.';
        isRunning.value = false;
        return { ok: false, error: startError.value };
      }

      if (startResult?.sessionId) {
        sessionIds.push(String(startResult.sessionId));
      }

      if (options.stream && window.ipc.startIRISStream) {
        const streamResult = await window.ipc.startIRISStream(options); 

        if (!streamResult?.ok && !mocked) {
          startError.value = streamResult?.error ?? 'Failed to start IRIS streaming.';
          await Promise.all(sessionIds.map((sessionId) => window.ipc!.stopIRIS(sessionId)));
          activeSessionIds.value = [];
          isRunning.value = false;
          return { ok: false, error: startError.value };
        }

        if (streamResult?.sessionId) {
          sessionIds.push(String(streamResult.sessionId));
        }

        if (typeof streamResult?.wsUrl === 'string' && streamResult.wsUrl.length > 0) {
          wsUrl.value = streamResult.wsUrl;
        }
      }

      activeSessionIds.value = sessionIds;
      isRunning.value = true;
      await Promise.all([refreshCameras(), checkRuntime()]);
      return { ok: true, mocked, sessionIds: [...sessionIds] };
    } catch (err) {
      await Promise.all(sessionIds.map((sessionId) => window.ipc!.stopIRIS(sessionId)));
      activeSessionIds.value = [];
      isRunning.value = false;
      startError.value = err instanceof Error ? err.message : 'Failed to start IRIS.';
      wsUrl.value = null;
      console.warn('[useIris] Failed to start IRIS.', err);
      return { ok: false, error: startError.value };
    } finally {
      isStarting.value = false;
    }
  }

  async function stop() {
    stopError.value = null;

    if (!window.ipc?.stopIRIS) {
      stopError.value = 'IRIS IPC is unavailable.';
      return { ok: false, error: stopError.value };
    }

    isStopping.value = true;

    try {
      const sessionIds = [...activeSessionIds.value];

      if (sessionIds.length > 0) {
        await Promise.all(sessionIds.map((sessionId) => window.ipc!.stopIRIS(sessionId)));
      }

      activeSessionIds.value = [];
      isRunning.value = false;
      lastFrame.value = null;
      wsUrl.value = null;
      await refreshCameras();
      return { ok: true, sessionIds };
    } catch (err) {
      stopError.value = err instanceof Error ? err.message : 'Failed to stop IRIS.';
      console.warn('[useIris] Failed to stop IRIS.', err);
      return { ok: false, error: stopError.value };
    } finally {
      isStopping.value = false;
    }
  }

  function clearCliOutput() {
    cliOutput.value = [];
  }

  function clearFrame() {
    lastFrame.value = null;
  }

  function startPolling() {
    if (pollInterval <= 0 || pollTimer !== null) return;
    pollTimer = setInterval(() => {
      void refreshCameras();
    }, pollInterval);
  }

  function stopPolling() {
    if (pollTimer === null) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  onMounted(() => {
    ensureIpcListeners();
    if (autoFetch) {
      void refreshCameras();
    }
    if (autoCheck) {
      void checkRuntime();
    }
    startPolling();
  });

  onBeforeUnmount(() => {
    stopPolling();
  });

  return {
    cameras,
    isLoading,
    error,
    refresh: refreshCameras,
    refreshCameras,
    runtimeFound,
    runtimePath,
    checkRuntime,
    isRunning,
    isStarting,
    isStopping,
    startError,
    stopError,
    activeSessionIds,
    lastFrame,
    cliOutput,
    wsUrl,
    clearCliOutput,
    clearFrame,
    start,
    stop,
    startPolling,
    stopPolling,
  } as const;
}
