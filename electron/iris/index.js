'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path'); // Ensure path is imported
const { ipcMain } = require('electron');
const { getIrisCliPath } = require('./config');
const { ProcessManager } = require('./processManager');
const { MonitorManager } = require('./monitorManager');
const { getTargetWindow, sendToWindow } = require('./utils');
const { execFile } = require('child_process');

const processManager = new ProcessManager();
const monitorManager = new MonitorManager();
const PROJECT_FILE_SUFFIX_RE = /\.recapture\.json$/i;
const INVALID_PATH_SEGMENT_RE = /[<>:"/\\|?*\x00-\x1f]/g;
const RAW_EXTRINSICS_FILENAME = 'extrinsics.json';
const METRIC_EXTRINSICS_FILENAME = 'extrinsics_metric.json';
const LEGACY_EXTRINSICS_FILENAME = 'cameras.json';
const SCALE_CAPTURE_WORKFLOW_SEGMENT = 'scale-extrinsics';
const RECORDED_VIDEO_FILE_RE = /^recording_cam(\d+)\.(mp4|avi|mov|mkv)$/i;

let activeScaleExtrinsicsCapture = null;

function resolveOutputDir(value) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  const irisCliDir = path.dirname(getIrisCliPath());
  return path.join(irisCliDir, 'output', 'triangulation_da3_startup');
}

function resolveProjectDirectory(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
    return null;
  }

  return path.dirname(projectPath.trim());
}

function inferProjectName(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
    return 'Untitled Project';
  }

  const fileName = path.basename(projectPath.trim());
  return fileName
    .replace(PROJECT_FILE_SUFFIX_RE, '')
    .replace(/\.json$/i, '')
    .trim() || 'Untitled Project';
}

function sanitizePathSegment(value, fallback = 'Untitled Project') {
  const cleaned = typeof value === 'string'
    ? value.replace(INVALID_PATH_SEGMENT_RE, ' ').replace(/\s+/g, ' ').trim()
    : '';

  return cleaned || fallback;
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
}

function resolveRecordingOutputDir(projectPath, options = {}) {
  const projectDir = resolveProjectDirectory(projectPath);
  if (!projectDir) {
    return null;
  }

  const projectFolderName = sanitizePathSegment(inferProjectName(projectPath));
  const recordingsRootDir = path.join(projectDir, 'recordings', projectFolderName);
  const workflowSegment = typeof options.workflowSegment === 'string' && options.workflowSegment.trim().length > 0
    ? sanitizePathSegment(options.workflowSegment, '')
    : '';
  const timestamp = formatTimestamp();

  let candidateDir = workflowSegment
    ? path.join(recordingsRootDir, workflowSegment, timestamp)
    : path.join(recordingsRootDir, timestamp);
  let suffix = 2;

  while (fs.existsSync(candidateDir)) {
    candidateDir = workflowSegment
      ? path.join(recordingsRootDir, workflowSegment, `${timestamp}-${suffix}`)
      : path.join(recordingsRootDir, `${timestamp}-${suffix}`);
    suffix += 1;
  }

  return candidateDir;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveRawExtrinsicsPath(outputDir) {
  if (typeof outputDir !== 'string' || outputDir.trim().length === 0) {
    return null;
  }

  const extrinsicsPath = path.join(outputDir, RAW_EXTRINSICS_FILENAME);
  return fs.existsSync(extrinsicsPath) ? extrinsicsPath : null;
}

function resolveMetricExtrinsicsPath(outputDir) {
  if (typeof outputDir !== 'string' || outputDir.trim().length === 0) {
    return null;
  }

  return path.join(outputDir, METRIC_EXTRINSICS_FILENAME);
}

function resolvePreferredExtrinsicsPath(outputDir) {
  if (typeof outputDir !== 'string' || outputDir.trim().length === 0) {
    return null;
  }

  const metricPath = resolveMetricExtrinsicsPath(outputDir);
  if (metricPath && fs.existsSync(metricPath)) {
    return metricPath;
  }

  const rawExtrinsicsPath = resolveRawExtrinsicsPath(outputDir);
  if (rawExtrinsicsPath) {
    return rawExtrinsicsPath;
  }

  const camerasPath = path.join(outputDir, LEGACY_EXTRINSICS_FILENAME);
  return fs.existsSync(camerasPath) ? camerasPath : null;
}

function resolveMonitorScale(outputDir) {
  const metricPath = resolveMetricExtrinsicsPath(outputDir);
  const extrinsicsPath = metricPath && fs.existsSync(metricPath)
    ? metricPath
    : resolvePreferredExtrinsicsPath(outputDir);
  if (!extrinsicsPath) {
    return 1;
  }

  try {
    const extrinsics = readJsonFile(extrinsicsPath);
    const scaleFactor = extrinsics?.scale_factor;
    return Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  } catch (error) {
    console.warn('[iris] Failed to read scale factor from', extrinsicsPath, error);
    return 1;
  }
}

function resolveRecordedVideoPaths(recordingDir) {
  if (typeof recordingDir !== 'string' || recordingDir.trim().length === 0 || !fs.existsSync(recordingDir)) {
    return [];
  }

  return fs.readdirSync(recordingDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = entry.name.match(RECORDED_VIDEO_FILE_RE);
      if (!match) {
        return null;
      }

      return {
        camId: Number.parseInt(match[1], 10),
        filePath: path.join(recordingDir, entry.name),
      };
    })
    .filter((entry) => entry && Number.isFinite(entry.camId))
    .sort((left, right) => left.camId - right.camId)
    .map((entry) => entry.filePath);
}

