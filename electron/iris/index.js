'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path'); // Ensure path is imported
const { dialog, ipcMain } = require('electron');
const { getDa3StartupCalibrationOutputDir, getIrisCliPath } = require('./config');
const { ProcessManager } = require('./processManager');
const { MonitorManager } = require('./monitorManager');
const { getTargetWindow, sendToWindow } = require('./utils');
const { execFile } = require('child_process');

const processManager = new ProcessManager();
const monitorManager = new MonitorManager();
const INVALID_PATH_SEGMENT_RE = /[<>:"/\\|?*\x00-\x1f]/g;
const PROJECT_MOTIONS_DIRECTORY_NAME = 'motions';
const MOTION_INGEST_DIRECTORY_NAME = 'ingest-videos';
const MOTION_INGEST_RUNTIME_DIRECTORY_NAME = 'ingest-runtime';
const LEGACY_MOTION_VIDEOS_DIRECTORY_NAME = 'videos';
const VIDEO_FILE_FILTERS = [
  {
    name: 'Video Files',
    extensions: ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'wmv', 'webm', 'mpg', 'mpeg'],
  },
  {
    name: 'All Files',
    extensions: ['*'],
  },
];
const VIDEO_FILE_EXTENSIONS = new Set(VIDEO_FILE_FILTERS[0].extensions.map((extension) => extension.toLowerCase()));

function resolveOutputDir(value) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return getDa3StartupCalibrationOutputDir();
}

function resolveProjectDirectory(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
    return null;
  }

  return path.dirname(projectPath.trim());
}

function sanitizePathSegment(value, fallback = 'Untitled Project') {
  const cleaned = typeof value === 'string'
    ? value.replace(INVALID_PATH_SEGMENT_RE, ' ').replace(/\s+/g, ' ').trim()
    : '';

  return cleaned || fallback;
}

function getProjectMotionsDir(projectPath) {
  const projectDir = resolveProjectDirectory(projectPath);
  return projectDir ? path.join(projectDir, PROJECT_MOTIONS_DIRECTORY_NAME) : null;
}

