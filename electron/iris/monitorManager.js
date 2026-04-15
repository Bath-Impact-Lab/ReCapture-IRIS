'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { getIrisCliPath } = require('./config');

const execFileAsync = promisify(execFile);

function waitForMonitorExit(proc, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      proc.off('exit', finish);
      resolve();
    };

    const timer = setTimeout(finish, timeoutMs);
    proc.once('exit', finish);
  });
}

function writeDirectly(target, chunk) {
  if (!target?.writable || chunk == null) {
    return;
  }

  target.write(chunk);
}

class MonitorManager {
  constructor() {
    this.monitorProcess = null;
  }

  isRunning() {
    return this.monitorProcess !== null;
  }

  async start(options = {}) {
    if (this.monitorProcess) {
      await this.stop();
    }

    const outputDir = typeof options.outputDir === 'string' && options.outputDir.trim().length > 0
      ? options.outputDir.trim()
      : null;

    if (!outputDir) {
      return { ok: false, error: 'Output directory is required.' };
    }

    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }

    const exePath = getIrisCliPath();
    if (!fs.existsSync(exePath)) {
      return { ok: false, error: `Executable not found at ${exePath}` };
    }

    try {
      const args = [
        'monitor',
        '--shm-name', typeof options.shmName === 'string' && options.shmName.trim().length > 0 ? options.shmName.trim() : 'iris_shm_ipc',
        '--output-dir', outputDir,
        '--fps', String(Number.isFinite(options.fps) ? options.fps : 30),
      ];

      console.log('[MonitorManager] Starting monitor with args:', args.join(' '));

      if (typeof options.pipePath === 'string' && options.pipePath.trim().length > 0) {
        args.push('--pipe', options.pipePath.trim());
      }

      if (Number.isFinite(options.pipeId)) {
        args.push('--pipe-id', String(options.pipeId));
      }

      if (Number.isFinite(options.scale) && options.scale > 0) {
        args.push('--scale', String(options.scale));
      }

      if (options.savePoses === true) args.push('--save-poses');
      if (options.drawBboxes === true) args.push('--draw-bboxes');
      if (options.drawKeypoints === true) args.push('--draw-keypoints');
      if (options.verbose === true) args.push('--verbose');

      const child = spawn(exePath, args, {
        cwd: path.dirname(exePath),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this.monitorProcess = child;
      child.stdout.on('data', (data) => {
        options.onStdout?.(data);
        writeDirectly(process.stdout, data);
      });
      child.stderr.on('data', (data) => {
        options.onStderr?.(data);
        writeDirectly(process.stderr, data);
      });
      child.on('exit', () => {
        if (this.monitorProcess === child) {
          this.monitorProcess = null;
        }
      });

      return { ok: true, outputDir, args };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async stop() {
    if (!this.monitorProcess) {
      return { ok: true };
    }

    const proc = this.monitorProcess;
    this.monitorProcess = null;
    const exitPromise = waitForMonitorExit(proc);

    if (process.platform === 'win32' && proc.pid) {
      try { 
        proc.stdin.write('\n');
        proc.stdin.end();
 
        const graceful = await Promise.race([
          exitPromise.then(() => true),
          new Promise(resolve => setTimeout(() => resolve(false), 1000))
        ]);

        if (!graceful) {
          console.log('[MonitorManager] SIGINT failed, trying polite taskkill...');
          // 3. Try taskkill WITHOUT /F (sends a WM_CLOSE or polite signal)
          await execFileAsync('taskkill', ['/PID', String(proc.pid), '/T'], { windowsHide: true });
          
          // Wait again
          const taskkillPolite = await Promise.race([
            exitPromise.then(() => true),
            new Promise(resolve => setTimeout(() => resolve(false), 2000))
          ]);

          if (!taskkillPolite) {
            console.warn('[MonitorManager] Graceful shutdown failed. Force killing...');
            // 4. Last resort: The "Strong" kill
            await execFileAsync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true });
          }
        }
      } catch (err) {
        console.error('[MonitorManager] Shutdown error:', err.message);
      }

      console.log('Waiting for monitor process to exit...');
      await exitPromise;
      console.log('Monitor process exited.');
      return { ok: true };
    }

    // For Linux/macOS
    proc.kill('SIGTERM');
    await exitPromise;
    return { ok: true };
  }
}

module.exports = { MonitorManager };
