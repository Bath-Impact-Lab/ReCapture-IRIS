<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted, watch, watchEffect } from 'vue';
import { useProject, type ProjectParticipant, type ProjectSession } from '@/lib/useProject';
import { useProjectPresets, type ProjectPreset, type ProjectPresetStore } from '@/lib/useProjectPresets';
import { useIris, type IrisStartOptions } from '@/lib/useIris';

// ── Layout & Core UI ─────────────────────────────────────────────────────────
import AppTopBar from '@/components/app/AppTopBar.vue';
import SessionSidenav from '@/components/app/SessionSidenav.vue';
import Toolbar from '@/components/app/Toolbar.vue';

// ── Pages / Views ────────────────────────────────────────────────────────────
import ProjectHome from '@/components/ProjectHome.vue';
import FeedViewPage from '@/components/FeedViewPage.vue';
import ThreeWindow from '@/components/threeWindow.vue';
import AnalysisWindow from '@/components/analysisWindow.vue';

// ── Modals & Overlays ────────────────────────────────────────────────────────
import SettingsModal from '@/components/settingsModal.vue';

const { 
  hasCurrentProject, 
  currentProject, 
  recentProjects,
  createProject, 
  openProject,
  updateCurrentProject,
  setCurrentProject
} = useProject();
const {
  presetStore,
  presets,
  defaultPresetId,
  loadPresetStore,
  savePresetStore,
} = useProjectPresets();
const {
  cameras: irisCameras,
  isRunning: isIrisRunning,
  isStarting: isStartingIris,
  isStopping: isStoppingIris,
  wsUrl: irisWsUrl,
  start: startIris,
  stop: stopIris,
} = useIris({ autoFetch: true, autoCheck: false });

void loadPresetStore();

// View State Routing
const activeView = computed(() => currentProject.value?.workspace.activeView || 'capture');

// Global Settings State
const showSettings = ref(false);
const currentTheme = ref<'dark' | 'light'>('light');
const irisRunMode = ref<'capture' | 'mocap' | null>(null);
const isRecording = ref(false);
const isRecordingBusy = ref(false);
const selectedRecordMode = ref<'plain' | 'augment'>('plain');
const activeRecordMode = ref<'plain' | 'augment'>('plain');
const PROJECT_MOTIONS_DIRECTORY_NAME = 'motions';
const PROJECT_MODELS_DIRECTORY_NAME = 'models';
const SIDENAV_WIDTH_STORAGE_KEY = 'recapture.session-sidenav-width';
const DEFAULT_SIDENAV_WIDTH = 240;
const MIN_SIDENAV_WIDTH = 220;
const MAX_SIDENAV_WIDTH = 480;
const sessionSidenavWidth = ref(readStoredSidenavWidth());

// Apply theme to document root for global CSS variable targeting
watchEffect(() => {
  document.documentElement.setAttribute('data-theme', currentTheme.value);
});

watch(sessionSidenavWidth, (value) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SIDENAV_WIDTH_STORAGE_KEY, String(clampSessionSidenavWidth(value)));
}, { immediate: true });

// View Navigation Handler
function setView(view: 'capture' | 'mocap' | 'analysis') {
  if (currentProject.value) {
    currentProject.value.workspace.activeView = view;
  }
}

const appContainerStyle = computed(() => ({
  '--app-session-sidenav-width': `${sessionSidenavWidth.value}px`,
}));

