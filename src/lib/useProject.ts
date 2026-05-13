import { computed, ref } from 'vue';

export type ProjectView = 'capture' | 'mocap' | 'analysis';
export type ProjectTheme = 'dark' | 'light';

export interface ProjectSettings {
  theme: ProjectTheme;
  recordingsDir: string | null;
  presetId: string | null;
}

export interface ProjectWorkspaceState {
  activeView: ProjectView;
  selectedCameraIds: string[];
  selectedRecordingPath: string | null;
  resolution: string;
  fps: number;
  rotation: number;
  personCount: string | null;
  outputOption: string;
}

export interface ProjectSession {
  id: string;
  name: string;
  date: string;
  completed: boolean;
  recordingPath: string | null;
  templateId: string | null;
  exercises: string[];
}

export interface ProjectParticipant {
  id: string;
  name: string;
  sessions: ProjectSession[];
}

export interface ProjectFile {
  format: 'recapture-project';
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
  workspace: ProjectWorkspaceState;
  participants: ProjectParticipant[];
}

export interface ProjectDocument extends ProjectFile {
  path: string | null;
}

export interface RecentProjectEntry {
  path: string;
  name: string;
  lastOpenedAt: string;
}

type ProjectUpdate =
  Partial<Omit<ProjectFile, 'settings' | 'workspace' | 'format' | 'version'>> & {
    settings?: Partial<ProjectSettings>;
    workspace?: Partial<ProjectWorkspaceState>;
  };

const PROJECT_STORAGE_KEY = 'recapture.recent-projects';
const PROJECT_MOTIONS_DIRECTORY_NAME = 'motions';
const currentProject = ref<ProjectDocument | null>(null);
const recentProjects = ref<RecentProjectEntry[]>(loadRecentProjects());

function nowIso() {
  return new Date().toISOString();
}

