<template>
  <Transition name="fade">
    <div v-if="props.showSettings" class="modal-overlay" @click.self="settings">
      <div class="modal-content fade-up">
        <button class="modal-close" @click="settings">×</button>

        <div class="modal-header">
          <h2 class="modal-title">Settings</h2>
          <p class="modal-subtitle">Manage your application preferences</p>
        </div>

        <div class="settings-body">
          <section class="settings-group appearance-section">
            <label>Appearance</label>
            <div class="theme-toggle-row">
              <span class="theme-label">
                <svg v-if="props.currentTheme === 'dark'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                {{ props.currentTheme === 'dark' ? 'Dark Mode' : 'Light Mode' }}
              </span>
              <button class="theme-toggle" :class="{ light: props.currentTheme === 'light' }" @click="toggleTheme" :aria-label="props.currentTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'">
                <span class="theme-toggle-thumb"></span>
              </button>
            </div>
          </section>

          <section class="settings-group">
            <label>Project Presets</label>

            <div class="preset-layout">
              <aside class="preset-pane preset-pane-left">
                <div class="pane-header">
                  <h3 class="pane-title">Project Presets</h3>
                  <p class="pane-subtitle">Presets are stored locally and can be reused across projects.</p>
                </div>

                <div v-if="props.hasCurrentProject" class="field-group">
                  <label class="field-label">Current project preset</label>
                  <select :value="projectPresetDraft ?? ''" class="settings-select" @change="handleProjectPresetChange">
                    <option value="">Use app default</option>
                    <option v-for="preset in presetDraft.presets" :key="preset.id" :value="preset.id">
                      {{ preset.name }}
                    </option>
                  </select>
                  <p class="field-help">This preset is currently applied to the active project.</p>
                </div>

                <div class="create-row">
                  <button class="btn-secondary" type="button" @click="openCreatePreset">
                    New Preset
                  </button>
                </div>

                <div v-if="showCreatePreset" class="create-panel">
                  <label class="field-label">Preset name</label>
                  <input
                    v-model="createPresetName"
                    type="text"
                    class="settings-input"
                    placeholder="e.g. Standard Capture"
                    @keyup.enter="createPresetFromDialog"
                  />
                  <label class="checkbox-row">
                    <input v-model="createPresetDuplicateSelected" type="checkbox" />
                    Duplicate current preset
                  </label>
                  <div class="create-actions">
                    <button class="btn-secondary" type="button" @click="showCreatePreset = false">Cancel</button>
                    <button class="btn-primary" type="button" @click="createPresetFromDialog">Create preset</button>
                  </div>
                </div>

                <div v-if="presetDraft.presets.length === 0" class="empty-state compact">
                  <p>No presets yet.</p>
                  <button class="btn-secondary" type="button" @click="openCreatePreset">Create your first preset</button>
                </div>

                <div v-else class="preset-list">
                  <div
                    v-for="preset in presetDraft.presets"
                    :key="preset.id"
                    class="preset-row"
                    :class="{
                      'preset-row-selected': selectedPresetId === preset.id,
                      'preset-row-current': isCurrentPreset(preset.id),
                    }"
                    @click="selectPreset(preset.id)"
                  >
                    <div class="preset-row-main">
                      <div class="preset-row-title">{{ preset.name }}</div>
                      <div class="preset-row-meta">{{ templateCountLabel(preset.templates.length) }}</div>
                      <div class="preset-row-badges">
                        <span v-if="isDefaultPreset(preset.id)" class="badge">Default</span>
                        <span v-if="isCurrentPreset(preset.id)" class="badge">Current</span>
                        <span v-if="selectedPresetId === preset.id" class="badge">Selected</span>
                      </div>
                    </div>

                    <div class="menu-wrap" @click.stop>
                      <button class="btn-icon" type="button" @click="togglePresetMenu(preset.id)">•••</button>
                      <div v-if="openPresetMenuId === preset.id" class="menu-popover">
                        <button type="button" @click="renamePresetFromList(preset.id)">Rename</button>
                        <button type="button" @click="duplicatePreset(preset.id)">Duplicate</button>
                        <button
                          v-if="props.hasCurrentProject"
                          type="button"
                          @click="setCurrentPreset(preset.id)"
                        >
                          Set as current project preset
                        </button>
                        <button type="button" @click="setDefaultPreset(preset.id)">Set as app default</button>
                        <button type="button" class="danger" :disabled="presetDraft.presets.length <= 1" @click="deletePreset(preset.id)">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>

              <div class="preset-pane preset-pane-right">
                <div v-if="selectedPreset" class="detail-shell">
                  <div class="detail-header">
                    <div class="detail-main">
                      <input
                        v-if="isRenamingSelected"
                        v-model="renameDraft"
                        type="text"
                        class="settings-input detail-name-input"
                        @keyup.enter="commitSelectedRename"
                      />
                      <h3 v-else class="detail-title">{{ selectedPreset.name }}</h3>
                      <p class="detail-meta">
                        {{ templateCountLabel(selectedPreset.templates.length) }}
                        <span v-if="isDefaultPreset(selectedPreset.id)"> · App default</span>
                        <span v-if="isCurrentPreset(selectedPreset.id)"> · Used by current project</span>
                      </p>
                    </div>

                    <div class="detail-actions">
                      <button class="btn-secondary" type="button" @click="toggleSelectedRename">
                        {{ isRenamingSelected ? 'Done' : 'Rename' }}
                      </button>
                      <button class="btn-secondary" type="button" @click="duplicatePreset(selectedPreset.id)">
                        Duplicate
                      </button>
                      <button class="btn-secondary" type="button" :disabled="isDefaultPreset(selectedPreset.id)" @click="setDefaultPreset(selectedPreset.id)">
                        Set as default
                      </button>
                      <div class="menu-wrap">
                        <button class="btn-icon" type="button" @click="togglePresetMenu(selectedPreset.id)">•••</button>
                        <div v-if="openPresetMenuId === selectedPreset.id" class="menu-popover menu-popover-right">
                          <button
                            type="button"
                            class="danger"
                            :disabled="presetDraft.presets.length <= 1"
                            @click="deletePreset(selectedPreset.id)"
                          >
                            Delete preset
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="template-section">
                    <div class="template-header">
                      <div>
                        <h4 class="template-title">Session Templates</h4>
                        <p class="template-subtitle">Templates in this preset will be available when starting a session.</p>
                      </div>
                      <button class="btn-secondary" type="button" @click="addTemplateToSelectedPreset">Add Template</button>
                    </div>

                    <div v-if="selectedPreset.templates.length === 0" class="empty-state">
                      <p class="empty-title">No templates yet</p>
                      <p class="empty-subtitle">Add a session template to define this preset workflow.</p>
                      <button class="btn-secondary" type="button" @click="addTemplateToSelectedPreset">Add Template</button>
                    </div>

                    <div v-else class="template-list">
                      <div
                        v-for="(template, templateIndex) in selectedPreset.templates"
                        :key="template.id"
                        class="template-row"
                      >
                        <span class="drag-handle">≡</span>
                        <input
                          v-model="template.name"
                          type="text"
                          class="settings-input template-name-input"
                          placeholder="Template name"
                        />
                        <div class="menu-wrap">
                          <button class="btn-icon" type="button" @click="toggleTemplateMenu(template.id)">•••</button>
                          <div v-if="openTemplateMenuId === template.id" class="menu-popover menu-popover-right">
                            <button type="button" :disabled="templateIndex === 0" @click="moveTemplate(templateIndex, -1)">Move up</button>
                            <button type="button" :disabled="templateIndex === selectedPreset.templates.length - 1" @click="moveTemplate(templateIndex, 1)">Move down</button>
                            <button type="button" class="danger" @click="deleteTemplate(templateIndex)">Delete</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-else class="empty-state">
                  <p class="empty-title">No preset selected</p>
                  <p class="empty-subtitle">Select a preset from the library to inspect and edit it.</p>
                </div>
              </div>
            </div>
          </section>

          <section class="settings-group">
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
              <button class="btn-primary" @click="handleLicenseSubmit" :disabled="isChecking || !licenseKeyInput">
                <span v-if="isChecking">Checking...</span>
                <span v-else>{{ isValidLicense ? 'Update' : 'Activate' }}</span>
              </button>
            </div>
            <Transition name="fade">
              <div v-if="licenseError" class="license-msg error">{{ licenseError }}</div>
              <div v-else-if="isValidLicense" class="license-msg success">License active and valid</div>
            </Transition>
          </section>

          <div v-if="isValidLicense" class="settings-actions">
            <button class="btn-secondary danger-outline" @click="licenseLogout">Deactivate License</button>
          </div>

          <div v-if="!isPaidLicense" class="settings-footer">
            <div class="divider"><span>Support Us</span></div>
            <button class="btn-buy" @click="buyLicense">
              Get a License
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
            </button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-primary" type="button" @click="handleSavePresetChanges">Save Presets</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useLicense } from './../lib/useLicense';