function sendCliOutput(targetWindow, channel, line) {
  if (!targetWindow || line == null) {
    return;
  }

  sendToWindow(targetWindow, 'iris-cli-output', { channel, line: String(line) });
}

function runScaleExtrinsics({ projectPath, recordingDir, markerSize, markerId, dictionaryId, targetWindow }) {
  return new Promise((resolve) => {
    const exePath = getIrisCliPath();
    if (!fs.existsSync(exePath)) {
      resolve({ ok: false, error: `Executable not found at ${exePath}` });
      return;
    }

    const calibrationDir = resolveProjectDirectory(projectPath);
    if (!calibrationDir) {
      resolve({ ok: false, error: 'A saved project path is required to scale extrinsics.' });
      return;
    }

    const extrinsicsPath = resolveRawExtrinsicsPath(calibrationDir);
    if (!extrinsicsPath) {
      resolve({ ok: false, error: `Missing ${RAW_EXTRINSICS_FILENAME} in ${calibrationDir}.` });
      return;
    }

    const videoPaths = resolveRecordedVideoPaths(recordingDir);
    if (videoPaths.length < 2) {
      resolve({ ok: false, error: 'Scale extrinsics requires at least two recorded camera videos.' });
      return;
    }

    const outputPath = resolveMetricExtrinsicsPath(calibrationDir);
    if (!outputPath) {
      resolve({ ok: false, error: 'Unable to resolve metric extrinsics output path.' });
      return;
    }

    const args = [
      'scale-extrinsics',
      '--extrinsics', extrinsicsPath,
      '--output', outputPath,
      '--intrinsics', calibrationDir,
    ];

    videoPaths.forEach((videoPath) => {
      args.push('--video', videoPath);
    });

    if (Number.isFinite(markerSize) && markerSize > 0) {
      args.push('--marker-size', String(markerSize));
    }

    if (Number.isFinite(markerId)) {
      args.push('--marker-id', String(markerId));
    }

    if (Number.isFinite(dictionaryId)) {
      args.push('--dict-id', String(dictionaryId));
    }

    console.log('[ScaleExtrinsics] Starting scale-extrinsics with args:', args.join(' '));
    sendCliOutput(targetWindow, 'scale-extrinsics:stdout', `Running scale-extrinsics for ${videoPaths.length} recorded video feeds...\n`);

    execFile(exePath, args, {
      cwd: path.dirname(exePath),
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (stdout) {
        sendCliOutput(targetWindow, 'scale-extrinsics:stdout', stdout);
      }

      if (stderr) {
        sendCliOutput(targetWindow, 'scale-extrinsics:stderr', stderr);
      }

      if (error) {
        resolve({
          ok: false,
          error: stderr || error.message,
          outputPath,
          recordingDir,
          videoPaths,
          args,
        });
        return;
      }

      try {
        const result = readJsonFile(outputPath);
        const scaleFactor = result?.scale_factor;
        resolve({
          ok: true,
          outputPath,
          recordingDir,
          videoPaths,
          args,
          result,
          scaleFactor: Number.isFinite(scaleFactor) ? scaleFactor : null,
        });
      } catch (readError) {
        resolve({
          ok: false,
          error: `Scaled extrinsics were written but could not be read: ${readError.message}`,
          outputPath,
          recordingDir,
          videoPaths,
          args,
        });
      }
    });
  });
}

