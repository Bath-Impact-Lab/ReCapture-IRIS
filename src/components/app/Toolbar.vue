<template>
  <div class="capture-toolbar">
    <div class="toolbar-group">
      <label class="toolbar-label" for="resolution-select">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        Resolution
      </label>
      <div class="select-wrapper">
        <select
          id="resolution-select"
          class="toolbar-select"
          v-model="selectedResolution"
          @change="emit('update:resolution', selectedResolution)"
        >
          <option value="1280x720">720p (HD)</option>
          <option value="1920x1080">1080p (FHD)</option>
          <option value="2560x1440">1440p (2K)</option>
          <option value="3840x2160">2160p (4K)</option>
        </select>
        <svg class="select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <label class="toolbar-label" for="fps-select">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        FPS
      </label>
      <div class="select-wrapper">
        <select
          id="fps-select"
          class="toolbar-select"
          v-model="selectedFps"
          @change="emit('update:fps', selectedFps)"
        >
          <option :value="15">15 fps</option>
          <option :value="30">30 fps</option>
          <option :value="60">60 fps</option>
          <option :value="100">100 fps</option>
          <option :value="120">120 fps</option>
        </select>
        <svg class="select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <label class="toolbar-label" for="rotation-select">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7"></path>
          <polyline points="3 3 3 9 9 9"></polyline>
        </svg>
        Rotate
      </label>
      <div class="select-wrapper">
        <select
          id="rotation-select"
          class="toolbar-select"
          v-model="selectedRotation"
          @change="emit('update:rotation', selectedRotation)"
        >
          <option :value="0">0 deg</option>
          <option :value="90">90 deg</option>
          <option :value="180">180 deg</option>
          <option :value="270">270 deg</option>
        </select>
        <svg class="select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </div>

    <template v-if="showStartButton || showStopButton || showRecordButton">
      <div class="toolbar-divider"></div>

      <button
        v-if="showStartButton"
        class="toolbar-action"
        type="button"
        :disabled="startDisabled"
        @click="emit('start-iris')"
      >
        {{ startLabel }}
      </button>

      <button
        v-if="showStopButton"
        class="toolbar-action toolbar-action-danger"
        type="button"
        :disabled="stopDisabled"
        @click="emit('stop-iris')"
      >
        {{ stopLabel }}
      </button>

      <div
        v-if="showRecordButton"
        ref="recordActionRef"
        class="toolbar-record-split"
        :class="{ 'toolbar-record-split-open': isRecordMenuOpen }"
      >
        <button
          class="toolbar-action toolbar-action-record toolbar-action-record-main"
          :class="{ 'toolbar-action-recording': isRecording }"
          type="button"
          :disabled="recordDisabled"
          @click="emit('toggle-recording', { mode: selectedRecordMode })"
        >
          {{ recordLabel }}
        </button>
        <button
          class="toolbar-action toolbar-action-record toolbar-action-record-toggle"
          :class="{ 'toolbar-action-recording': isRecording }"
          type="button"
          :disabled="recordMenuDisabled"
          :aria-expanded="isRecordMenuOpen"
          aria-haspopup="menu"
          aria-label="Select recording mode"
          @click="toggleRecordMenu"
        >
          <svg class="toolbar-record-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        <div v-if="isRecordMenuOpen" class="toolbar-record-menu" role="menu">
          <button
            class="toolbar-record-menu-item"
            :class="{ 'toolbar-record-menu-item-active': selectedRecordMode === 'plain' }"
            type="button"
            role="menuitemradio"
            :aria-checked="selectedRecordMode === 'plain'"
            @click="selectRecordMode('plain')"
          >
            Plain Record
          </button>
          <button
            class="toolbar-record-menu-item"
            :class="{ 'toolbar-record-menu-item-active': selectedRecordMode === 'augment' }"
            type="button"
            role="menuitemradio"
            :aria-checked="selectedRecordMode === 'augment'"
            @click="selectRecordMode('augment')"
          >
            Record Then Augment
          </button>
        </div>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

type RecordingMode = 'plain' | 'augment';
interface RecordingTogglePayload {
  mode: RecordingMode;
}