import type { ProjectPresetStore } from '@/lib/useProjectPresets';

interface Props {
  showSettings: boolean,
  currentTheme?: 'dark' | 'light',
  presetStore: ProjectPresetStore,
  currentProjectPresetId?: string | null,
  hasCurrentProject?: boolean,
}

const props = withDefaults(defineProps<Props>(), {
  currentTheme: 'light',
  currentProjectPresetId: null,
  hasCurrentProject: false,
});

const emit = defineEmits<{
  settings: [boolean]
  licenseKey: [string]
  setTheme: ['dark' | 'light']
  'save-presets': [{ store: ProjectPresetStore; projectPresetId: string | null }]
}>()

function createId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clonePresetStore(store: ProjectPresetStore): ProjectPresetStore {
  return {
    defaultPresetId: store.defaultPresetId,
    presets: store.presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      templates: preset.templates.map((template) => ({
        id: template.id,
        name: template.name,
      })),
    })),
  };
}

const presetDraft = ref<ProjectPresetStore>(clonePresetStore(props.presetStore));
const projectPresetDraft = ref<string | null>(props.currentProjectPresetId);
const selectedPresetId = ref<string | null>(null);

const showCreatePreset = ref(false);
const createPresetName = ref('');
const createPresetDuplicateSelected = ref(true);