const selectedResolution = computed(() => currentProject.value?.workspace.resolution ?? '1920x1080');
const selectedFps = computed(() => currentProject.value?.workspace.fps ?? 30);
const selectedRotation = computed(() => currentProject.value?.workspace.rotation ?? 0);
const selectedCameraIds = computed(() => currentProject.value?.workspace.selectedCameraIds ?? []);
const activeProjectPresetId = computed(() =>
  currentProject.value?.settings.presetId ?? defaultPresetId.value ?? null
);
const activeProjectPreset = computed(() =>
  presets.value.find((preset) => preset.id === activeProjectPresetId.value) ?? presets.value[0] ?? null
);
const projectOutputDir = computed(() => getParentDirectory(currentProject.value?.path));
const availableIrisCameras = computed(() => {
  if (selectedCameraIds.value.length === 0) return irisCameras.value;
  return irisCameras.value.filter((camera) => selectedCameraIds.value.includes(String(camera.id)));
});
const isCaptureIrisRunning = computed(() =>
  isIrisRunning.value && irisRunMode.value === 'capture'
);
const isMocapIrisRunning = computed(() =>
  isIrisRunning.value && irisRunMode.value === 'mocap'
);
const canStartCaptureIris = computed(() =>
  availableIrisCameras.value.length > 0
  && !isStartingIris.value
  && !isStoppingIris.value
  && !isCaptureIrisRunning.value
);
const canStartMocapIris = computed(() =>
  availableIrisCameras.value.length > 0
  && !isStartingIris.value
  && !isStoppingIris.value
  && !isMocapIrisRunning.value
);
const canStopIris = computed(() =>
  isIrisRunning.value && !isStoppingIris.value && !isStartingIris.value
);
const canToggleRecording = computed(() =>
  !!currentProject.value?.path
  && !isRecordingBusy.value
  && (isRecording.value || isIrisRunning.value)
);

function updateResolution(value: string) {
  if (!currentProject.value) return;
  currentProject.value.workspace.resolution = value;
}

function updateFps(value: number) {
  if (!currentProject.value) return;
  currentProject.value.workspace.fps = value;
}

function updateRotation(value: number) {
  if (!currentProject.value) return;
  currentProject.value.workspace.rotation = value;
}

function parseResolution(value: string) {
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { width: 1920, height: 1080 };
  }

  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10),
  };
}

function getParentDirectory(filePath: string | null | undefined) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) return '';
  return filePath.replace(/[\\/][^\\/]+$/, '');
}

function getPathSeparator(filePath: string | null | undefined) {
  return typeof filePath === 'string' && filePath.includes('\\') ? '\\' : '/';
}

function joinPath(basePath: string, leaf: string) {
  return `${basePath.replace(/[\\/]+$/, '')}${getPathSeparator(basePath)}${leaf}`;
}

function sanitizePathSegment(value: string | null | undefined, fallback = 'subject') {
  const cleaned = typeof value === 'string'
    ? value.replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';

  return cleaned || fallback;
}

function normalizePathForComparison(filePath: string | null | undefined) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) return '';
  return filePath.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();
}

function getProjectMotionsDir(filePath: string | null | undefined) {
  const projectDir = getParentDirectory(filePath);
  return projectDir ? joinPath(projectDir, PROJECT_MOTIONS_DIRECTORY_NAME) : '';
}

function getProjectModelsDir(filePath: string | null | undefined) {
  const projectDir = getParentDirectory(filePath);
  return projectDir ? joinPath(projectDir, PROJECT_MODELS_DIRECTORY_NAME) : '';
}

function getParticipantScaledModelPath(projectPath: string | null | undefined, participantName: string) {
  const modelsDir = getProjectModelsDir(projectPath);
  if (!modelsDir) return '';

  return joinPath(modelsDir, `${sanitizePathSegment(participantName)}_scaled.osim`);
}

function createEntityId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStoredSidenavWidth() {
  if (typeof window === 'undefined') {
    return DEFAULT_SIDENAV_WIDTH;
  }

  const rawValue = window.localStorage.getItem(SIDENAV_WIDTH_STORAGE_KEY);
  const parsedValue = Number.parseInt(rawValue ?? '', 10);

  return Number.isFinite(parsedValue)
    ? clampSessionSidenavWidth(parsedValue)
    : DEFAULT_SIDENAV_WIDTH;
}

function clampSessionSidenavWidth(width: number) {
  if (typeof window === 'undefined') {
    return Math.min(MAX_SIDENAV_WIDTH, Math.max(MIN_SIDENAV_WIDTH, width));
  }

  const viewportMax = Math.max(MIN_SIDENAV_WIDTH, window.innerWidth - 320);
  return Math.min(Math.min(MAX_SIDENAV_WIDTH, viewportMax), Math.max(MIN_SIDENAV_WIDTH, width));
}