interface Props {
  resolution?: string;
  fps?: number;
  rotation?: number;
  recordMode?: RecordingMode;
  showStartButton?: boolean;
  showStopButton?: boolean;
  showRecordButton?: boolean;
  isStartingIris?: boolean;
  isStoppingIris?: boolean;
  isIrisRunning?: boolean;
  isRecording?: boolean;
  startDisabled?: boolean;
  stopDisabled?: boolean;
  recordDisabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  resolution: '1920x1080',
  fps: 30,
  rotation: 0,
  recordMode: 'plain',
  showStartButton: false,
  showStopButton: false,
  showRecordButton: false,
  isStartingIris: false,
  isStoppingIris: false,
  isIrisRunning: false,
  isRecording: false,
  startDisabled: false,
  stopDisabled: false,
  recordDisabled: false,
});

const emit = defineEmits<{
  'update:resolution': [value: string];
  'update:fps': [value: number];
  'update:rotation': [value: number];
  'update:record-mode': [value: RecordingMode];
  'start-iris': [];
  'stop-iris': [];
  'toggle-recording': [payload: RecordingTogglePayload];
}>();

const selectedResolution = ref(props.resolution);
const selectedFps = ref(props.fps);
const selectedRotation = ref(props.rotation);
const selectedRecordMode = ref<RecordingMode>(props.recordMode);
const isRecordMenuOpen = ref(false);
const recordActionRef = ref<HTMLElement | null>(null);
const startLabel = computed(() => {
  if (props.isStartingIris) return 'Starting IRIS...';
  if (props.isIrisRunning) return 'IRIS Running';
  return 'Start IRIS';
});
const stopLabel = computed(() => {
  if (props.isStoppingIris) return 'Stopping IRIS...';
  return 'Stop IRIS';
});
const recordLabel = computed(() => {
  if (props.isRecording) return 'Stop Recording';
  return selectedRecordMode.value === 'augment' ? 'Record + Augment' : 'Record';
});
const recordMenuDisabled = computed(() => props.recordDisabled || props.isRecording);

onMounted(() => {
  window.addEventListener('click', handleWindowClick);
  window.addEventListener('blur', closeRecordMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', handleWindowClick);
  window.removeEventListener('blur', closeRecordMenu);
});

// Keep local state in sync if parent updates props
watch(() => props.resolution, (newVal) => { selectedResolution.value = newVal; });
watch(() => props.fps, (newVal) => { selectedFps.value = newVal; });
watch(() => props.rotation, (newVal) => { selectedRotation.value = newVal; });
watch(() => props.recordMode, (newVal) => {
  selectedRecordMode.value = newVal;
});
watch(() => props.isRecording, (isRecording) => {
  if (isRecording) {
    closeRecordMenu();
  }
});

function toggleRecordMenu() {
  if (recordMenuDisabled.value) return;
  isRecordMenuOpen.value = !isRecordMenuOpen.value;
}

function closeRecordMenu() {
  isRecordMenuOpen.value = false;
}

function selectRecordMode(mode: RecordingMode) {
  selectedRecordMode.value = mode;
  emit('update:record-mode', mode);
  closeRecordMenu();
}

function handleWindowClick(event: MouseEvent) {
  if (!isRecordMenuOpen.value) return;
  if (recordActionRef.value?.contains(event.target as Node | null)) return;
  closeRecordMenu();
}
</script>

<style scoped>
.capture-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;

  /* Glassmorphism settings */
  background: rgba(15, 22, 30, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);

  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;

  /* Subtle inset glow and drop shadow */
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: background 0.3s ease, border-color 0.3s ease;
}

[data-theme="light"] .capture-toolbar {
  background: rgba(255, 255, 255, 0.65);
  border-color: rgba(31, 78, 121, 0.15);
  box-shadow: 0 8px 32px rgba(31, 78, 121, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

[data-theme="light"] .toolbar-label {
  color: #2E86C1;
}

.select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.toolbar-select {
  appearance: none;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: var(--fg);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 6px 32px 6px 12px;
  cursor: pointer;
  outline: none;
  min-width: 110px;
  transition: all 0.2s ease;
}

.toolbar-select:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}

.toolbar-select:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(107, 230, 117, 0.2);
}

[data-theme="light"] .toolbar-select {
  color: #1F4E79;
  background: rgba(255, 255, 255, 0.5);
  border-color: rgba(31, 78, 121, 0.15);
}

[data-theme="light"] .toolbar-select:hover {
  background: rgba(255, 255, 255, 0.8);
  border-color: var(--accent);
}

[data-theme="light"] .toolbar-select:focus-visible {
  box-shadow: 0 0 0 2px rgba(46, 134, 193, 0.2);
}