const openPresetMenuId = ref<string | null>(null);
const openTemplateMenuId = ref<string | null>(null);
const isRenamingSelected = ref(false);
const renameDraft = ref('');

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

const selectedPreset = computed(() =>
  presetDraft.value.presets.find((preset) => preset.id === selectedPresetId.value) ?? null
);

const isPaidLicense = computed(() => {
  if (!isValidLicense.value) return false;
  const plan = planType.value?.toLowerCase();
  return plan === 'creator' || plan === 'studio';
});

function isDefaultPreset(presetId: string) {
  return presetDraft.value.defaultPresetId === presetId;
}

function isCurrentPreset(presetId: string) {
  if (!props.hasCurrentProject) return false;
  const effectiveCurrentId = projectPresetDraft.value ?? presetDraft.value.defaultPresetId ?? null;
  return effectiveCurrentId === presetId;
}

function templateCountLabel(count: number) {
  return `${count} template${count === 1 ? '' : 's'}`;
}

function ensureSelectedPreset() {
  if (presetDraft.value.presets.length === 0) {
    selectedPresetId.value = null;
    return;
  }

  const exists = presetDraft.value.presets.some((preset) => preset.id === selectedPresetId.value);
  if (!exists) {
    selectedPresetId.value = presetDraft.value.presets[0].id;
  }
}

function resetLocalStateFromProps() {
  presetDraft.value = clonePresetStore(props.presetStore);
  projectPresetDraft.value = props.currentProjectPresetId;
  selectedPresetId.value = props.currentProjectPresetId ?? presetDraft.value.presets[0]?.id ?? null;
  showCreatePreset.value = false;
  createPresetName.value = '';
  createPresetDuplicateSelected.value = true;
  isRenamingSelected.value = false;
  renameDraft.value = '';
  openPresetMenuId.value = null;
  openTemplateMenuId.value = null;
  ensureSelectedPreset();
}

watch(() => props.showSettings, (isOpen) => {
  if (isOpen) {
    resetLocalStateFromProps();
  }
});

watch(() => props.presetStore, () => {
  if (props.showSettings) {
    resetLocalStateFromProps();
  }
}, { deep: true });

watch(() => props.currentProjectPresetId, (value) => {
  if (!props.showSettings) return;
  projectPresetDraft.value = value;
  if (!selectedPreset.value && value) {
    selectedPresetId.value = value;
  }
});

watch(storedLicenseKey, (value) => {
  licenseKeyInput.value = value ?? '';
}, { immediate: true });

function closeMenus() {
  openPresetMenuId.value = null;
  openTemplateMenuId.value = null;
}

