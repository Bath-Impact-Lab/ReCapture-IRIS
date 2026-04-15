'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { PIPE_NAME, buildConfigFromOptions, getIrisCliPath } = require('./config');
const { writeTempConfigFile } = require('./utils');
const { createPipeServer } = require('./pipeServer');
const { VideoStreamer } = require('./videoStreamer');

const execFileAsync = promisify(execFile);
const MONITOR_VIDEO_HINT_RE = /(video pipe|video pipes|mpegts|h264|annex|encoder|encoding|failed to open|failed|error|warn|warning|init|initialized)/i;

function waitForChildExit(child, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      child.off('exit', finish);
      child.off('close', finish);
      resolve(true);
    };

    const timer = setTimeout(finish, timeoutMs);
    child.once('exit', finish);
    child.once('close', finish);
  });
}

function writeDirectly(target, chunk) {
  if (!target?.writable || chunk == null) {
    return;
  }

  target.write(chunk);
}


class ProcessManager {
  constructor() {
    this.workers = new Map();
  }

  getExecutablePath() {
    return getIrisCliPath();
  }

  hasExecutable() {
    return fs.existsSync(this.getExecutablePath());
  }

  async startStandard({ sessionId, options, onCliOutput }) {
    if (!this.hasExecutable()) {
      return { ok: false, error: 'Executable not found' };
    }

    const { tmpDir, cfgPath } = writeTempConfigFile(buildConfigFromOptions(options));
    return this.spawnWorker({
      sessionId,
      args: ['run', cfgPath],
      cfgPath,
      tmpDir,
      onStdout: (data) => onCliOutput?.({ channel: 'run:stdout', line: data.toString() }),
      onStderr: (data) => onCliOutput?.({ channel: 'run:stderr', line: data.toString() }),
    });
  }