function handleResizeSessionSidenav(nextWidth: number) {
  sessionSidenavWidth.value = clampSessionSidenavWidth(nextWidth);
}

function handleViewportResize() {
  sessionSidenavWidth.value = clampSessionSidenavWidth(sessionSidenavWidth.value);
}

onMounted(() => {
  if (typeof window === 'undefined') return;
  window.addEventListener('resize', handleViewportResize);
});

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return;
  window.removeEventListener('resize', handleViewportResize);
});

interface RecordingTarget {
  participantName?: string;
  sessionName?: string;
  recordingPath?: string | null;
  recordMode?: 'plain' | 'augment';
  preserveIngestVideos?: boolean;
}

function createSessionFromTemplate(participantId: string, template: ProjectPreset['templates'][number]): ProjectSession {
  return {
    id: createEntityId(`${participantId}-session`),
    name: template.name,
    date: new Date().toISOString(),
    completed: false,
    recordingPath: null,
    templateId: template.id,
    exercises: [template.name],
  };
}

function syncParticipantSessionsWithPreset(participant: ProjectParticipant, preset: ProjectPreset): ProjectParticipant {
  const preservedSessions = participant.sessions.filter((session) =>
    !session.templateId || !preset.templates.some((template) => template.id === session.templateId)
  );

  const templatedSessions = preset.templates.map((template) => {
    const existingSession = participant.sessions.find((session) =>
      session.templateId === template.id || (!session.templateId && session.name === template.name)
    );

    return existingSession
      ? {
        ...existingSession,
        name: template.name,
        templateId: template.id,
      }
      : createSessionFromTemplate(participant.id, template);
  });

  return {
    ...participant,
    sessions: [...templatedSessions, ...preservedSessions],
  };
}

function syncParticipantsWithPreset(participants: ProjectParticipant[], preset: ProjectPreset | null): ProjectParticipant[] {
  if (!preset) return participants;
  return participants.map((participant) => syncParticipantSessionsWithPreset(participant, preset));
}

function projectNeedsPresetSync(participants: ProjectParticipant[], preset: ProjectPreset | null) {
  if (!preset) return false;

  return participants.some((participant) => {
    const templateIds = participant.sessions
      .map((session) => session.templateId)
      .filter((value): value is string => typeof value === 'string');

    return preset.templates.some((template) => !templateIds.includes(template.id));
  });
}

async function applyPresetToCurrentProject(preset: ProjectPreset | null, options: { save?: boolean } = {}) {
  if (!currentProject.value || !preset) return null;

  const nextParticipants = syncParticipantsWithPreset(currentProject.value.participants, preset);
  return updateCurrentProject({
    participants: nextParticipants,
    settings: {
      presetId: preset.id,
    },
  }, { save: options.save ?? true });
}

async function createProjectWithDefaultPreset() {
  const preset = presets.value.find((entry) => entry.id === defaultPresetId.value) ?? presets.value[0] ?? null;
  const participants = preset
    ? syncParticipantsWithPreset([{
      id: 'participant-1',
      name: 'Participant 1',
      sessions: [],
    }], preset)
    : undefined;

  await createProject({
    settings: {
      presetId: preset?.id ?? null,
    },
    participants,
  });
}

async function handleRecordSession(participantId: string, sessionId: string) {
  const participant = currentProject.value?.participants.find((entry) => entry.id === participantId);
  const session = participant?.sessions.find((entry) => entry.id === sessionId);
  if (!participant || !session) return;

  setView('capture');

  const startResult = await startIrisForMode('capture');
  if (!startResult?.ok || isRecording.value) return;

  const recordingResult = await handleToggleRecording({
    participantName: participant.name,
    sessionName: session.name,
    recordingPath: session.recordingPath,
  });
  if (recordingResult?.ok && recordingResult.outputDir) {
    await saveSessionRecordingPath(participantId, sessionId, recordingResult.outputDir);
  }
}