onMounted(() => {
  window.addEventListener('click', closeMenus);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', closeMenus);
});

function settings() {
  emit('settings', !props.showSettings)
}

function toggleTheme() {
  const next = props.currentTheme === 'dark' ? 'light' : 'dark';
  emit('setTheme', next);
}

function selectPreset(presetId: string) {
  selectedPresetId.value = presetId;
  isRenamingSelected.value = false;
  openPresetMenuId.value = null;
}

function openCreatePreset() {
  showCreatePreset.value = true;
  createPresetName.value = '';
  createPresetDuplicateSelected.value = true;
}

function duplicatePreset(sourcePresetId: string) {
  const source = presetDraft.value.presets.find((preset) => preset.id === sourcePresetId);
  if (!source) return;

  const copyId = createId('preset');
  const duplicate = {
    id: copyId,
    name: `${source.name} Copy`,
    templates: source.templates.map((template) => ({
      id: createId('template'),
      name: template.name,
    })),
  };

  presetDraft.value.presets.push(duplicate);
  selectedPresetId.value = duplicate.id;
  openPresetMenuId.value = null;
}

function createPresetFromDialog() {
  const name = createPresetName.value.trim() || `Preset ${presetDraft.value.presets.length + 1}`;
  const source = createPresetDuplicateSelected.value ? selectedPreset.value : null;

  const preset = {
    id: createId('preset'),
    name,
    templates: source
      ? source.templates.map((template) => ({
        id: createId('template'),
        name: template.name,
      }))
      : [],
  };

  presetDraft.value.presets.push(preset);
  if (!presetDraft.value.defaultPresetId) {
    presetDraft.value.defaultPresetId = preset.id;
  }
  selectedPresetId.value = preset.id;
  showCreatePreset.value = false;
  openPresetMenuId.value = null;
}

function setCurrentPreset(presetId: string) {
  projectPresetDraft.value = presetId;
  openPresetMenuId.value = null;
}

function setDefaultPreset(presetId: string) {
  presetDraft.value.defaultPresetId = presetId;
  openPresetMenuId.value = null;
}

function deletePreset(presetId: string) {
  if (presetDraft.value.presets.length <= 1) return;
  if (!window.confirm('Delete this preset?')) return;

  const nextPresets = presetDraft.value.presets.filter((preset) => preset.id !== presetId);
  presetDraft.value.presets = nextPresets;

  if (presetDraft.value.defaultPresetId === presetId) {
    presetDraft.value.defaultPresetId = nextPresets[0]?.id ?? null;
  }

  if (projectPresetDraft.value === presetId) {
    projectPresetDraft.value = presetDraft.value.defaultPresetId ?? nextPresets[0]?.id ?? null;
  }

  if (selectedPresetId.value === presetId) {
    selectedPresetId.value = nextPresets[0]?.id ?? null;
  }

  ensureSelectedPreset();
  openPresetMenuId.value = null;
}

function renamePresetFromList(presetId: string) {
  selectPreset(presetId);
  renameDraft.value = selectedPreset.value?.name ?? '';
  isRenamingSelected.value = true;
}

function toggleSelectedRename() {
  if (!selectedPreset.value) return;

  if (!isRenamingSelected.value) {
    renameDraft.value = selectedPreset.value.name;
    isRenamingSelected.value = true;
    return;
  }

  commitSelectedRename();
}

function commitSelectedRename() {
  if (!selectedPreset.value) return;
  const nextName = renameDraft.value.trim();
  if (nextName.length > 0) {
    selectedPreset.value.name = nextName;
  }
  isRenamingSelected.value = false;
}

function addTemplateToSelectedPreset() {
  if (!selectedPreset.value) return;
  selectedPreset.value.templates.push({
    id: createId('template'),
    name: `Template ${selectedPreset.value.templates.length + 1}`,
  });
}

function moveTemplate(templateIndex: number, direction: -1 | 1) {
  if (!selectedPreset.value) return;
  const nextIndex = templateIndex + direction;
  if (nextIndex < 0 || nextIndex >= selectedPreset.value.templates.length) return;

  const [moved] = selectedPreset.value.templates.splice(templateIndex, 1);
  selectedPreset.value.templates.splice(nextIndex, 0, moved);
  openTemplateMenuId.value = null;
}

function deleteTemplate(templateIndex: number) {
  if (!selectedPreset.value) return;
  selectedPreset.value.templates.splice(templateIndex, 1);
  openTemplateMenuId.value = null;
}