function createProjectId() {
  return globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferProjectName(filePath: string | null | undefined) {
  if (!filePath) return 'Untitled Project';
  const name = filePath.split(/[\\/]/).pop() ?? 'Untitled Project';
  return name.replace(/\.json$/i, '').replace(/\.recapture$/i, '');
}

function getProjectMotionsDir(filePath: string | null | undefined) {
  if (!filePath) return null;
  const projectDir = filePath.replace(/[\\/][^\\/]+$/, '');
  if (!projectDir) return null;
  const separator = filePath.includes('\\') ? '\\' : '/';
  return `${projectDir}${separator}${PROJECT_MOTIONS_DIRECTORY_NAME}`;
}

function sanitizeProjectTheme(theme: unknown): ProjectTheme {
  return theme === 'dark' ? 'dark' : 'light';
}

function sanitizeProjectView(view: unknown): ProjectView {
  return view === 'mocap' || view === 'analysis' ? view : 'capture';
}

function sanitizeProjectParticipants(participants: unknown): ProjectParticipant[] {
  if (!Array.isArray(participants) || participants.length === 0) {
    return [{
      id: 'participant-1',
      name: 'Participant 1',
      sessions: [],
    }];
  }

  return participants.map((participant, index) => {
    const maybeParticipant = participant as Partial<ProjectParticipant> | null | undefined;
    const name = maybeParticipant?.name?.trim() || `Participant ${index + 1}`;

    return {
      id: maybeParticipant?.id || `participant-${index + 1}`,
      name,
      sessions: Array.isArray(maybeParticipant?.sessions)
        ? maybeParticipant!.sessions.map((session, sessionIndex) => {
          const maybeSession = session as Partial<ProjectSession> | null | undefined;
          const recordingPath = typeof maybeSession?.recordingPath === 'string' && maybeSession.recordingPath.trim()
            ? maybeSession.recordingPath
            : null;

          return {
            id: maybeSession?.id || `${name.toLowerCase().replace(/\s+/g, '-')}-session-${sessionIndex + 1}`,
            name: maybeSession?.name?.trim() || maybeSession?.date || 'Untitled Session',
            date: maybeSession?.date || nowIso(),
            completed: recordingPath !== null,
            recordingPath,
            templateId: typeof maybeSession?.templateId === 'string' ? maybeSession.templateId : null,
            exercises: Array.isArray(maybeSession?.exercises)
              ? maybeSession.exercises.filter((value): value is string => typeof value === 'string')
              : [],
          };
        })
        : [],
    };
  });
}

function sanitizeProjectFile(raw: Partial<ProjectFile> | null | undefined, filePath: string | null = null): ProjectDocument {
  const createdAt = raw?.createdAt ?? nowIso();
  const updatedAt = raw?.updatedAt ?? createdAt;

  return {
    format: 'recapture-project',
    version: 1,
    id: raw?.id ?? createProjectId(),
    name: raw?.name?.trim() || inferProjectName(filePath),
    createdAt,
    updatedAt,
    settings: {
      theme: sanitizeProjectTheme(raw?.settings?.theme),
      recordingsDir: getProjectMotionsDir(filePath) ?? raw?.settings?.recordingsDir ?? null,
      presetId: typeof raw?.settings?.presetId === 'string' ? raw.settings.presetId : null,
    },
    workspace: {
      activeView: sanitizeProjectView(raw?.workspace?.activeView),
      selectedCameraIds: Array.isArray(raw?.workspace?.selectedCameraIds)
        ? raw!.workspace!.selectedCameraIds.filter((value): value is string => typeof value === 'string')
        : [],
      selectedRecordingPath: raw?.workspace?.selectedRecordingPath ?? null,
      resolution: raw?.workspace?.resolution ?? '1920x1080',
      fps: typeof raw?.workspace?.fps === 'number' ? raw.workspace.fps : 30,
      rotation: typeof raw?.workspace?.rotation === 'number' ? raw.workspace.rotation : 0,
      personCount: raw?.workspace?.personCount ?? 'Single Person',
      outputOption: raw?.workspace?.outputOption ?? 'Filesystem',
    },
    participants: sanitizeProjectParticipants(raw?.participants),
    path: filePath,
  };
}

function toProjectFile(project: ProjectDocument | ProjectFile): ProjectFile {
  return {
    format: 'recapture-project',
    version: 1,
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    settings: {
      theme: project.settings.theme,
      recordingsDir: project.settings.recordingsDir,
      presetId: project.settings.presetId,
    },
    workspace: {
      activeView: project.workspace.activeView,
      selectedCameraIds: [...project.workspace.selectedCameraIds],
      selectedRecordingPath: project.workspace.selectedRecordingPath,
      resolution: project.workspace.resolution,
      fps: project.workspace.fps,
      rotation: project.workspace.rotation,
      personCount: project.workspace.personCount,
      outputOption: project.workspace.outputOption,
    },
    participants: project.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      sessions: participant.sessions.map((session) => ({
        id: session.id,
        name: session.name,
        date: session.date,
        completed: typeof session.recordingPath === 'string' && session.recordingPath.trim().length > 0,
        recordingPath: session.recordingPath,
        templateId: session.templateId,
        exercises: [...session.exercises],
      })),
    })),
  };
}

function loadRecentProjects(): RecentProjectEntry[] {
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RecentProjectEntry =>
      !!entry &&
      typeof entry.path === 'string' &&
      typeof entry.name === 'string' &&
      typeof entry.lastOpenedAt === 'string'
    );
  } catch {
    return [];
  }
}

function removeRecentProject(filePath: string) {
  const nextProjects = recentProjects.value.filter((entry) => entry.path !== filePath);
  if (nextProjects.length === recentProjects.value.length) return;
  recentProjects.value = nextProjects;
  persistRecentProjects();
}

function persistRecentProjects() {
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(recentProjects.value));
  } catch {
    // Ignore persistence failures in non-persistent environments.
  }
}

let recentProjectSyncPromise: Promise<RecentProjectEntry[]> | null = null;
let hasStartedRecentProjectSync = false;