async function stopIrisBeforeMotionRecording() {
  if (!isIrisRunning.value) return true;

  const stopResult = await stopIris();
  if (stopResult?.ok) {
    irisRunMode.value = null;
    return true;
  }

  notifyRecordingError(stopResult?.error ?? 'Failed to stop IRIS before recording motion.');
  return false;
}

async function stopRecordingAfterFailedIrisStart() {
  if (!isRecording.value) return;

  isRecordingBusy.value = true;
  try {
    await stopRecordingAndFinalize();
  } finally {
    isRecordingBusy.value = false;
  }
}

async function handleRecordMotion(participantId: string, sessionId: string) {
  const participant = currentProject.value?.participants.find((entry) => entry.id === participantId);
  const session = participant?.sessions.find((entry) => entry.id === sessionId);
  const recordingPath = typeof session?.recordingPath === 'string' ? session.recordingPath.trim() : '';
  if (!participant || !session || !recordingPath) return;

  if (isRecording.value || isRecordingBusy.value) {
    notifyRecordingError('Stop the active recording before recording another motion.');
    return;
  }

  const canStartFreshIrisRun = await stopIrisBeforeMotionRecording();
  if (!canStartFreshIrisRun) return;

  setView('mocap');

  const recordingResult = await handleToggleRecording({
    participantName: participant.name,
    sessionName: session.name,
    recordingPath,
    recordMode: 'plain',
    preserveIngestVideos: true,
  });
  if (!recordingResult?.ok) return;

  const startResult = await startIrisWithOptions(
    'mocap',
    buildIrisIngestOptions(recordingPath),
    { allowReuseSameMode: false },
  );
  if (!startResult?.ok) {
    await stopRecordingAfterFailedIrisStart();
    notifyRecordingError(startResult?.error ?? 'Failed to start IRIS for motion recording.');
    return;
  }

  if (recordingResult.outputDir) {
    await saveSessionRecordingPath(participantId, sessionId, recordingResult.outputDir);
  }
}

async function handleLinkRecordings(participantId: string, sessionId: string) {
  const participant = currentProject.value?.participants.find((entry) => entry.id === participantId);
  const session = participant?.sessions.find((entry) => entry.id === sessionId);
  if (!participant || !session || !currentProject.value?.path || !window.ipc?.linkRecordings) return;

  const result = await window.ipc.linkRecordings({
    projectPath: currentProject.value.path,
    recordingPath: session.recordingPath,
    participantName: participant.name,
    sessionName: session.name,
  });

  if (!result?.ok || !result.outputDir) return;

  await saveSessionRecordingPath(participantId, sessionId, result.outputDir);
}

function notifyOpenSimError(message: string) {
  console.warn(`[opensim] ${message}`);
  window.alert(message);
}

function notifyRecordingError(message: string) {
  console.warn(`[recording] ${message}`);
  window.alert(message);
}

function isValidMotionRecordingPath(projectPath: string | null | undefined, recordingPath: string | null | undefined) {
  const normalizedRecordingPath = normalizePathForComparison(recordingPath);
  const normalizedMotionsDir = normalizePathForComparison(getProjectMotionsDir(projectPath));
  if (!normalizedRecordingPath || !normalizedMotionsDir) return false;
  return normalizedRecordingPath.length > normalizedMotionsDir.length
    && normalizedRecordingPath.startsWith(`${normalizedMotionsDir}/`);
}

async function ensureAugmentedRecordingData(recordingPath: string) {
  const trimmedPath = recordingPath.trim();
  if (!trimmedPath) {
    throw new Error('A linked motion folder is required.');
  }

  if (!window.ipc?.augmentMarkers) {
    throw new Error('Augmenter IPC is unavailable.');
  }

  const result = await window.ipc.augmentMarkers(resolveRecordingPosesPath(trimmedPath), trimmedPath);
  if (!result?.ok) {
    throw new Error(result?.error ?? 'Failed to augment poses for OpenSim.');
  }

  return resolveRecordingAugmentedTrcPath(trimmedPath);
}

