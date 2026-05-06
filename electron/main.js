
const dotenv = require('dotenv');

const { app, BrowserWindow, ipcMain, nativeTheme, shell, dialog } = require('electron');

// 1. Force Hardware Acceleration and bypass Chromium's GPU blocklist
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// 2. Explicitly enable WebCodecs features (just in case)
app.commandLine.appendSwitch('enable-features', 'WebCodecs,WebCodecsVideoEncoder,WebCodecsVideoDecoder');

// 3. STOP CHROMIUM FROM THROTTLING YOUR STREAM!
// If your app loses focus for even a second, Chromium will throttle WebSockets to 1Hz, causing massive lag.
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const { registerIrisIpc, getIrisCliPath } = require('./iris');
const { registerOpenSimIpc } = require('./opensim');
const { runMarkerAugmentation } = require('./marker-augmenter/augmenter');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');
const { spawn, execFile, exec } = require('child_process')

dotenv.config({ path: path.join(__dirname, '..', '.env') });

let mainWindow;
let mockTimer = null;
const PROJECT_DIRECTORY_NAME = 'ReCapture Projects';
const PROJECT_EXTENSION = 'recapture.json';
const PROJECT_MOTIONS_DIRECTORY_NAME = 'motions';
const PROJECT_MODELS_DIRECTORY_NAME = 'models';
const PRESET_STORE_FILENAME = 'project-presets.json';
const UNTITLED_PROJECT_NAME = 'Untitled Project';

function createAppEntityId(prefix) {
    try {
        return randomUUID();
    } catch {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
}

function getDefaultPresetStore() {
    return {
        defaultPresetId: 'preset-standard',
        presets: [{
            id: 'preset-standard',
            name: 'Standard Capture',
            templates: [
                { id: 'template-baseline', name: 'Baseline' },
                { id: 'template-walk', name: 'Walking Trial' },
                { id: 'template-balance', name: 'Balance Trial' },
            ],
        }],
    };
}

function getPresetStorePath() {
    return path.join(app.getPath('userData'), PRESET_STORE_FILENAME);
}

function sanitizePresetTemplate(template = {}, index = 0) {
    const legacyExercises = Array.isArray(template.exercises)
        ? template.exercises.filter((value) => typeof value === 'string' && value.trim().length > 0)
        : [];
    return {
        id: typeof template.id === 'string' && template.id.trim() ? template.id : createAppEntityId(`template-${index + 1}`),
        name: typeof template.name === 'string' && template.name.trim()
            ? template.name.trim()
            : (legacyExercises[0] || `Template ${index + 1}`),
    };
}

function sanitizePreset(preset = {}, index = 0) {
    return {
        id: typeof preset.id === 'string' && preset.id.trim() ? preset.id : createAppEntityId(`preset-${index + 1}`),
        name: typeof preset.name === 'string' && preset.name.trim() ? preset.name.trim() : `Preset ${index + 1}`,
        templates: Array.isArray(preset.templates)
            ? preset.templates.map((template, templateIndex) => sanitizePresetTemplate(template, templateIndex))
            : [],
    };
}

function sanitizePresetStore(raw = {}) {
    const fallback = getDefaultPresetStore();
    const presets = Array.isArray(raw.presets) && raw.presets.length > 0
        ? raw.presets.map((preset, index) => sanitizePreset(preset, index))
        : fallback.presets;
    const defaultPresetId = typeof raw.defaultPresetId === 'string' && presets.some((preset) => preset.id === raw.defaultPresetId)
        ? raw.defaultPresetId
        : (presets[0]?.id ?? null);

    return {
        version: 1,
        defaultPresetId,
        presets,
    };
}

function readPresetStore() {
    const filePath = getPresetStorePath();
    const fallback = sanitizePresetStore(getDefaultPresetStore());

    try {
        if (!fs.existsSync(filePath)) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8');
            return fallback;
        }

        const raw = fs.readFileSync(filePath, 'utf8');
        return sanitizePresetStore(JSON.parse(raw));
    } catch (error) {
        console.error('[presets] Failed to read preset store:', error);
        return fallback;
    }
}