async function syncRecentProjectsWithFilesystem() {
  if (recentProjectSyncPromise) {
    return recentProjectSyncPromise;
  }

  recentProjectSyncPromise = (async () => {
    if (!window.ipc?.projectPruneRecents) {
      return recentProjects.value;
    }

    const result = await window.ipc.projectPruneRecents(recentProjects.value);
    const nextProjects = Array.isArray(result?.entries)
      ? result.entries.filter((entry): entry is RecentProjectEntry =>
        !!entry &&
        typeof entry.path === 'string' &&
        typeof entry.name === 'string' &&
        typeof entry.lastOpenedAt === 'string'
      )
      : recentProjects.value;

    recentProjects.value = nextProjects;
    persistRecentProjects();
    return nextProjects;
  })();

  try {
    return await recentProjectSyncPromise;
  } finally {
    recentProjectSyncPromise = null;
  }
}

function trackRecentProject(project: ProjectDocument) {
  if (!project.path) return;

  const nextEntry: RecentProjectEntry = {
    path: project.path,
    name: project.name,
    lastOpenedAt: nowIso(),
  };

  recentProjects.value = [
    nextEntry,
    ...recentProjects.value.filter((entry) => entry.path !== project.path),
  ].slice(0, 10);

  persistRecentProjects();
  void syncRecentProjectsWithFilesystem();
}

function setCurrentProject(project: ProjectDocument | null) {
  currentProject.value = project;
  if (project) {
    trackRecentProject(project);
  }
}

async function createProject(seed: Partial<ProjectFile> = {}) {
  const initialProject = sanitizeProjectFile(seed, null);

  if (window.ipc?.projectCreate) {
    const result = await window.ipc.projectCreate(toProjectFile(initialProject));
    if (!result.ok || result.canceled || !result.project) return null;

    const project = sanitizeProjectFile(result.project, result.path ?? null);
    setCurrentProject(project);
    return project;
  }

  setCurrentProject(initialProject);
  return initialProject;
}

async function openProject(filePath?: string) {
  if (window.ipc?.projectOpen) {
    const result = await window.ipc.projectOpen(filePath);
    if (!result.ok || result.canceled || !result.project) {
      if (filePath) {
        removeRecentProject(filePath);
      }
      return null;
    }

    const project = sanitizeProjectFile(result.project, result.path ?? filePath ?? null);
    setCurrentProject(project);
    return project;
  }

  return currentProject.value;
}

async function saveCurrentProject() {
  if (!currentProject.value) {
    return { ok: false, error: 'No project is currently loaded.' };
  }

  const nextProject = sanitizeProjectFile(
    { ...toProjectFile(currentProject.value), updatedAt: nowIso() },
    currentProject.value.path
  );
  currentProject.value = nextProject;
  trackRecentProject(nextProject);

  if (nextProject.path && window.ipc?.projectSave) {
    const result = await window.ipc.projectSave(nextProject.path, toProjectFile(nextProject));
    if (result?.ok && result.project) {
      const persistedProject = sanitizeProjectFile(result.project, result.path ?? nextProject.path);
      currentProject.value = persistedProject;
      trackRecentProject(persistedProject);
    }
    return result;
  }

  return { ok: true, path: nextProject.path };
}

async function updateCurrentProject(update: ProjectUpdate, options: { save?: boolean } = {}) {
  if (!currentProject.value) return null;

  const nextProject = sanitizeProjectFile({
    ...toProjectFile(currentProject.value),
    ...update,
    updatedAt: nowIso(),
    settings: {
      ...currentProject.value.settings,
      ...update.settings,
    },
    workspace: {
      ...currentProject.value.workspace,
      ...update.workspace,
    },
  }, currentProject.value.path);

  currentProject.value = nextProject;
  trackRecentProject(nextProject);

  if (options.save) {
    await saveCurrentProject();
  }

  return nextProject;
}

export function useProject() {
  if (!hasStartedRecentProjectSync) {
    hasStartedRecentProjectSync = true;
    void syncRecentProjectsWithFilesystem();
  }

  return {
    currentProject,
    recentProjects,
    hasCurrentProject: computed(() => currentProject.value !== null),
    createProject,
    openProject,
    saveCurrentProject,
    updateCurrentProject,
    setCurrentProject,
  };
}