async function handleRunSessionOpenSimScale(participantId: string, sessionId: string) {
  const participant = currentProject.value?.participants.find((entry) => entry.id === participantId);
  const session = participant?.sessions.find((entry) => entry.id === sessionId);
  const recordingPath = typeof session?.recordingPath === 'string' ? session.recordingPath.trim() : '';
  const projectPath = currentProject.value?.path ?? '';

  if (!participant || !session || !recordingPath) return;
  if (!window.opensimAPI?.scaleModel) return;

  try {
    const staticTrcPath = await ensureAugmentedRecordingData(recordingPath);
    const outputDir = getProjectModelsDir(projectPath);
    const scaledModelPath = getParticipantScaledModelPath(projectPath, participant.name);

    if (!outputDir || !scaledModelPath) {
      throw new Error('Unable to resolve the project models folder.');
    }

    const result = await window.opensimAPI.scaleModel({
      staticTrcPath,
      outputDir,
      scaledModelPath,
    });

    if (!result?.success) {
      throw new Error(result?.error ?? 'OpenSim scaling failed.');
    }
  } catch (error) {
    notifyOpenSimError(error instanceof Error ? error.message : 'OpenSim scaling failed.');
  }
}

async function handleRunSessionOpenSimIk(participantId: string, sessionId: string) {
  const participant = currentProject.value?.participants.find((entry) => entry.id === participantId);
  const session = participant?.sessions.find((entry) => entry.id === sessionId);
  const recordingPath = typeof session?.recordingPath === 'string' ? session.recordingPath.trim() : '';
  const projectPath = currentProject.value?.path ?? '';

  if (!participant || !session || !recordingPath) return;
  if (!window.opensimAPI?.runIK) return;

  try {
    const motionTrcPath = await ensureAugmentedRecordingData(recordingPath);
    const scaledModelPath = getParticipantScaledModelPath(projectPath, participant.name);

    if (!scaledModelPath) {
      throw new Error('Unable to resolve the participant scaled model path.');
    }

    const result = await window.opensimAPI.runIK({
      motionTrcPath,
      outputDir: recordingPath,
      scaledModelPath,
    });

    if (!result?.success) {
      throw new Error(result?.error ?? 'OpenSim IK failed.');
    }
  } catch (error) {
    notifyOpenSimError(error instanceof Error ? error.message : 'OpenSim IK failed.');
  }
}

async function handleSavePresetSettings({
  store,
  projectPresetId,
}: {
  store: ProjectPresetStore;
  projectPresetId: string | null;
}) {
  const result = await savePresetStore(store);
  if (!result.ok || !result.store) return;

  if (!currentProject.value) return;

  const nextPresetId = projectPresetId ?? result.store.defaultPresetId ?? null;
  const nextPreset = result.store.presets.find((preset) => preset.id === nextPresetId) ?? result.store.presets[0] ?? null;
  await applyPresetToCurrentProject(nextPreset, { save: true });
}

function buildIrisOptions(mode: 'capture' | 'mocap'): IrisStartOptions | null {
  if (!currentProject.value || availableIrisCameras.value.length === 0) return null;
  const { width, height } = parseResolution(selectedResolution.value);
  return {
    kp_format: 'halpe26',
    subjects: currentProject.value.workspace.personCount,
    cameras: availableIrisCameras.value.map((camera) => ({
      uri: String(camera.id),
      width,
      height,
      fps: selectedFps.value,
      rotation: selectedRotation.value,
    })),
    camera_width: width,
    camera_height: height,
    video_fps: selectedFps.value,
    rotation: selectedRotation.value,
    output_dir: projectOutputDir.value,
    capture_only: mode === 'capture',
    stream: true,
  };
}