function writePresetStore(store) {
    const filePath = getPresetStorePath();
    const payload = sanitizePresetStore(store);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return payload;
}
 
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        frame: false,
        autoHideMenuBar: true,
        title: process.env.VITE_APP_TITLE || 'IRIS Starter',
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#111418' : '#ffffff',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
        }
    });

    const devServer = process.env.VITE_DEV_SERVER_URL;
    if (devServer) {
        mainWindow.loadURL(devServer);
        if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    const sendWindowState = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('window-state', {
            isMaximized: mainWindow.isMaximized(),
        });
    };

    mainWindow.on('maximize', sendWindowState);
    mainWindow.on('unmaximize', sendWindowState);
    mainWindow.on('enter-full-screen', sendWindowState);
    mainWindow.on('leave-full-screen', sendWindowState);
    mainWindow.once('ready-to-show', sendWindowState);
}

app.whenReady().then(() => {

    registerIrisIpc();
    registerOpenSimIpc();
    createWindow(); 

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (mockTimer) { clearInterval(mockTimer); mockTimer = null; }
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-external', async (event, url) => {
    console.log('[Main] Received open-external request for:', url);
    try {
        console.log('[Main] Calling shell.openExternal...');
        await shell.openExternal(url);
        console.log('[Main] shell.openExternal call completed successfully.');
        return { ok: true };
    } catch (e) {
        console.error('[Main] shell.openExternal failed:', e);
        return { ok: false, error: e.message };
    }
});

function getEventWindow(event) {
    return BrowserWindow.fromWebContents(event.sender) || mainWindow;
}

ipcMain.handle('window-minimize', (event) => {
    const win = getEventWindow(event);
    if (win && !win.isDestroyed()) win.minimize();
});

ipcMain.handle('window-toggle-maximize', (event) => {
    const win = getEventWindow(event);
    if (!win || win.isDestroyed()) return { isMaximized: false };

    if (win.isMaximized()) {
        win.unmaximize();
    } else {
        win.maximize();
    }

    return { isMaximized: win.isMaximized() };
});

ipcMain.handle('window-close', (event) => {
    const win = getEventWindow(event);
    if (win && !win.isDestroyed()) win.close();
});

ipcMain.handle('window-is-maximized', (event) => {
    const win = getEventWindow(event);
    return { isMaximized: !!win && !win.isDestroyed() && win.isMaximized() };
});

// Check whether iris_cli.exe is present on disk
ipcMain.handle('check-iris-cli', () => {
    const irisCliPath = getIrisCliPath();
    const found = fs.existsSync(irisCliPath);
    console.log(`[iris-cli] check: ${found ? 'found' : 'NOT found'} at ${irisCliPath}`);
    return { found, path: irisCliPath };
});

ipcMain.handle('augment-markers', async (_event, options = {}) => {
    try {
        const posesPath = typeof options.posesPath === 'string' ? options.posesPath : '';
        const outputDir = typeof options.outputDir === 'string' ? options.outputDir : '';
        const result = await runMarkerAugmentation(posesPath, outputDir);
        return { ok: true, ...result };
    } catch (error) {
        console.error('[augment-markers] failed:', error);
        return { ok: false, error: error.message };
    }
});

ipcMain.handle('preset-store-load', async () => {
    try {
        return { ok: true, store: readPresetStore() };
    } catch (error) {
        return { ok: false, error: error.message, store: sanitizePresetStore(getDefaultPresetStore()) };
    }
});

