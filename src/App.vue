<script setup lang="ts">
import { ref, computed, watch, watchEffect } from 'vue';
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
  refreshCameras: refreshIrisCameras,
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
const isScaleRecording = ref(false);
const isScaleBusy = ref(false);
const isScalingExtrinsics = ref(false);

// Apply theme to document root for global CSS variable targeting
watchEffect(() => {
  document.documentElement.setAttribute('data-theme', currentTheme.value);
});

// View Navigation Handler
function setView(view: 'capture' | 'mocap' | 'analysis') {
  if (currentProject.value) {
    currentProject.value.workspace.activeView = view;
  }
}

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
  && !isScaleBusy.value
  && !isScaleRecording.value
  && (isRecording.value || isIrisRunning.value)
);
const canToggleScaleRecording = computed(() =>
  !!currentProject.value?.path
  && !isScaleBusy.value
  && !isRecordingBusy.value
  && !isRecording.value
  && (isScaleRecording.value || isIrisRunning.value)
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

function createEntityId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSessionFromTemplate(participantId: string, template: ProjectPreset['templates'][number]): ProjectSession {
  return {
    id: createEntityId(`${participantId}-session`),
    name: template.name,
    date: new Date().toISOString(),
    completed: false,
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

async function toggleSessionCompletion(participantId: string, sessionId: string) {
  if (!currentProject.value) return;

  const nextParticipants = currentProject.value.participants.map((participant) => {
    if (participant.id !== participantId) {
      return participant;
    }

    return {
      ...participant,
      sessions: participant.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, completed: !session.completed }
          : session
      ),
    };
  });

  await updateCurrentProject({ participants: nextParticipants }, { save: true });
}

async function handleRecordSession(participantId: string, sessionId: string) {
  const participant = currentProject.value?.participants.find((entry) => entry.id === participantId);
  const session = participant?.sessions.find((entry) => entry.id === sessionId);
  if (!session) return;

  setView('capture');

  const startResult = await startIrisForMode('capture');
  if (!startResult?.ok || isRecording.value) return;

  await handleToggleRecording();
}

async function handleSavePresetSettings(nextStore: ProjectPresetStore) {
  const result = await savePresetStore(nextStore);
  if (!result.ok || !result.store) return;

  if (!currentProject.value) return;

  const nextPresetId = currentProject.value.settings.presetId ?? result.store.defaultPresetId ?? null;
  const nextPreset = result.store.presets.find((preset) => preset.id === nextPresetId) ?? result.store.presets[0] ?? null;
  await applyPresetToCurrentProject(nextPreset, { save: true });
}

async function handleSetProjectPreset(presetId: string | null) {
  const resolvedPresetId = presetId ?? defaultPresetId.value ?? null;
  const nextPreset = presets.value.find((preset) => preset.id === resolvedPresetId) ?? presets.value[0] ?? null;
  if (!nextPreset) return;
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

async function startIrisForMode(mode: 'capture' | 'mocap') {
  if (isStartingIris.value || isStoppingIris.value) {
    return { ok: false, error: 'IRIS is busy.' };
  }

  if (isIrisRunning.value && irisRunMode.value === mode) {
    return { ok: true, alreadyRunning: true };
  }

  if (isIrisRunning.value) {
    const stopResult = await stopIris();
    if (!stopResult?.ok) {
      return stopResult;
    }
    irisRunMode.value = null;
  }

  const options = buildIrisOptions(mode);
  if (!options) {
    return { ok: false, error: 'No available cameras.' };
  }

  const result = await startIris(options);
  if (result?.ok) {
    irisRunMode.value = mode;
  }

  return result;
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
  if (!window.ipc?.stopIrisRecord) return;

  isRecordingBusy.value = true;
  try {
    const result = await window.ipc.stopIrisRecord();
    if (result?.ok) {
      isRecording.value = false;
    }
  } finally {
    isRecordingBusy.value = false;
  }
});

watch(() => currentProject.value?.path ?? null, async (nextPath, previousPath) => {
  if (!previousPath || nextPath === previousPath || !isScaleRecording.value) return;
  if (!window.ipc?.stopIrisScaleExtrinsicsRecord) return;

  isScaleBusy.value = true;
  isScalingExtrinsics.value = true;
  try {
    const result = await window.ipc.stopIrisScaleExtrinsicsRecord();
    if (result?.ok) {
      isScaleRecording.value = false;
      await refreshIrisCameras();
    }
  } finally {
    isScaleBusy.value = false;
    isScalingExtrinsics.value = false;
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

async function handleToggleRecording() {
  if (!currentProject.value?.path || isRecordingBusy.value || isScaleBusy.value || isScaleRecording.value) return;
  if (!window.ipc?.startIrisRecord || !window.ipc?.stopIrisRecord) return;

  isRecordingBusy.value = true;

  try {
    if (isRecording.value) {
      const result = await window.ipc.stopIrisRecord();
      if (result?.ok) {
        isRecording.value = false;
      }
      return;
    }

    const result = await window.ipc.startIrisRecord({
      projectPath: currentProject.value.path,
      fps: selectedFps.value,
      savePoses: true,
    });

    if (result?.ok) {
      isRecording.value = true;
    }
  } finally {
    isRecordingBusy.value = false;
  }
}

async function handleToggleScaleRecording() {
  if (!currentProject.value?.path || isScaleBusy.value || isRecordingBusy.value || isRecording.value) return;
  if (!window.ipc?.startIrisScaleExtrinsicsRecord || !window.ipc?.stopIrisScaleExtrinsicsRecord) return;

  isScaleBusy.value = true;

  try {
    if (isScaleRecording.value) {
      isScalingExtrinsics.value = true;

      const result = await window.ipc.stopIrisScaleExtrinsicsRecord();
      if (result?.ok) {
        isScaleRecording.value = false;
        await refreshIrisCameras();
      }
      return;
    }

    const result = await window.ipc.startIrisScaleExtrinsicsRecord({
      projectPath: currentProject.value.path,
      fps: selectedFps.value,
    });

    if (result?.ok) {
      isScaleRecording.value = true;
    }
  } finally {
    isScaleBusy.value = false;
    if (!isScaleRecording.value) {
      isScalingExtrinsics.value = false;
    }
  }
}
</script>

<template>
  <div id="app-container" :data-theme="currentTheme">
    
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
        @open-capture="setView('capture')"
        @open-mocap="setView('mocap')"
        @open-analysis="setView('analysis')"
        @toggle-session-complete="toggleSessionCompletion($event.participantId, $event.sessionId)"
        @record-session="handleRecordSession($event.participantId, $event.sessionId)"
      />

      <main class="workspace-content">
        <div v-if="activeView === 'capture'" class="capture-stage">
          <div class="capture-toolbar-shell">
            <Toolbar
              :resolution="selectedResolution"
              :fps="selectedFps"
              :rotation="selectedRotation"
              :show-start-button="true"
              :show-stop-button="true"
              :show-scale-button="true"
              :show-record-button="true"
              :is-starting-iris="isStartingIris"
              :is-stopping-iris="isStoppingIris"
              :is-iris-running="isCaptureIrisRunning"
              :is-scale-recording="isScaleRecording"
              :is-scaling-extrinsics="isScalingExtrinsics"
              :is-recording="isRecording"
              :start-disabled="!canStartCaptureIris"
              :stop-disabled="!canStopIris"
              :scale-disabled="!canToggleScaleRecording"
              :record-disabled="!canToggleRecording"
              @update:resolution="updateResolution"
              @update:fps="updateFps"
              @update:rotation="updateRotation"
              @start-iris="handleStartCaptureIris"
              @stop-iris="handleStopIris"
              @toggle-scale-recording="handleToggleScaleRecording"
              @toggle-recording="handleToggleRecording"
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
              :show-start-button="true"
              :show-stop-button="true"
              :show-scale-button="true"
              :show-record-button="true"
              :is-starting-iris="isStartingIris"
              :is-stopping-iris="isStoppingIris"
              :is-iris-running="isMocapIrisRunning"
              :is-scale-recording="isScaleRecording"
              :is-scaling-extrinsics="isScalingExtrinsics"
              :is-recording="isRecording"
              :start-disabled="!canStartMocapIris"
              :stop-disabled="!canStopIris"
              :scale-disabled="!canToggleScaleRecording"
              :record-disabled="!canToggleRecording"
              @update:resolution="updateResolution"
              @update:fps="updateFps"
              @update:rotation="updateRotation"
              @start-iris="handleStartIris"
              @stop-iris="handleStopIris"
              @toggle-scale-recording="handleToggleScaleRecording"
              @toggle-recording="handleToggleRecording"
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
      @set-project-preset="handleSetProjectPreset"
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