function buildIrisIngestOptions(recordingPath: string): IrisStartOptions | null {
  if (!currentProject.value) return null;

  const trimmedRecordingPath = recordingPath.trim();
  if (!trimmedRecordingPath) return null;

  const { width, height } = parseResolution(selectedResolution.value);
  return {
    kp_format: 'halpe26',
    subjects: currentProject.value.workspace.personCount,
    cameras: [],
    camera_width: width,
    camera_height: height,
    video_fps: selectedFps.value,
    rotation: selectedRotation.value,
    output_dir: projectOutputDir.value,
    is_ingest: true,
    recordingPath: trimmedRecordingPath,
    stream: true,
  };
}

async function startIrisWithOptions(
  mode: 'capture' | 'mocap',
  options: IrisStartOptions | null,
  { allowReuseSameMode = true }: { allowReuseSameMode?: boolean } = {},
) {
  if (isStartingIris.value || isStoppingIris.value) {
    return { ok: false, error: 'IRIS is busy.' };
  }

  if (!options) {
    return { ok: false, error: 'Unable to build IRIS options.' };
  }

  if (allowReuseSameMode && isIrisRunning.value && irisRunMode.value === mode) {
    return { ok: true, alreadyRunning: true };
  }

  if (isIrisRunning.value) {
    const stopResult = await stopIris();
    if (!stopResult?.ok) {
      return stopResult;
    }
    irisRunMode.value = null;
  }

  const result = await startIris(options);
  if (result?.ok) {
    irisRunMode.value = mode;
  }

  return result;
}

async function startIrisForMode(mode: 'capture' | 'mocap') {
  const options = buildIrisOptions(mode);
  if (!options) {
    return { ok: false, error: 'No available cameras.' };
  }

  return startIrisWithOptions(mode, options, { allowReuseSameMode: true });
}

watch(isIrisRunning, (running) => {
  if (!running && !isStartingIris.value) {
    irisRunMode.value = null;
  }
});

watch(
  () => [currentProject.value?.id ?? null, activeProjectPreset.value?.id ?? null] as const,
  async () => {
    if (!currentProject.value || !activeProjectPreset.value) return;
    if (!projectNeedsPresetSync(currentProject.value.participants, activeProjectPreset.value)) return;
    await applyPresetToCurrentProject(activeProjectPreset.value, { save: true });
  },
);

watch(() => currentProject.value?.path ?? null, async (nextPath, previousPath) => {
  if (!previousPath || nextPath === previousPath || !isRecording.value) return;

  isRecordingBusy.value = true;
  try {
    await stopRecordingAndFinalize();
  } finally {
    isRecordingBusy.value = false;
  }
});

async function handleStartCaptureIris() {
  await startIrisForMode('capture');
}

async function handleStartIris() {
  await startIrisForMode('mocap');
}

async function handleStopIris() {
  const result = await stopIris();
  if (result?.ok) {
    irisRunMode.value = null;
  }
}

async function saveSessionRecordingPath(participantId: string, sessionId: string, recordingPath: string) {
  if (!currentProject.value) return null;

  const nextParticipants = currentProject.value.participants.map((participant) => {
    if (participant.id !== participantId) {
      return participant;
    }

    return {
      ...participant,
      sessions: participant.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, recordingPath, completed: recordingPath.trim().length > 0 }
          : session
      ),
    };
  });

  return updateCurrentProject({
    participants: nextParticipants,
    workspace: {
      selectedRecordingPath: recordingPath,
    },
  }, { save: true });
}

function resolveRecordingPosesPath(recordingPath: string) {
  return joinPath(recordingPath.trim(), 'poses.jsonl');
}

function resolveRecordingAugmentedTrcPath(recordingPath: string) {
  return joinPath(recordingPath.trim(), 'augmented-poses.trc');
}

async function augmentRecordingOutput(recordingPath: string) {
  const trimmedPath = recordingPath.trim();
  if (!trimmedPath || !window.ipc?.augmentMarkers) {
    return { ok: false, error: 'Augmenter is unavailable.' };
  }

  return window.ipc.augmentMarkers(resolveRecordingPosesPath(trimmedPath), trimmedPath);
}