function isPathInside(parentPath, childPath) {
  if (!parentPath || !childPath) return false;
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function resolveMotionOutputDir(options = {}) {
  const motionsDir = getProjectMotionsDir(options.projectPath);
  if (!motionsDir) {
    return null;
  }

  const recordingPath = typeof options.recordingPath === 'string' && options.recordingPath.trim().length > 0
    ? options.recordingPath.trim()
    : '';

  if (recordingPath && isPathInside(motionsDir, recordingPath) && path.resolve(recordingPath) !== path.resolve(motionsDir)) {
    return recordingPath;
  }

  const sessionName = typeof options.sessionName === 'string' ? options.sessionName.trim() : '';
  if (!sessionName) {
    return null;
  }

  return path.join(motionsDir, sanitizePathSegment(sessionName, 'Motion'));
}

function getMotionVideosDir(motionDir) {
  if (typeof motionDir !== 'string' || motionDir.trim().length === 0) {
    return null;
  }

  return path.join(motionDir.trim(), MOTION_INGEST_DIRECTORY_NAME);
}

function getLegacyMotionVideosDir(motionDir) {
  if (typeof motionDir !== 'string' || motionDir.trim().length === 0) {
    return null;
  }

  return path.join(motionDir.trim(), LEGACY_MOTION_VIDEOS_DIRECTORY_NAME);
}

function getMotionIngestRuntimeDir(motionDir) {
  if (typeof motionDir !== 'string' || motionDir.trim().length === 0) {
    return null;
  }

  return path.join(motionDir.trim(), MOTION_INGEST_RUNTIME_DIRECTORY_NAME);
}

function isSupportedVideoFile(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return VIDEO_FILE_EXTENSIONS.has(extension);
}

function resolveIngestVideoPaths(recordingPath) {
  if (typeof recordingPath !== 'string' || recordingPath.trim().length === 0) {
    return [];
  }

  const resolvedRecordingPath = recordingPath.trim();
  if (!fs.existsSync(resolvedRecordingPath)) {
    return [];
  }

  const sourceVideosDir = getMotionVideosDir(resolvedRecordingPath);
  const legacyVideosDir = getLegacyMotionVideosDir(resolvedRecordingPath);
  const ingestRuntimeDir = getMotionIngestRuntimeDir(resolvedRecordingPath);
  const candidateDirectories = [
    sourceVideosDir,
    legacyVideosDir,
    resolvedRecordingPath,
  ].filter((candidateDirectory, index, directories) =>
    typeof candidateDirectory === 'string'
      && fs.existsSync(candidateDirectory)
      && directories.indexOf(candidateDirectory) === index,
  );

  let sourceVideoPaths = [];

  for (const candidateDirectory of candidateDirectories) {
    sourceVideoPaths = fs.readdirSync(candidateDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isSupportedVideoFile(entry.name))
      .map((entry) => path.join(candidateDirectory, entry.name))
      .sort((left, right) => left.localeCompare(right));

    if (sourceVideoPaths.length > 0) {
      break;
    }
  }

  if (sourceVideoPaths.length === 0 || !ingestRuntimeDir) {
    return [];
  }

  fs.rmSync(ingestRuntimeDir, { recursive: true, force: true });
  fs.mkdirSync(ingestRuntimeDir, { recursive: true });

  return sourceVideoPaths.map((sourcePath) => {
    const destinationPath = resolveUniqueDestinationPath(ingestRuntimeDir, path.basename(sourcePath));
    fs.copyFileSync(sourcePath, destinationPath);
    return destinationPath;
  });
}

function buildIngestCameraOptions(options = {}, videoPaths = []) {
  const templateCameras = Array.isArray(options.cameras) ? options.cameras : [];
  const fallbackCamera = templateCameras[0] ?? {};
  const fallbackWidth = Number.isFinite(options.camera_width) ? options.camera_width : 1920;
  const fallbackHeight = Number.isFinite(options.camera_height) ? options.camera_height : 1080;
  const fallbackFps = Number.isFinite(options.video_fps) ? options.video_fps : 30;
  const fallbackRotation = Number.isFinite(options.rotation) ? options.rotation : 0;

  return videoPaths.map((videoPath, index) => {
    const templateCamera = templateCameras[index] ?? fallbackCamera;

    return {
      uri: path.basename(videoPath),
      width: Number.isFinite(templateCamera?.width) ? templateCamera.width : fallbackWidth,
      height: Number.isFinite(templateCamera?.height) ? templateCamera.height : fallbackHeight,
      fps: fallbackFps,
      rotation: fallbackRotation,
    };
  });
}

function resolveIrisStartOptions(options = {}) {
  const nextOptions = options && typeof options === 'object'
    ? { ...options }
    : {};

  if (nextOptions.is_ingest !== true) {
    return { ok: true, options: nextOptions };
  }

  const explicitVideoPaths = Array.isArray(nextOptions.video_paths)
    ? nextOptions.video_paths
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
    : [];
  const recordingPath = typeof nextOptions.recordingPath === 'string' ? nextOptions.recordingPath.trim() : '';
  const videoPaths = explicitVideoPaths.length > 0
    ? explicitVideoPaths
    : resolveIngestVideoPaths(recordingPath);

  if (videoPaths.length === 0) {
    return {
      ok: false,
      error: recordingPath
        ? 'No video files were found in the linked motion folder.'
        : 'A linked motion folder is required to start IRIS ingest.',
    };
  }

  return {
    ok: true,
    options: {
      ...nextOptions,
      video_paths: videoPaths,
      cameras: buildIngestCameraOptions(nextOptions, videoPaths),
    },
  };
}

function resolveUniqueDestinationPath(directory, fileName) {
  const parsed = path.parse(fileName);
  let candidatePath = path.join(directory, fileName);
  let suffix = 2;

  while (fs.existsSync(candidatePath)) {
    candidatePath = path.join(directory, `${parsed.name}-${suffix}${parsed.ext}`);
    suffix += 1;
  }

  return candidatePath;
}

function copyLatestExtrinsicsToMotionDir(targetDir) {
  if (typeof targetDir !== 'string' || targetDir.trim().length === 0) {
    return false;
  }

  const sourcePath = path.join(getDa3StartupCalibrationOutputDir(), 'extrinsics.json');
  if (!fs.existsSync(sourcePath)) {
    return false;
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(sourcePath, path.join(targetDir, 'extrinsics.json'));
    return true;
  } catch (error) {
    console.warn('[iris] Failed to copy extrinsics into motion directory:', error);
    return false;
  }
}

function clearMotionDirectory(targetDir, options = {}) {
  if (typeof targetDir !== 'string' || targetDir.trim().length === 0) {
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const preserveEntryNames = new Set(
    Array.isArray(options.preserveEntryNames)
      ? options.preserveEntryNames
        .filter((entryName) => typeof entryName === 'string' && entryName.trim().length > 0)
        .map((entryName) => entryName.trim())
      : [],
  );

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (preserveEntryNames.has(entry.name)) {
      continue;
    }

    fs.rmSync(path.join(targetDir, entry.name), { recursive: true, force: true });
  }
}

function resolveRecordingPreserveEntryNames(motionDir, options = {}) {
  const preserveEntryNames = [MOTION_INGEST_RUNTIME_DIRECTORY_NAME];

  if (options.preserveIngestVideos !== true) {
    return preserveEntryNames;
  }

  preserveEntryNames.push(MOTION_INGEST_DIRECTORY_NAME, LEGACY_MOTION_VIDEOS_DIRECTORY_NAME);

  try {
    for (const entry of fs.readdirSync(motionDir, { withFileTypes: true })) {
      if (entry.isFile() && isSupportedVideoFile(entry.name)) {
        preserveEntryNames.push(entry.name);
      }
    }
  } catch {
    // The caller creates the directory before clearing it, so this is best-effort.
  }

  return [...new Set(preserveEntryNames)];
}

function moveRecordedVideosToMotionSubdirectory(motionDir) {
  const videosDir = getMotionVideosDir(motionDir);
  if (!videosDir) {
    return [];
  }

  fs.mkdirSync(videosDir, { recursive: true });

  const movedFiles = [];
  for (const entry of fs.readdirSync(motionDir, { withFileTypes: true })) {
    if (!entry.isFile() || !isSupportedVideoFile(entry.name)) {
      continue;
    }

    const sourcePath = path.join(motionDir, entry.name);
    const destinationPath = resolveUniqueDestinationPath(videosDir, entry.name);
    fs.renameSync(sourcePath, destinationPath);
    movedFiles.push(destinationPath);
  }

  return movedFiles;
}

async function stageLinkedSourceFiles(sourcePaths, motionDir) {
  const stagedPaths = [];
  let stagingDir = null;

  for (const sourcePath of sourcePaths) {
    if (!isPathInside(motionDir, sourcePath)) {
      stagedPaths.push(sourcePath);
      continue;
    }

    if (!stagingDir) {
      stagingDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'recapture-link-'));
    }

    const stagedPath = resolveUniqueDestinationPath(stagingDir, path.basename(sourcePath));
    await fs.promises.copyFile(sourcePath, stagedPath);
    stagedPaths.push(stagedPath);
  }

  return {
    stagedPaths,
    async cleanup() {
      if (!stagingDir) {
        return;
      }

      await fs.promises.rm(stagingDir, { recursive: true, force: true });
    },
  };
}