ipcMain.handle('preset-store-save', async (event, store) => {
    try {
        return { ok: true, store: writePresetStore(store) };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});
 
function getDefaultProjectsDir() {
    const documentsDir = app.getPath('documents');
    const projectsDir = path.join(documentsDir, PROJECT_DIRECTORY_NAME);
    if (!fs.existsSync(projectsDir)) {
        fs.mkdirSync(projectsDir, { recursive: true });
    }
    return projectsDir;
}

function inferProjectNameFromPath(filePath) {
    if (!filePath) {
        return UNTITLED_PROJECT_NAME;
    }

    return path.basename(filePath).replace(/\.json$/i, '').replace(/\.recapture$/i, '');
}

function resolveProjectName(projectName, filePath) {
    const trimmedName = typeof projectName === 'string' ? projectName.trim() : '';

    if (!trimmedName || trimmedName === UNTITLED_PROJECT_NAME) {
        return inferProjectNameFromPath(filePath);
    }

    return trimmedName;
}

function sanitizeProjectPathSegment(value, fallback = UNTITLED_PROJECT_NAME) {
    const cleaned = typeof value === 'string'
        ? value.replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim()
        : '';
    return cleaned || fallback;
}

function getProjectRootDir(filePath) {
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        return null;
    }

    return path.dirname(filePath);
}

function getProjectMotionsDir(filePath) {
    const projectRootDir = getProjectRootDir(filePath);
    return projectRootDir ? path.join(projectRootDir, PROJECT_MOTIONS_DIRECTORY_NAME) : null;
}

function getProjectModelsDir(filePath) {
    const projectRootDir = getProjectRootDir(filePath);
    return projectRootDir ? path.join(projectRootDir, PROJECT_MODELS_DIRECTORY_NAME) : null;
}