async function stopRecordingAndFinalize() {
  if (!window.ipc?.stopIrisRecord) return;

  const result = await window.ipc.stopIrisRecord();
  if (!result?.ok) {
    return result;
  }

  isRecording.value = false;

  const completedMode = activeRecordMode.value;
  activeRecordMode.value = selectedRecordMode.value;

  const outputDir = typeof result.outputDir === 'string' && result.outputDir.trim().length > 0
    ? result.outputDir.trim()
    : currentProject.value?.workspace.selectedRecordingPath?.trim() ?? '';

  if (completedMode !== 'augment' || !outputDir) {
    return result;
  }

  const augmentationResult = await augmentRecordingOutput(outputDir);
  if (!augmentationResult?.ok) {
    console.warn('[recording] Failed to augment poses after recording stop.', augmentationResult?.error);
  }

  return { ...result, augmentationResult };
}

async function handleToggleRecording(target: RecordingTarget = {}) {
  if (!currentProject.value?.path || isRecordingBusy.value) return;
  if (!window.ipc?.startIrisRecord || !window.ipc?.stopIrisRecord) return;

  isRecordingBusy.value = true;

  try {
    if (isRecording.value) {
      return stopRecordingAndFinalize();
    }

    const nextRecordMode = target.recordMode ?? selectedRecordMode.value;
    activeRecordMode.value = nextRecordMode;
    const recordingPath = (target.recordingPath ?? currentProject.value.workspace.selectedRecordingPath ?? '').trim();
    const sessionName = typeof target.sessionName === 'string' ? target.sessionName.trim() : '';

    if (!sessionName && !isValidMotionRecordingPath(currentProject.value.path, recordingPath)) {
      activeRecordMode.value = selectedRecordMode.value;
      const error = 'Select a session motion before recording, or start recording from a session context menu.';
      notifyRecordingError(error);
      return { ok: false, error };
    }

    const result = await window.ipc.startIrisRecord({
      projectPath: currentProject.value.path,
      recordingPath: recordingPath || undefined,
      participantName: target.participantName,
      sessionName: sessionName || undefined,
      fps: selectedFps.value,
      savePoses: true,
      preserveIngestVideos: target.preserveIngestVideos,
    });

    if (result?.ok) {
      isRecording.value = true;
      if (result.outputDir && currentProject.value.workspace.selectedRecordingPath !== result.outputDir) {
        await updateCurrentProject({
          workspace: {
            selectedRecordingPath: result.outputDir,
          },
        }, { save: true });
      }
    } else {
      activeRecordMode.value = selectedRecordMode.value;
      if (result?.error) {
        notifyRecordingError(result.error);
      }
    }

    return result;
  } finally {
    isRecordingBusy.value = false;
  }
}
</script>

