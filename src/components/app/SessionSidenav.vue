<template>
  <aside class="session-sidenav">

    <div class="session-sidenav-scroll-area">
      <div class="session-sidenav-section">
        <button
          class="dropdown-toggle"
          @click="isCamerasOpen = !isCamerasOpen"
          type="button"
          aria-label="Toggle Connected Cameras"
        >
          <h2 class="session-sidenav-title">Connected Cameras</h2>
          <svg
            xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="chevron" :class="{ 'open': isCamerasOpen }"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        <div v-show="isCamerasOpen" class="session-sidenav-list">
          <div v-if="areIrisCamerasLoading && !hasIrisCameras" class="session-sidenav-empty-state">
            Loading IRIS cameras...
          </div>
          <div v-else-if="irisCameraErrorMessage" class="session-sidenav-empty-state">
            {{ irisCameraErrorMessage }}
          </div>
          <div v-else-if="!hasIrisCameras" class="session-sidenav-empty-state">
            No IRIS cameras detected.
          </div>
          <template v-else>
            <div
              v-for="camera in irisCameras"
              :key="`camera-${camera.id}`"
              class="session-sidenav-link session-sidenav-link--static"
            >
              <div class="camera-listing">
                <span
                  class="indicator camera-indicator"
                  :class="{ 'camera-indicator--inactive': !camera.success }"
                ></span>
                <span>{{ camera.name }}</span>
              </div>
              <span class="camera-status">
                {{ camera.success ? 'Connected' : 'Unavailable' }}
              </span>
            </div>
          </template>
        </div>
      </div>

      <div v-for="participant in participants" :key="participant.id" class="session-sidenav-section">
        <h2 class="session-sidenav-title">{{ participant.name }}</h2>

        <div v-if="participant.sessions.length > 0" class="session-sidenav-list">
          <button
            v-for="session in participant.sessions"
            :key="session.id"
            class="session-sidenav-link session-trial-link"
            :class="{ 'session-trial-link--complete': hasSessionRecording(session) }"
            type="button"
            :title="`Right click to manage ${session.name}`"
            @contextmenu.prevent="openSessionMenu($event, participant.id, session.id)"
          >
            <div class="link-left">
              <span class="indicator" :class="{ 'indicator-complete': hasSessionRecording(session) }"></span>
              <div class="session-meta">
                <span class="session-name">{{ session.name }}</span>
                <span class="session-date">{{ formatSessionDate(session.date) }}</span>
              </div>
              <span class="session-status">
                {{ hasSessionRecording(session) ? 'Complete' : 'Pending' }}
              </span>
            </div>
          </button>
        </div>
        <div v-else class="session-sidenav-empty-state">
          No sessions yet.
        </div>
      </div>
    </div>

    <div class="session-sidenav-fixed-bottom">
      <div class="session-sidenav-divider"></div>

      <div class="session-sidenav-bottom">
        <button
          class="session-sidenav-action"
          :class="{ active: activeView === 'mocap' }"
          @click="emit('open-mocap')"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><line x1="12" y1="5" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="19"></line><line x1="5" y1="12" x2="2" y2="12"></line><line x1="22" y1="12" x2="19" y2="12"></line></svg>
          Mocap Mode
        </button>
        <button
          class="session-sidenav-action"
          :class="{ active: activeView === 'capture' }"
          @click="emit('open-capture')"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><circle cx="12" cy="12" r="3"></circle></svg>
          Capture Mode
        </button>
        <button
          class="session-sidenav-action"
          :class="{ active: activeView === 'analysis' }"
          @click="emit('open-analysis')"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
          Analysis Mode
        </button>
      </div>

      <div class="session-sidenav-brand">
        <img
          src="/assets/RecaptureGraphic.png"
          alt="ReCapture"
          class="session-sidenav-brand-image"
        />
      </div>
    </div>

    <div
      v-if="sessionMenu.visible"
      class="template-context-menu"
      :style="{ left: `${sessionMenu.x}px`, top: `${sessionMenu.y}px` }"
    >
      <button class="template-context-action" type="button" @click="recordSessionFromMenu">
        Record Trial
      </button>
      <button
        class="template-context-action"
        :disabled="!canRecordMotion"
        type="button"
        @click="recordMotionFromMenu"
      >
        Record Motion
      </button>
      <button
        class="template-context-action"
        :disabled="!canRunOpenSim"
        type="button"
        @click="runOpenSimScaleFromMenu"
      >
        Run OpenSim Scale
      </button>
      <button
        class="template-context-action"
        :disabled="!canRunOpenSim"
        type="button"
        @click="runOpenSimIkFromMenu"
      >
        Run OpenSim IK
      </button>
      <button class="template-context-action" type="button" @click="linkRecordingsFromMenu">
        Link Recordings
      </button>
    </div>

    <div
      class="session-sidenav-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      :aria-valuenow="Math.round(props.width)"
      @pointerdown.prevent="beginResize"
    ></div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useIris } from '@/lib/useIris';