function registerIrisIpc() {
  ipcMain.handle('start-iris', (event, options) => {
    const sessionId = crypto.randomUUID();
    const targetWindow = getTargetWindow(event);

    return processManager.startStandard({
      sessionId,
      options,
      onCliOutput: (payload) => sendToWindow(targetWindow, 'iris-cli-output', payload),
    });
  });

  ipcMain.handle('start-iris-stream', async (event, options) => {
    const sessionId = crypto.randomUUID();
    const targetWindow = getTargetWindow(event);

    return processManager.startStream({
      sessionId,
      options, 
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
    const extrinsicsPath = resolveRawExtrinsicsPath(outputDir);
    const camerasPath = path.join(outputDir, LEGACY_EXTRINSICS_FILENAME);
    const targetPath = extrinsicsPath || (fs.existsSync(camerasPath) ? camerasPath : null);

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
    if (monitorManager.isRunning()) {
      return { ok: false, error: 'A monitor recording is already in progress.' };
    }

    const targetWindow = getTargetWindow(event);
    const outputDir = resolveRecordingOutputDir(options.projectPath);

    if (!outputDir) {
      return { ok: false, error: 'A saved project path is required to start recording.' };
    }

    return monitorManager.start({
      outputDir,
      shmName: options.shmName,
      fps: options.fps,
      pipePath: options.pipePath,
      pipeId: options.pipeId,
      scale: resolveMonitorScale(resolveProjectDirectory(options.projectPath)),
      savePoses: options.savePoses,
      drawBboxes: options.drawBboxes,
      drawKeypoints: options.drawKeypoints,
      verbose: options.verbose,
      onStdout: (data) => sendToWindow(targetWindow, 'iris-cli-output', { channel: 'record:stdout', line: data.toString() }),
      onStderr: (data) => sendToWindow(targetWindow, 'iris-cli-output', { channel: 'record:stderr', line: data.toString() }),
    });
  });

  ipcMain.handle('stop-iris-record', async () => {
    if (activeScaleExtrinsicsCapture) {
      return { ok: false, error: 'A scale extrinsics capture is active. Stop it with the scale capture control.' };
    }

    return monitorManager.stop();
  });

  ipcMain.handle('start-iris-scale-extrinsics-record', async (event, options = {}) => {
    if (monitorManager.isRunning()) {
      return { ok: false, error: 'A monitor recording is already in progress.' };
    }

    const targetWindow = getTargetWindow(event);
    const outputDir = resolveRecordingOutputDir(options.projectPath, {
      workflowSegment: SCALE_CAPTURE_WORKFLOW_SEGMENT,
    });

    if (!outputDir) {
      return { ok: false, error: 'A saved project path is required to capture scale extrinsics.' };
    }

    const result = await monitorManager.start({
      outputDir,
      shmName: options.shmName,
      fps: options.fps,
      pipePath: options.pipePath,
      pipeId: options.pipeId,
      drawBboxes: options.drawBboxes,
      drawKeypoints: options.drawKeypoints,
      verbose: options.verbose,
      onStdout: (data) => sendToWindow(targetWindow, 'iris-cli-output', { channel: 'scale-capture:stdout', line: data.toString() }),
      onStderr: (data) => sendToWindow(targetWindow, 'iris-cli-output', { channel: 'scale-capture:stderr', line: data.toString() }),
    });

    if (result?.ok) {
      activeScaleExtrinsicsCapture = {
        projectPath: options.projectPath,
        outputDir,
        markerSize: options.markerSize,
        markerId: options.markerId,
        dictionaryId: options.dictionaryId,
        targetWindow,
      };
    }

    return result;
  });

  ipcMain.handle('stop-iris-scale-extrinsics-record', async () => {
    if (!activeScaleExtrinsicsCapture) {
      return { ok: false, error: 'No scale extrinsics capture is active.' };
    }

    const capture = activeScaleExtrinsicsCapture;
    activeScaleExtrinsicsCapture = null;

    const stopResult = await monitorManager.stop();
    if (!stopResult?.ok) {
      return stopResult;
    }

    const scaleResult = await runScaleExtrinsics({
      projectPath: capture.projectPath,
      recordingDir: capture.outputDir,
      markerSize: capture.markerSize,
      markerId: capture.markerId,
      dictionaryId: capture.dictionaryId,
      targetWindow: capture.targetWindow,
    });

    if (!scaleResult?.ok) {
      return scaleResult;
    }

    return {
      ok: true,
      outputDir: capture.outputDir,
      outputPath: scaleResult.outputPath,
      scaleFactor: scaleResult.scaleFactor,
      result: scaleResult.result,
      videoPaths: scaleResult.videoPaths,
      args: scaleResult.args,
    };
  });
 
}

module.exports = {
  registerIrisIpc,
  IRIS_CLI_EXE: getIrisCliPath(),
  getIrisCliPath,
};