function togglePresetMenu(presetId: string) {
  openTemplateMenuId.value = null;
  openPresetMenuId.value = openPresetMenuId.value === presetId ? null : presetId;
}

function toggleTemplateMenu(templateId: string) {
  openPresetMenuId.value = null;
  openTemplateMenuId.value = openTemplateMenuId.value === templateId ? null : templateId;
}

function handleProjectPresetChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value || null;
  projectPresetDraft.value = value;
}

function normalizePresetDraft(store: ProjectPresetStore): ProjectPresetStore {
  return {
    defaultPresetId: store.defaultPresetId,
    presets: store.presets.map((preset, presetIndex) => ({
      id: preset.id,
      name: preset.name.trim() || `Preset ${presetIndex + 1}`,
      templates: preset.templates.map((template, templateIndex) => ({
        id: template.id,
        name: template.name.trim() || `Template ${templateIndex + 1}`,
      })),
    })),
  };
}

function handleSavePresetChanges() {
  if (isRenamingSelected.value) {
    commitSelectedRename();
  }

  const normalized = normalizePresetDraft(clonePresetStore(presetDraft.value));
  presetDraft.value = clonePresetStore(normalized);
  emit('save-presets', {
    store: normalized,
    projectPresetId: projectPresetDraft.value,
  });
}

async function handleLicenseSubmit() {
  await validateLicense(licenseKeyInput.value);
  emit('licenseKey', licenseKeyInput.value)
}

async function buyLicense() {
  const url = import.meta.env.VITE_LICENSE_URL || 'https://embodi.ecolizard.com/#pricing';
  if (!(window as any).electronAPI?.openExternal) return;

  try {
    await (window as any).electronAPI.openExternal(url);
  } catch {
    // Ignore open failures; UI already communicates action intent.
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: var(--modal-bg);
  border: 1px solid var(--modal-border);
  border-radius: 20px;
  width: min(95vw, 1060px);
  height: min(80vh, 920px);
  padding: 28px;
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.42);
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  border: none;
  background: transparent;
  color: var(--close-btn-color);
  font-size: 24px;
  cursor: pointer;
}

.modal-header {
  margin-bottom: 20px;
}

.modal-title {
  margin: 0 0 4px 0;
  font-size: 28px;
  color: var(--modal-title);
}

.modal-subtitle {
  margin: 0;
  color: var(--modal-subtitle);
  font-size: 14px;
}

.settings-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: auto;
  padding-right: 4px;
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-group > label {
  font-size: 12px;
  font-weight: 700;
  color: var(--label-color);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.appearance-section {
  max-width: 380px;
}

.theme-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
}

.theme-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--fg);
}

.theme-toggle {
  position: relative;
  width: 48px;
  height: 26px;
  border: none;
  border-radius: 13px;
  background: var(--theme-toggle-track);
  cursor: pointer;
  padding: 0;
}

.theme-toggle.light {
  background: linear-gradient(135deg, #2e86c1, #1f4e79);
}

.theme-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--theme-toggle-thumb);
  transition: transform 0.25s ease, background 0.25s ease;
}

.theme-toggle.light .theme-toggle-thumb {
  transform: translateX(22px);
  background: #ffffff;
}

.preset-layout {
  display: grid;
  grid-template-columns: minmax(280px, 38%) minmax(420px, 62%);
  gap: 18px;
  min-height: 380px;
}

.preset-pane {
  border: 1px solid var(--input-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:global([data-theme="light"]) .preset-pane {
  background: rgba(31, 78, 121, 0.03);
}

.preset-pane-left {
  padding: 16px;
  gap: 12px;
  overflow: auto;
}

.preset-pane-right {
  padding: 16px;
  overflow: auto;
}

.pane-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pane-title {
  margin: 0;
  font-size: 16px;
  color: var(--fg);
}

.pane-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
}

.field-help {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}

.create-row {
  display: flex;
  justify-content: flex-start;
}

.create-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
}

:global([data-theme="light"]) .create-panel {
  background: rgba(31, 78, 121, 0.03);
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg);
}

.create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  cursor: pointer;
  background: transparent;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.preset-row:hover {
  border-color: rgba(107, 230, 117, 0.35);
  background: rgba(107, 230, 117, 0.04);
}