function isPathInside(parentPath, childPath) {
    if (!parentPath || !childPath) return false;

    const resolvedParent = path.resolve(parentPath);
    const resolvedChild = path.resolve(childPath);
    const relativePath = path.relative(resolvedParent, resolvedChild);

    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function ensureProjectDirectories(filePath) {
    const projectRootDir = getProjectRootDir(filePath);
    if (!projectRootDir) return null;

    const motionsDir = getProjectMotionsDir(filePath);
    const modelsDir = getProjectModelsDir(filePath);
    fs.mkdirSync(projectRootDir, { recursive: true });
    if (motionsDir) {
        fs.mkdirSync(motionsDir, { recursive: true });
    }
    if (modelsDir) {
        fs.mkdirSync(modelsDir, { recursive: true });
    }

    return motionsDir;
}

function resolveCreatedProjectFilePath(selectionPath, projectName) {
    const parentDir = path.dirname(selectionPath);
    const baseName = sanitizeProjectPathSegment(resolveProjectName(projectName, selectionPath));
    return path.join(parentDir, baseName, `${baseName}.${PROJECT_EXTENSION}`);
}

function sanitizeRecentProjectEntries(entries = []) {
    if (!Array.isArray(entries)) {
        return [];
    }

    const defaultProjectsDir = getDefaultProjectsDir();

    return entries.filter((entry) => {
        if (!entry || typeof entry.path !== 'string' || typeof entry.name !== 'string' || typeof entry.lastOpenedAt !== 'string') {
            return false;
        }

        const targetPath = entry.path.trim();
        if (!targetPath || !isPathInside(defaultProjectsDir, targetPath)) {
            return false;
        }

        try {
            return fs.existsSync(targetPath) && fs.statSync(targetPath).isFile();
        } catch {
            return false;
        }
    }).slice(0, 10);
}

function ensureProjectPayload(projectData = {}, filePath = null, options = {}) {
    const touch = options.touch ?? false;
    const now = new Date().toISOString();
    const motionsDir = getProjectMotionsDir(filePath);
    const participants = Array.isArray(projectData.participants) && projectData.participants.length > 0
        ? projectData.participants.map((participant, index) => ({
            id: participant?.id || `participant-${index + 1}`,
            name: typeof participant?.name === 'string' && participant.name.trim()
                ? participant.name.trim()
                : `Participant ${index + 1}`,
            sessions: Array.isArray(participant?.sessions)
                ? participant.sessions.map((session, sessionIndex) => {
                    const recordingPath = typeof session?.recordingPath === 'string' && session.recordingPath.trim()
                        ? session.recordingPath
                        : null;

                    return {
                        id: session?.id || `participant-${index + 1}-session-${sessionIndex + 1}`,
                        name: typeof session?.name === 'string' && session.name.trim()
                            ? session.name.trim()
                            : (typeof session?.date === 'string' && session.date.trim() ? session.date.trim() : 'Untitled Session'),
                        date: typeof session?.date === 'string' && session.date.trim()
                            ? session.date.trim()
                            : now,
                        completed: recordingPath !== null,
                        recordingPath,
                        templateId: typeof session?.templateId === 'string' ? session.templateId : null,
                        exercises: Array.isArray(session?.exercises)
                            ? session.exercises.filter((value) => typeof value === 'string')
                            : [],
                    };
                })
                : [],
        }))
        : [{
            id: 'participant-1',
            name: 'Participant 1',
            sessions: [],
        }];

    return {
        format: 'recapture-project',
        version: 1,
        id: projectData.id || `project-${Date.now()}`,
        name: resolveProjectName(projectData.name, filePath),
        createdAt: projectData.createdAt || now,
        updatedAt: touch ? now : (projectData.updatedAt || projectData.createdAt || now),
        settings: {
            theme: projectData.settings?.theme === 'dark' ? 'dark' : 'light',
            recordingsDir: motionsDir ?? projectData.settings?.recordingsDir ?? null,
            presetId: typeof projectData.settings?.presetId === 'string' ? projectData.settings.presetId : null,
        },
        workspace: {
            activeView: ['capture', 'mocap', 'analysis'].includes(projectData.workspace?.activeView)
                ? projectData.workspace.activeView
                : 'capture',
            selectedCameraIds: Array.isArray(projectData.workspace?.selectedCameraIds)
                ? projectData.workspace.selectedCameraIds.filter((value) => typeof value === 'string')
                : [],
            selectedRecordingPath: projectData.workspace?.selectedRecordingPath ?? null,
            resolution: projectData.workspace?.resolution || '1920x1080',
            fps: typeof projectData.workspace?.fps === 'number' ? projectData.workspace.fps : 30,
            rotation: typeof projectData.workspace?.rotation === 'number' ? projectData.workspace.rotation : 0,
            personCount: projectData.workspace?.personCount ?? 'Single Person',
            outputOption: projectData.workspace?.outputOption || 'Filesystem',
        },
        participants,
    };
}

ipcMain.handle('project-create', async (event, projectData) => {
    const defaultDir = getDefaultProjectsDir();
    const defaultName = sanitizeProjectPathSegment(resolveProjectName(projectData?.name, null));
    const result = await dialog.showSaveDialog(getEventWindow(event), {
        title: 'Create Project',
        defaultPath: path.join(defaultDir, `${defaultName}.${PROJECT_EXTENSION}`),
        filters: [{ name: 'ReCapture Project', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
    }

    try {
        const targetPath = resolveCreatedProjectFilePath(result.filePath, projectData?.name);
        const payload = ensureProjectPayload(projectData, targetPath, { touch: true });
        ensureProjectDirectories(targetPath);
        fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
        return { ok: true, path: targetPath, project: payload };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

ipcMain.handle('project-open', async (event, filePath) => {
    let targetPath = filePath;

    if (!targetPath) {
        const result = await dialog.showOpenDialog(getEventWindow(event), {
            title: 'Open Project',
            properties: ['openFile'],
            defaultPath: getDefaultProjectsDir(),
            filters: [{ name: 'ReCapture Project', extensions: ['json'] }],
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { ok: false, canceled: true };
        }

        targetPath = result.filePaths[0];
    }

    try {
        const raw = fs.readFileSync(targetPath, 'utf8');
        const parsed = JSON.parse(raw);
        const payload = ensureProjectPayload(parsed, targetPath);
        ensureProjectDirectories(targetPath);
        return { ok: true, path: targetPath, project: payload };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

ipcMain.handle('project-save', async (event, filePath, projectData) => {
    if (!filePath) {
        return { ok: false, error: 'Cannot save project without a file path.' };
    }

    try {
        const payload = ensureProjectPayload(projectData, filePath, { touch: true });
        ensureProjectDirectories(filePath);
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
        return { ok: true, path: filePath, project: payload };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

ipcMain.handle('project-prune-recents', async (_event, entries) => {
    try {
        return { ok: true, entries: sanitizeRecentProjectEntries(entries) };
    } catch (error) {
        return { ok: false, error: error.message, entries: [] };
    }
});
 