import type { ProjectParticipant, ProjectSession } from '@/lib/useProject';

interface Props {
  activeView: 'capture' | 'analysis' | 'mocap';
  participants?: ProjectParticipant[];
  width?: number;
}

const props = withDefaults(defineProps<Props>(), {
  participants: () => [],
  width: 240,
});

const emit = defineEmits<{
  'open-capture': [];
  'open-analysis': [];
  'open-mocap': [];
  'record-session': [{ participantId: string; sessionId: string }];
  'record-motion': [{ participantId: string; sessionId: string }];
  'run-session-opensim-scale': [{ participantId: string; sessionId: string }];
  'run-session-opensim-ik': [{ participantId: string; sessionId: string }];
  'link-recordings': [{ participantId: string; sessionId: string }];
  'resize-sidebar': [width: number];
}>();

// State for the main cameras dropdown
const isCamerasOpen = ref(true);
const participants = computed(() => props.participants);
const sessionMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  participantId: '',
  sessionId: '',
});
const {
  cameras: irisCameras,
  isLoading: areIrisCamerasLoading,
  error: irisCamerasError,
} = useIris({
  autoFetch: true,
  pollInterval: 5000,
});

const hasIrisCameras = computed(() => irisCameras.value.length > 0);
const irisCameraErrorMessage = computed(() =>
  irisCamerasError.value ? 'Unable to load IRIS cameras.' : ''
);
const isResizing = ref(false);
const selectedSession = computed(() => {
  if (!sessionMenu.value.visible) return null;

  const participant = participants.value.find((entry) => entry.id === sessionMenu.value.participantId);
  return participant?.sessions.find((entry) => entry.id === sessionMenu.value.sessionId) ?? null;
});
const canRunOpenSim = computed(() => hasSessionRecording(selectedSession.value));
const canRecordMotion = computed(() => hasSessionRecording(selectedSession.value));

onMounted(() => {
  window.addEventListener('click', closeSessionMenu);
  window.addEventListener('blur', closeSessionMenu);
  window.addEventListener('scroll', closeSessionMenu, true);
});

onBeforeUnmount(() => {
  stopResize();
  window.removeEventListener('click', closeSessionMenu);
  window.removeEventListener('blur', closeSessionMenu);
  window.removeEventListener('scroll', closeSessionMenu, true);
});

function formatSessionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function hasSessionRecording(session: ProjectSession | null | undefined) {
  return !!session && typeof session.recordingPath === 'string' && session.recordingPath.trim().length > 0;
}

function openSessionMenu(event: MouseEvent, participantId: string, sessionId: string) {
  sessionMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    participantId,
    sessionId,
  };
}

function closeSessionMenu() {
  if (!sessionMenu.value.visible) return;
  sessionMenu.value = {
    visible: false,
    x: 0,
    y: 0,
    participantId: '',
    sessionId: '',
  };
}