<template>
  <div id="app-container" :data-theme="currentTheme" :style="appContainerStyle">
    
    <AppTopBar 
      appTitle="ReCapture" 
      :homeDisabled="!hasCurrentProject"
      @toggle-settings="showSettings = !showSettings" 
      @navigate-home="setCurrentProject(null)"
    />

    <ProjectHome 
      v-if="!hasCurrentProject" 
      :recentProjects="recentProjects"
      @new-project="createProjectWithDefaultPreset()" 
      @open-project="openProject()"
      @open-recent="openProject($event)"
    />

    <template v-else>
      <SessionSidenav 
        :activeView="activeView"
        :participants="currentProject.participants"
        :width="sessionSidenavWidth"
        @open-capture="setView('capture')"
        @open-mocap="setView('mocap')"
        @open-analysis="setView('analysis')"
        @record-session="handleRecordSession($event.participantId, $event.sessionId)"
        @record-motion="handleRecordMotion($event.participantId, $event.sessionId)"
        @run-session-opensim-scale="handleRunSessionOpenSimScale($event.participantId, $event.sessionId)"
        @run-session-opensim-ik="handleRunSessionOpenSimIk($event.participantId, $event.sessionId)"
        @link-recordings="handleLinkRecordings($event.participantId, $event.sessionId)"
        @resize-sidebar="handleResizeSessionSidenav"
      />

      <main class="workspace-content">
        <div v-if="activeView === 'capture'" class="capture-stage">
          <div class="capture-toolbar-shell">
            <Toolbar
              :resolution="selectedResolution"
              :fps="selectedFps"
              :rotation="selectedRotation"
              :record-mode="selectedRecordMode"
              :show-start-button="true"
              :show-stop-button="true"
              :show-record-button="true"
              :is-starting-iris="isStartingIris"
              :is-stopping-iris="isStoppingIris"
              :is-iris-running="isCaptureIrisRunning"
              :is-recording="isRecording"
              :start-disabled="!canStartCaptureIris"
              :stop-disabled="!canStopIris"
              :record-disabled="!canToggleRecording"
              @update:resolution="updateResolution"
              @update:fps="updateFps"
              @update:rotation="updateRotation"
              @update:record-mode="selectedRecordMode = $event"
              @start-iris="handleStartCaptureIris"
              @stop-iris="handleStopIris"
              @toggle-recording="handleToggleRecording({ recordMode: $event.mode })"
            />
          </div>
          <FeedViewPage
            :cameras="availableIrisCameras"
            :ws-url="irisWsUrl"
          />
        </div>
        <div v-else-if="activeView === 'mocap'" class="mocap-stage">
          <div class="mocap-toolbar-shell">
            <Toolbar
              :resolution="selectedResolution"
              :fps="selectedFps"
              :rotation="selectedRotation"
              :record-mode="selectedRecordMode"
              :show-start-button="true"
              :show-stop-button="true"
              :show-record-button="true"
              :is-starting-iris="isStartingIris"
              :is-stopping-iris="isStoppingIris"
              :is-iris-running="isMocapIrisRunning"
              :is-recording="isRecording"
              :start-disabled="!canStartMocapIris"
              :stop-disabled="!canStopIris"
              :record-disabled="!canToggleRecording"
              @update:resolution="updateResolution"
              @update:fps="updateFps"
              @update:rotation="updateRotation"
              @update:record-mode="selectedRecordMode = $event"
              @start-iris="handleStartIris"
              @stop-iris="handleStopIris"
              @toggle-recording="handleToggleRecording({ recordMode: $event.mode })"
            />
          </div>
          <ThreeWindow />
        </div>
        <AnalysisWindow v-else-if="activeView === 'analysis'" />
      </main>
 
    </template>

    <SettingsModal 
      :showSettings="showSettings" 
      :currentTheme="currentTheme"
      :presetStore="presetStore"
      :currentProjectPresetId="currentProject?.settings.presetId ?? null"
      :hasCurrentProject="hasCurrentProject"
      @settings="showSettings = $event" 
      @setTheme="currentTheme = $event"
      @save-presets="handleSavePresetSettings"
    />
    
  </div>
</template>

<style scoped>
#app-container {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workspace-content {
  position: absolute;
  /* Top Bar Height | Right Sidebar Width | Bottom | Left Sidenav Width */
  inset: var(--app-topbar-height, 63px) 0 0 var(--app-session-sidenav-width, 240px);
  overflow: hidden;
  background: var(--bg);
}

.capture-stage,
.mocap-stage {
  position: relative;
  width: 100%;
  height: 100%;
}

.mocap-stage :deep(.scene) {
  position: absolute;
  inset: 0;
}

.capture-toolbar-shell,
.mocap-toolbar-shell {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  z-index: 20;
  display: flex;
  justify-content: flex-start;
  pointer-events: none;
}

.capture-toolbar-shell > *,
.mocap-toolbar-shell > * {
  pointer-events: auto;
}

@media (max-width: 768px) {
  .workspace-content {
    inset: var(--app-topbar-height, 63px) 0 0 0;
  }

  .capture-toolbar-shell,
  .mocap-toolbar-shell {
    top: 12px;
    left: 12px;
    right: 12px;
  }
}
  
</style>