.toolbar-select option {
  background: var(--dropdown-bg, #11161d);
  color: var(--fg);
}

[data-theme="light"] .toolbar-select option {
  background: #ffffff;
  color: #1F4E79;
}

.select-chevron {
  position: absolute;
  right: 10px;
  pointer-events: none;
  color: var(--muted);
  opacity: 0.8;
  transition: transform 0.2s ease;
}

[data-theme="light"] .select-chevron {
  color: #2E86C1;
}

.toolbar-select:focus + .select-chevron {
  transform: rotate(180deg);
  color: var(--accent);
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.1);
}

[data-theme="light"] .toolbar-divider {
  background: rgba(31, 78, 121, 0.15);
}

.toolbar-action {
  border: 1px solid rgba(107, 230, 117, 0.24);
  border-radius: 9px;
  background: linear-gradient(135deg, rgba(107, 230, 117, 0.24), rgba(68, 176, 255, 0.18));
  color: var(--fg);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 8px 14px;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
}

.toolbar-action:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(107, 230, 117, 0.44);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
}

.toolbar-action:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.toolbar-action-danger {
  border-color: rgba(255, 107, 107, 0.24);
  background: linear-gradient(135deg, rgba(255, 107, 107, 0.24), rgba(255, 159, 67, 0.16));
}

.toolbar-action-danger:hover:not(:disabled) {
  border-color: rgba(255, 107, 107, 0.44);
}

.toolbar-action-record {
  border-color: rgba(244, 63, 94, 0.24);
  background: linear-gradient(135deg, rgba(244, 63, 94, 0.22), rgba(251, 113, 133, 0.14));
}

.toolbar-action-record:hover:not(:disabled) {
  border-color: rgba(244, 63, 94, 0.44);
}

.toolbar-action-recording {
  border-color: rgba(244, 63, 94, 0.52);
  background: linear-gradient(135deg, rgba(225, 29, 72, 0.32), rgba(251, 113, 133, 0.2));
}

.toolbar-record-split {
  position: relative;
  display: inline-flex;
  align-items: stretch;
}

.toolbar-action-record-main {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.toolbar-action-record-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  padding: 8px 10px;
  border-left: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.toolbar-record-chevron {
  transition: transform 0.2s ease;
}

.toolbar-record-split-open .toolbar-record-chevron {
  transform: rotate(180deg);
}

.toolbar-record-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 190px;
  padding: 8px;
  border-radius: 12px;
  background: rgba(17, 24, 39, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 40;
}

.toolbar-record-menu-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 10px 12px;
  border-radius: 8px;
  text-align: left;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.toolbar-record-menu-item:hover {
  background: var(--sidenav-hover, rgba(255, 255, 255, 0.06));
}

.toolbar-record-menu-item-active {
  background: rgba(244, 63, 94, 0.16);
}

[data-theme="light"] .toolbar-action {
  color: #1F4E79;
  background: linear-gradient(135deg, rgba(46, 134, 193, 0.16), rgba(56, 189, 248, 0.14));
  border-color: rgba(31, 78, 121, 0.18);
}

[data-theme="light"] .toolbar-action-danger {
  background: linear-gradient(135deg, rgba(220, 38, 38, 0.14), rgba(249, 115, 22, 0.14));
  border-color: rgba(185, 28, 28, 0.18);
}

[data-theme="light"] .toolbar-action-record {
  color: #9f1239;
  background: linear-gradient(135deg, rgba(244, 63, 94, 0.12), rgba(251, 113, 133, 0.1));
  border-color: rgba(190, 24, 93, 0.22);
}

[data-theme="light"] .toolbar-action-recording {
  background: linear-gradient(135deg, rgba(225, 29, 72, 0.2), rgba(251, 113, 133, 0.16));
  border-color: rgba(190, 24, 93, 0.34);
}

[data-theme="light"] .toolbar-record-menu {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(31, 78, 121, 0.12);
  color: #1F4E79;
}

[data-theme="light"] .toolbar-record-menu-item-active {
  background: rgba(190, 24, 93, 0.1);
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
  .capture-toolbar {
    flex-wrap: wrap;
    gap: 12px;
  }
  .toolbar-divider {
    display: none;
  }
  .toolbar-select {
    min-width: 140px;
  }
  .toolbar-action {
    width: 100%;
  }
  .toolbar-record-split {
    width: 100%;
  }
  .toolbar-action-record-main {
    flex: 1;
  }
}
</style>