function recordSessionFromMenu() {
  emit('record-session', {
    participantId: sessionMenu.value.participantId,
    sessionId: sessionMenu.value.sessionId,
  });
  closeSessionMenu();
}

function recordMotionFromMenu() {
  if (!canRecordMotion.value) return;

  emit('record-motion', {
    participantId: sessionMenu.value.participantId,
    sessionId: sessionMenu.value.sessionId,
  });
  closeSessionMenu();
}

function runOpenSimScaleFromMenu() {
  if (!canRunOpenSim.value) return;

  emit('run-session-opensim-scale', {
    participantId: sessionMenu.value.participantId,
    sessionId: sessionMenu.value.sessionId,
  });
  closeSessionMenu();
}

function runOpenSimIkFromMenu() {
  if (!canRunOpenSim.value) return;

  emit('run-session-opensim-ik', {
    participantId: sessionMenu.value.participantId,
    sessionId: sessionMenu.value.sessionId,
  });
  closeSessionMenu();
}

function linkRecordingsFromMenu() {
  emit('link-recordings', {
    participantId: sessionMenu.value.participantId,
    sessionId: sessionMenu.value.sessionId,
  });
  closeSessionMenu();
}

function beginResize() {
  if (window.innerWidth <= 768) return;

  isResizing.value = true;
  document.body.classList.add('session-sidenav-resizing');
  window.addEventListener('pointermove', handleResizePointerMove);
  window.addEventListener('pointerup', stopResize);
  window.addEventListener('pointercancel', stopResize);
}

function handleResizePointerMove(event: PointerEvent) {
  if (!isResizing.value) return;
  emit('resize-sidebar', event.clientX);
}

function stopResize() {
  if (!isResizing.value) return;

  isResizing.value = false;
  document.body.classList.remove('session-sidenav-resizing');
  window.removeEventListener('pointermove', handleResizePointerMove);
  window.removeEventListener('pointerup', stopResize);
  window.removeEventListener('pointercancel', stopResize);
}
</script>