function registerIrisIpc() {
  let activeRecordingOutputDir = null;

  ipcMain.handle('start-iris', async (event, options = {}) => {
    const sessionId = crypto.randomUUID();
    const targetWindow = getTargetWindow(event);
    const resolvedOptions = resolveIrisStartOptions(options);

    if (!resolvedOptions.ok) {
      return resolvedOptions;
    }

    return processManager.startStandard({
      sessionId,
      options: resolvedOptions.options,
      onCliOutput: (payload) => sendToWindow(targetWindow, 'iris-cli-output', payload),
    });
  });

  ipcMain.handle('start-iris-stream', async (event, options = {}) => {
    const sessionId = crypto.randomUUID();
    const targetWindow = getTargetWindow(event);
    const resolvedOptions = resolveIrisStartOptions(options);

    if (!resolvedOptions.ok) {
      return resolvedOptions;
    }

    return processManager.startStream({
      sessionId,
      options: resolvedOptions.options, 
      onFrame: (frame) => sendToWindow(targetWindow, 'iris-data', frame),
      onCliOutput: (payload) => sendToWindow(targetWindow, 'iris-cli-output', payload),
    });
  });

  ipcMain.handle('stop-iris', (_event, sessionId) => processManager.stop(sessionId));

  ipcMain.handle('get-hardware-cameras', async () => {
    const irisCliPath = getIrisCliPath();

    if (!fs.existsSync(irisCliPath)) {
      return { ok: false, error: 'IRIS executable not found.' };
    }

    return new Promise((resolve) => {
      execFile(irisCliPath, ['show-cameras'], { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          console.error('[iris_cli] show-cameras error:', stderr || error.message);
          resolve({ ok: false, error: stderr || error.message });
          return;
        }

        const cameras = [];
        const regex = /\[(\d+)\]\s+(.+)/g;
        let match;

        while ((match = regex.exec(stdout)) !== null) {
          cameras.push({
            id: parseInt(match[1], 10),
            name: match[2].trim(),
          });
        }

        resolve({ ok: true, data: cameras });
      });
    });
  });
 
  ipcMain.handle('get-extrinsics', async (_event, outputDirArg) => {
    const outputDir = resolveOutputDir(outputDirArg);

    const extrinsicsPath = path.join(outputDir, 'extrinsics.json');
    const camerasPath = path.join(outputDir, 'cameras.json');

    const targetPath = fs.existsSync(extrinsicsPath)
      ? extrinsicsPath
      : fs.existsSync(camerasPath)
        ? camerasPath
        : null;

    if (!targetPath) {
      return null;
    }

    try {
      const rawData = fs.readFileSync(targetPath, 'utf8');
      return JSON.parse(rawData);
    } catch (error) {
      console.warn('[iris] Failed to read extrinsics from', targetPath, error);
      return null;
    }
  });

  ipcMain.handle('get-scene', async (_event, outputDirArg) => {
    const outputDir = resolveOutputDir(outputDirArg);
    const scenePath = path.join(outputDir, 'scene.ply');

    if (!fs.existsSync(scenePath)) {
      return null;
    }

    try { 
      fs.accessSync(scenePath, fs.constants.R_OK);
      return `file:///${scenePath.replace(/\\/g, '/')}`;
    } catch (error) {
      console.warn('[iris] Failed to resolve scene file at', scenePath, error);
      return null;
    }
  });

  ipcMain.handle('start-iris-record', async (event, options = {}) => {
    const targetWindow = getTargetWindow(event);
    const motionDir = resolveMotionOutputDir(options);

    if (!motionDir) {
      return { ok: false, error: 'A target motion folder is required to start recording.' };
    }

    try {
      clearMotionDirectory(motionDir, {
        preserveEntryNames: resolveRecordingPreserveEntryNames(motionDir, options),
      });
    } catch (error) {
      return { ok: false, error: error.message };
    }

    const result = await monitorManager.start({
      outputDir: motionDir,
      shmName: options.shmName,
      fps: options.fps,
      pipePath: options.pipePath,
      pipeId: options.pipeId,
      savePoses: options.savePoses,
      drawBboxes: options.drawBboxes,
      drawKeypoints: options.drawKeypoints,
      verbose: options.verbose,
      onStdout: (data) => sendToWindow(targetWindow, 'iris-cli-output', { channel: 'record:stdout', line: data.toString() }),
      onStderr: (data) => sendToWindow(targetWindow, 'iris-cli-output', { channel: 'record:stderr', line: data.toString() }),
    });

    if (result?.ok) {
      activeRecordingOutputDir = motionDir;
      copyLatestExtrinsicsToMotionDir(motionDir);
    }

    return result?.ok ? { ...result, outputDir: motionDir } : result;
  });

  ipcMain.handle('stop-iris-record', async () => {
    const motionDir = activeRecordingOutputDir;
    activeRecordingOutputDir = null;
    const result = await monitorManager.stop();

    if (result?.ok && motionDir) {
      try {
        moveRecordedVideosToMotionSubdirectory(motionDir);
      } catch (error) {
        return { ok: false, error: error.message };
      }

      copyLatestExtrinsicsToMotionDir(motionDir);
      return { ...result, outputDir: motionDir };
    }

    return result;
  });

  ipcMain.handle('link-recordings', async (event, options = {}) => {
    const targetWindow = getTargetWindow(event);
    const motionDir = resolveMotionOutputDir(options);

    if (!motionDir) {
      return { ok: false, error: 'A target motion folder is required to link recordings.' };
    }

    const selection = await dialog.showOpenDialog(targetWindow, {
      title: 'Link Recordings',
      properties: ['openFile', 'multiSelections'],
      filters: VIDEO_FILE_FILTERS,
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    let stagedSources = null;
    try {
      stagedSources = await stageLinkedSourceFiles(selection.filePaths, motionDir);
      clearMotionDirectory(motionDir, { preserveEntryNames: [MOTION_INGEST_RUNTIME_DIRECTORY_NAME] });
      const videosDir = getMotionVideosDir(motionDir);
      fs.mkdirSync(videosDir, { recursive: true });
      const copiedFiles = [];

      for (const sourcePath of stagedSources.stagedPaths) {
        const destinationPath = resolveUniqueDestinationPath(videosDir, path.basename(sourcePath));
        await fs.promises.copyFile(sourcePath, destinationPath);
        copiedFiles.push(destinationPath);
      }

      copyLatestExtrinsicsToMotionDir(motionDir);
      await stagedSources.cleanup();

      return { ok: true, outputDir: motionDir, copiedFiles };
    } catch (error) {
      console.error('[link-recordings] Failed to import recordings:', error);
      return { ok: false, error: error.message };
    } finally {
      if (stagedSources) {
        await stagedSources.cleanup().catch(() => {});
      }
    }
  });
 
}

module.exports = {
  registerIrisIpc,
  IRIS_CLI_EXE: getIrisCliPath(),
  getIrisCliPath,
};