  async startStream({ sessionId, options, onFrame, onCliOutput }) {
    if (!this.hasExecutable()) {
      return { ok: false, error: 'Executable not found' };
    }

    const { tmpDir, cfgPath } = writeTempConfigFile(buildConfigFromOptions(options));
    const cameraCount = options.cameras?.length ?? 1;
    // Define a starting UDP port (e.g., 9000)
    const baseUdpPort = 9000;
    const udpPorts = Array.from({ length: cameraCount }, (_, index) => baseUdpPort + index);

    // Generate the FFmpeg UDP URLs for the C++ process
    const udpUrls = udpPorts.map(port => `udp://127.0.0.1:${port}?pkt_size=1316&flush_packets=1`);

    const args = [
      'monitor',
      '--shm-name', 'iris_shm_ipc',
      '--pipe', PIPE_NAME,
      '--fps', String(options.video_fps || 30),
    ];

    if (Number.isFinite(options.scale) && options.scale > 0) {
      args.push('--scale', String(options.scale));
    }

    const videoStreamer = new VideoStreamer();
    let pipeServer = null;

    try {
      pipeServer = await createPipeServer({
        pipeName: PIPE_NAME,
        onFrame,
      });

      // Pass the plain ports to your video streamer so it knows where to listen
      const wsPort = await videoStreamer.start(udpPorts);
      const wsUrl = `ws://127.0.0.1:${wsPort}`;

      // Pass the full udp:// URLs to the C++ process
      udpUrls.forEach((udpUrl, index) => {
        args.push('--video-pipe', `${index}:${udpUrl}`);
      });

      return this.spawnWorker({
        sessionId,
        args,
        cfgPath,
        tmpDir,
        pipeServer,
        videoStreamer,
        wsUrl,
        onStdout: (data) => onCliOutput({ channel: 'monitor:stdout', line: data.toString() }),
        onStderr: (data) => onCliOutput({ channel: 'monitor:stderr', line: data.toString() }),
      });
    } catch (err) {
      console.error('Failed to start IRIS stream bridge', err);
      if (pipeServer) {
        pipeServer.close();
      }
      await videoStreamer.stop().catch(() => {
        // Best-effort cleanup.
      });
      if (fs.existsSync(tmpDir)) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup.
        }
      }
      return { ok: false, error: 'Pipe or video server failed to start' };
    }
  }

  resolveSessionId(requestedSessionId) {
    const sessionId = requestedSessionId == null ? '' : String(requestedSessionId);

    if (this.workers.has(sessionId)) {
      return sessionId;
    }

    if (this.workers.size === 1) {
      return this.workers.keys().next().value;
    }

    return null;
  }

  async stop(requestedSessionId) {
    const sessionId = this.resolveSessionId(requestedSessionId);
    if (!sessionId) {
      return { ok: false, error: 'not_found' };
    }

    const entry = this.workers.get(sessionId);
    if (!entry) {
      return { ok: false, error: 'not_found' };
    }

    console.log(`[iris:${sessionId}] stop requested`);
    const { child } = entry;

    if (child.stdin && !child.stdin.destroyed) {
      try {
        child.stdin.write('\n');
        child.stdin.end();
      } catch (err) {
        console.error(`[iris:${sessionId}] failed to write to stdin`, err);
        this.killProcessTree(sessionId).catch((killErr) => {
          console.error(`[iris:${sessionId}] force kill failed`, killErr);
        });
      }
    } else {
      this.killProcessTree(sessionId).catch((killErr) => {
        console.error(`[iris:${sessionId}] force kill failed`, killErr);
      });
    }

    setTimeout(() => {
      if (this.workers.has(sessionId)) {
        console.warn(`[iris:${sessionId}] process didn't exit gracefully, force killing...`);
        this.killProcessTree(sessionId).catch((killErr) => {
          console.error(`[iris:${sessionId}] delayed force kill failed`, killErr);
        });
      }
    }, 10000);

    return { ok: true, sessionId };
  }

  async killProcessTree(sessionId) {
    const entry = this.workers.get(sessionId);
    if (!entry) {
      return false;
    }

    const { child } = entry;
    const exitPromise = waitForChildExit(child);

    try {
      child.kill('SIGTERM');
    } catch {
      // Ignore missing process errors.
    }

    if (process.platform === 'win32' && child.pid) {
      try {
        await execFileAsync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      } catch {
        // Ignore failures from already-exited processes.
      }

      await exitPromise;
      return true;
    }

    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Best-effort process-group termination.
      }
    }

    await exitPromise;

    try {
      child.kill('SIGKILL');
    } catch {
      // Ignore missing process errors.
    }

    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Best-effort process-group termination.
      }
    }

    return true;
  }

  spawnWorker({ sessionId, args, cfgPath, tmpDir, onStdout, onStderr, pipeServer = null, videoStreamer = null, wsUrl = null }) {
    const exePath = this.getExecutablePath();

    try {
      const child = spawn(exePath, args, {
        cwd: path.dirname(exePath),
        env: { ...process.env, IRIS_SPEC_PATH: cfgPath },
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      console.log(`[iris:${sessionId}] START pid=${child.pid}`);
      console.log(`[iris:${sessionId}] exe=${exePath} args=${JSON.stringify(args)}`);

      child.stdout.on('data', (data) => {
        onStdout?.(data);
        writeDirectly(process.stdout, data);
      });
      child.stderr.on('data', (data) => {
        onStderr?.(data);
        writeDirectly(process.stderr, data);
      });
      child.on('error', (err) => {
        onStderr?.(Buffer.from(String(err?.message ?? err)));
        console.error(`[iris:${sessionId}] PROCESS ERROR`, err);
      });

      this.workers.set(sessionId, { child, tmpDir, cfgPath, pipeServer, videoStreamer });

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        const currentEntry = this.workers.get(sessionId);
        if (!currentEntry) {
          return;
        }

        console.log(`[iris:${sessionId}] cleanup triggered`);
        if (currentEntry.pipeServer) {
          currentEntry.pipeServer.close(() => console.log(`[iris:${sessionId}] pipe server closed`));
        }
        if (currentEntry.videoStreamer) {
          currentEntry.videoStreamer.stop().catch((err) => {
            console.error(`[iris:${sessionId}] video streamer shutdown failed`, err);
          });
        }

        if (currentEntry.tmpDir && fs.existsSync(currentEntry.tmpDir)) {
          try {
            fs.rmSync(currentEntry.tmpDir, { recursive: true, force: true });
          } catch {
            // Best-effort cleanup.
          }
        }

        this.workers.delete(sessionId);
      };

      child.once('exit', (code, signal) => {
        console.log(`[iris:${sessionId}] EXIT code=${code} signal=${signal}`);
        cleanup();
      });

      child.once('close', (code, signal) => {
        console.log(`[iris:${sessionId}] CLOSE code=${code} signal=${signal}`);
        cleanup();
      });

      return { ok: true, sessionId, configPath: cfgPath, pipeStarted: Boolean(pipeServer), wsUrl };
    } catch (error) {
      console.error('Failed to start IRIS process:', error);
      if (pipeServer) {
        pipeServer.close();
      }
      if (videoStreamer) {
        videoStreamer.stop().catch(() => {
          // Best-effort cleanup.
        });
      }
      return { ok: false, error: error.message };
    }
  }
}

module.exports = { ProcessManager };