<style scoped>
.session-sidenav {
  position: absolute;
  top: var(--app-topbar-height, 63px);
  bottom: 0;
  left: 0;
  width: var(--app-session-sidenav-width, 240px);
  display: flex;
  flex-direction: column;
  background: var(--sidebar, #ffffff);
  border-right: 1px solid var(--sidenav-border, #e5e7eb);
  z-index: 10;
  transition: background 0.3s ease, border-color 0.3s ease;
  overflow: hidden; /* Lock main component from scrolling */
}

.session-sidenav-resizer {
  position: absolute;
  top: 0;
  right: -4px;
  bottom: 0;
  width: 9px;
  cursor: col-resize;
  touch-action: none;
  z-index: 30;
}

.session-sidenav-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 4px;
  width: 1px;
  background: transparent;
  transition: background-color 0.2s ease;
}

.session-sidenav-resizer:hover::before {
  background: color-mix(in srgb, var(--accent, #3b82f6) 55%, transparent);
}

:global(body.session-sidenav-resizing) {
  cursor: col-resize;
  user-select: none;
}

:global(body.session-sidenav-resizing *) {
  cursor: col-resize !important;
}

/* Scrollable Container for Lists */
.session-sidenav-scroll-area {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 20px 12px;
}

.session-sidenav-scroll-area::-webkit-scrollbar {
  display: none;
}

/* Fixed Container for Buttons and Brand */
.session-sidenav-fixed-bottom {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;

  background: inherit; /* Inherits background so items scrolling under it are hidden correctly */
}

.session-sidenav-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px 8px;
}

.session-sidenav-brand-image {
  display: block;
  width: 100%;
  max-width: 200px;
  height: auto;
  object-fit: contain;
}

.session-sidenav-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-sidenav-empty-state {
  margin: 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--muted);
  font-size: 0.82rem;
}

[data-theme="light"] .session-sidenav-empty-state {
  background: rgba(31, 78, 121, 0.04);
}

/* Dropdown Toggle Styles */
.dropdown-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 4px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.dropdown-toggle:hover {
  background: var(--sidenav-hover, rgba(0, 0, 0, 0.04));
}

.dropdown-toggle .session-sidenav-title {
  padding-left: 0;
}

.chevron {
  color: var(--sidenav-title, #9ca3af);
  transition: transform 0.3s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.small-chevron {
  opacity: 0.6;
}

.session-sidenav-title {
  margin: 0;
  padding-left: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--sidenav-title, #9ca3af);
  white-space: nowrap;
}

.session-sidenav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-sidenav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sidenav-link, #4b5563);
  font-size: 0.95rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.2s ease;
}

.link-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  width: 100%;
}

.session-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.session-name,
.session-date {
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-name {
  font-size: 0.9rem;
}

.session-date {
  font-size: 0.75rem;
  color: var(--muted, #94a3b8);
}

.session-status {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted, #94a3b8);
}

.session-trial-link {
  border: 1px solid rgba(107, 230, 117, 0.25);
  border-radius: 8px;
}

.session-trial-link--complete {
  border-color: transparent;
  background: transparent;
}

.indicator-complete {
  background-color: rgba(107, 230, 117, 0.75);
}

.indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--sidenav-border, #d1d5db);
  transition: background-color 0.2s ease;
}

.camera-indicator {
  background-color: var(--success, #10b981);
}

.camera-indicator--inactive {
  background-color: rgba(148, 163, 184, 0.6);
}

.camera-listing {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.camera-status {
  flex-shrink: 0;
  font-size: 0.78rem;
  color: var(--muted, #94a3b8);
}

.session-sidenav-link:hover {
  background: var(--sidenav-hover, rgba(0, 0, 0, 0.04));
  color: var(--sidenav-title, #111827);
}

.session-sidenav-link--static {
  justify-content: space-between;
  cursor: default;
}

.session-sidenav-link.session-sidenav-link--static:hover {
  background: transparent;
  color: var(--sidenav-link, #4b5563);
}

.session-sidenav-link:hover .indicator:not(.camera-indicator) {
  background-color: var(--accent, #3b82f6);
}

.template-context-menu {
  position: fixed;
  z-index: 2000;
  min-width: 180px;
  padding: 8px;
  border-radius: 12px;
  background: rgba(17, 24, 39, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

:global([data-theme="light"]) .template-context-menu {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(31, 78, 121, 0.12);
}

.template-context-action {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 10px 12px;
  border-radius: 8px;
  text-align: left;
  font-size: 0.9rem;
  cursor: pointer;
}

.template-context-action:hover {
  background: var(--sidenav-hover, rgba(255, 255, 255, 0.06));
}

.template-context-action:disabled {
  opacity: 0.45;
  cursor: default;
}

.template-context-action:disabled:hover {
  background: transparent;
}

.session-sidenav-divider {
  width: calc(100% - 24px);
  height: 1px;
  margin: 0 auto 16px auto;
  background: var(--sidenav-divider, #e5e7eb);
}

.session-sidenav-bottom {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 12px;
}

.session-sidenav-action {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sidenav-action, #4b5563);
  font-size: 0.95rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.session-sidenav-action svg {
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.session-sidenav-action:hover {
  background: var(--sidenav-hover, rgba(0, 0, 0, 0.04));
  color: var(--sidenav-action-hover, #111827);
}

.session-sidenav-action:hover svg {
  opacity: 1;
}

.session-sidenav-action.active {
  background: var(--accent-light, rgba(59, 130, 246, 0.1));
  color: var(--accent, #2563eb);
}

.session-sidenav-action.active svg {
  opacity: 1;
  stroke: var(--accent, #2563eb);
}

@media (max-width: 768px) {
  .session-sidenav {
    display: none;
  }

  .session-sidenav-resizer {
    display: none;
  }
}
</style>