.preset-row-selected {
  border-color: rgba(107, 230, 117, 0.45);
  background: rgba(107, 230, 117, 0.08);
}

.preset-row-current {
  box-shadow: inset 3px 0 0 var(--accent);
}

.preset-row-main {
  min-width: 0;
}

.preset-row-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-row-meta {
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted);
}

.preset-row-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border: 1px solid var(--input-border);
  border-radius: 999px;
  padding: 3px 8px;
  color: var(--muted);
}

.detail-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.detail-main {
  min-width: 0;
}

.detail-title {
  margin: 0;
  font-size: 22px;
  color: var(--fg);
}

.detail-name-input {
  max-width: 420px;
}

.detail-meta {
  margin: 6px 0 0 0;
  font-size: 13px;
  color: var(--muted);
}

.detail-actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.template-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.template-title {
  margin: 0;
  font-size: 15px;
  color: var(--fg);
}

.template-subtitle {
  margin: 4px 0 0 0;
  font-size: 12px;
  color: var(--muted);
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.template-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.06);
}

:global([data-theme="light"]) .template-row {
  background: rgba(31, 78, 121, 0.03);
}

.drag-handle {
  color: var(--muted);
  font-size: 15px;
  user-select: none;
}

.template-name-input {
  font-size: 13px;
  padding: 10px 12px;
}

.settings-input,
.settings-select,
.license-input {
  width: 100%;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--input-color);
  padding: 10px 12px;
  font-size: 14px;
}

.settings-select {
  appearance: none;
}

.btn-secondary,
.btn-primary,
.btn-icon {
  border-radius: 9px;
  padding: 9px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid var(--input-border);
}

.btn-secondary {
  background: transparent;
  color: var(--fg);
}

.btn-secondary:hover {
  border-color: var(--accent);
}

.btn-primary {
  background: var(--accent);
  border-color: transparent;
  color: #0b0f14;
}

.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-icon {
  background: transparent;
  color: var(--muted);
  min-width: 34px;
  padding: 8px 10px;
}

.btn-icon:hover {
  color: var(--fg);
}

.menu-wrap {
  position: relative;
}

.menu-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 220px;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--modal-bg);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
  z-index: 40;
  padding: 6px;
  display: flex;
  flex-direction: column;
}

.menu-popover button {
  border: none;
  background: transparent;
  text-align: left;
  padding: 9px 10px;
  border-radius: 8px;
  color: var(--fg);
  font-size: 13px;
  cursor: pointer;
}

.menu-popover button:hover {
  background: var(--sidenav-hover, rgba(0, 0, 0, 0.06));
}

.menu-popover button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.menu-popover .danger {
  color: #ff8b8b;
}

.empty-state {
  border: 1px dashed var(--input-border);
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.empty-state.compact {
  padding: 12px;
}

.empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--fg);
}

.empty-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

.license-input-wrapper {
  display: flex;
  gap: 10px;
}

.license-msg {
  font-size: 13px;
}

.license-msg.error {
  color: #ff9a5c;
}

.license-msg.success {
  color: var(--accent);
}

.settings-actions {
  display: flex;
}

.danger-outline {
  color: #ff8b8b;
  border-color: rgba(255, 59, 48, 0.35);
}

.settings-footer {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.divider {
  display: flex;
  align-items: center;
  color: var(--divider-color);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--divider-line);
}

.divider::before {
  margin-right: 12px;
}

.divider::after {
  margin-left: 12px;
}

.btn-buy {
  background: rgba(107, 230, 117, 0.1);
  border: 1px solid rgba(107, 230, 117, 0.24);
  color: #6be675;
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.btn-buy:hover {
  background: rgba(107, 230, 117, 0.15);
  border-color: #6be675;
}

:global([data-theme="light"]) .btn-buy:hover {
  background: rgba(46, 134, 193, 0.15);
  border-color: #2e86c1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--input-border);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-up {
  animation: fadeUp 0.28s ease-out;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 960px) {
  .modal-content {
    width: min(96vw, 900px);
    height: min(86vh, 960px);
    padding: 20px;
  }

  .preset-layout {
    grid-template-columns: 1fr;
  }

  .license-input-wrapper {
    flex-direction: column;
  }

  .modal-footer {
    justify-content: stretch;
  }

  .modal-footer .btn-primary {
    width: 100%;
  }
}
</style>
