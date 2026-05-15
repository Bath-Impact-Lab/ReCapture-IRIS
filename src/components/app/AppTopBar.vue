<template>
  <nav ref="titlebarRef" class="navbar titlebar" @dblclick="handleTitlebarDoubleClick">
    <div class="brand">
      <button class="brand-button" type="button" @click="emit('navigate-home')" :disabled="homeDisabled" :aria-label="`Go to ${appTitle} home`">
        <img
          v-if="!logoError"
          :src="logoSrc"
          alt=""
          class="brand-logo"
          @error="logoError = true"
        />
        <span class="brand-text">{{ appTitle }}</span>
      </button>
    </div>

    <div class="nav-right">
      <div class="menu-right">
        <button class="btn-icon" @click="emit('toggle-settings')" aria-label="Settings" :disabled="settingsDisabled" title="Settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>
      
      <div v-if="showWindowControls" class="window-controls">
        <button class="window-control" type="button" aria-label="Minimize window" @click="minimizeWindow">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 6.5H10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="window-control" type="button" :aria-label="isMaximized ? 'Restore window' : 'Maximize window'" @click="toggleMaximizeWindow">
          <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="2.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          <svg v-else width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M4 2.5H9.5V8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7.5 4H2.5V9.5H7.5V4Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="window-control window-control-close" type="button" aria-label="Close window" @click="closeWindow">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M3 3L9 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            <path d="M9 3L3 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

interface Props {
  appTitle: string;
  homeDisabled?: boolean;
  settingsDisabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  homeDisabled: false,
  settingsDisabled: false,
});

const emit = defineEmits<{
  'toggle-settings': [];
  'navigate-home': [];
}>();

const logoError = ref(false);
const logoSrc = computed(() => `/assets/logo/${props.appTitle.split(' ')[0].toLowerCase()}.png`);
const isMaximized = ref(false);
const showWindowControls = typeof window !== 'undefined' && !!window.electronAPI?.minimizeWindow;
const titlebarRef = ref<HTMLElement | null>(null);

let stopWindowStateListener: (() => void) | null = null;
let titlebarResizeObserver: ResizeObserver | null = null;

function syncTitlebarHeight() {
  const height = titlebarRef.value?.getBoundingClientRect().height;
  if (!height) return;
  document.documentElement.style.setProperty('--app-topbar-height', `${Math.round(height)}px`);
}

onMounted(async () => {
  syncTitlebarHeight();
  if (typeof ResizeObserver !== 'undefined' && titlebarRef.value) {
    titlebarResizeObserver = new ResizeObserver(() => syncTitlebarHeight());
    titlebarResizeObserver.observe(titlebarRef.value);
  }

  if (!window.electronAPI?.isWindowMaximized) return;
  const state = await window.electronAPI.isWindowMaximized();
  isMaximized.value = state.isMaximized;
  stopWindowStateListener = window.electronAPI.onWindowStateChange?.((data) => {
    isMaximized.value = data.isMaximized;
  }) ?? null;
});

onBeforeUnmount(() => {
  stopWindowStateListener?.();
  stopWindowStateListener = null;
  titlebarResizeObserver?.disconnect();
  titlebarResizeObserver = null;
});

async function minimizeWindow() {
  await window.electronAPI?.minimizeWindow?.();
}

async function toggleMaximizeWindow() {
  const state = await window.electronAPI?.toggleMaximizeWindow?.();
  if (state) {
    isMaximized.value = state.isMaximized;
  }
}

async function closeWindow() {
  await window.electronAPI?.closeWindow?.();
}

function handleTitlebarDoubleClick(event: MouseEvent) {
  if (!showWindowControls) return;
  if (event.target instanceof HTMLElement && event.target.closest('button')) return;
  void toggleMaximizeWindow();
}
</script>

<style scoped>
.titlebar {
  -webkit-app-region: drag;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px 0 20px;
  background: var(--bg); /* Blend seamlessly with app background */
  border-bottom: 1px solid rgba(0, 0, 0, 0.8); /* Ultra-subtle border */ 
}

[data-theme="light"] .titlebar {
  background: var(--bg-elev);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1); 
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand,
.brand-button {
  -webkit-app-region: no-drag;
}

.brand-button {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.brand-button:disabled {
  cursor: default;
}

.brand-text {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--fg) !important;
  opacity: 0.9;
}

.brand-logo {
  height: 20px;
  width: auto;
  object-fit: contain;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.menu-right,
.btn-icon,
.window-controls,
.window-control {
  -webkit-app-region: no-drag;
}

/* Minimalist Icon Button */
.btn-icon {
  background: transparent;
  border: none;
  color: var(--fg);
  opacity: 0.5;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 6px;
  transition: opacity 0.2s ease, background-color 0.2s ease;
}

.btn-icon:hover {
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.05);
}

[data-theme="light"] .btn-icon:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.btn-icon:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}

/* Minimalist Window Controls */
.window-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.window-control {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--fg);
  opacity: 0.4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 6px;
  transition: opacity 0.2s ease, background-color 0.2s ease;
}

.window-control:hover {
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.08);
}

.window-control-close:hover {
  background-color: #e03131;
  color: #ffffff;
  opacity: 1;
}

[data-theme="light"] .window-control:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

[data-theme="light"] .window-control-close:hover {
  background-color: #e03131;
  color: #ffffff;
}

@media (max-width: 768px) {
  .titlebar {
    padding: 0 10px 0 14px;
  }
  
  .window-control {
    width: 28px;
    height: 28px;
  }
}
</style>
