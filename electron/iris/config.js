'use strict';

const { app } = require('electron');
const os = require('os');
const path = require('path');

const PIPE_NAME = '\\\\.\\pipe\\iris_ipc';

function getIrisHomeFromRegistry() {
  if (process.platform !== 'win32') return null;
  try {
    const { execFileSync } = require('child_process');
    const query = (hive) => {
      try {
        const out = execFileSync('reg', ['query', hive, '/v', 'IRIS_HOME'], { 
          encoding: 'utf8', 
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'] 
        });
        const match = out.match(/IRIS_HOME\s+\w+\s+(.+)/);
        return match ? match[1].trim() : null;
      } catch {
        return null;
      }
    };
    return query('HKCU\\Environment') || query('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment');
  } catch {
    return null;
  }
}

function getIrisHome() {
  return process.env.IRIS_HOME || getIrisHomeFromRegistry();
}

const DEV_IRIS_CLI_EXE = process.env.IRIS_CLI_EXE
  || (getIrisHome() && path.join(getIrisHome(), 'bin', 'iris_cli.exe'))
  || path.join(os.homedir(), 'Documents', 'Iris', 'build', 'bin', 'iris_cli.exe');

function getReCaptureAppDataDir() {
  return path.join(app.getPath('appData'), 'ReCapture');
}

function getDa3StartupCalibrationOutputDir() {
  return path.join(getReCaptureAppDataDir(), 'triangulation_da3_startup');
}

function getIrisCliPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'iris_runtime_bundle', 'iris_cli.exe');
  }
  const irisHome = getIrisHome();
  const resolved = process.env.IRIS_CLI_EXE
    || (irisHome && path.join(irisHome, 'bin', 'iris_cli.exe'))
    || path.join(os.homedir(), 'Documents', 'Iris', 'build', 'bin', 'iris_cli.exe');
  return resolved;
}

function getModelDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'iris_runtime_bundle', 'models');
  }
  const irisHome = getIrisHome();
  return process.env.IRIS_MODELS_DIR
    || (irisHome && path.join(irisHome, 'models'))
    || path.join(os.homedir(), 'Documents', 'Iris', 'models');
}

function buildConfigFromOptions(opts = {}) {
  const run_id = opts.run_id || `run-${Date.now()}`;
  const width = opts.camera_width ?? 1920;
  const height = opts.camera_height ?? 1080;
  const cameras = opts.cameras || [];
  
  // Pipeline mode flags
  const captureOnly = opts.capture_only === true;
  const isIngest = opts.is_ingest === true; 
  const outputDir = getDa3StartupCalibrationOutputDir().replace(/\\/g, '/');
  const da3FrameSource = isIngest ? 'ingest' : 'frame_batch';

  const camera_ids = cameras.map((_, index) => index);
  const fps = Number.isFinite(opts.video_fps)
    ? opts.video_fps
    : (cameras.length > 0 && Number.isFinite(cameras[0].fps) ? cameras[0].fps : 30);
  const rotate = Number.isFinite(opts.rotation)
    ? opts.rotation
    : (cameras.length > 0 && Number.isFinite(cameras[0].rotation) ? cameras[0].rotation : 0);
  const modelDir = getModelDir().replace(/\\/g, '/');

  // Define the base shared block
  const shared = {
    execution: {
      device_id: 0
    },
    camera_groups: {
      capture_rig: {
        camera_ids: camera_ids,
        width: width,
        height: height,
        rotate,
        fps: fps,
        batching: true,
        batch_camera_ids: camera_ids
      }
    },
    defaults: {
      output: {
        shm_name: "iris_shm_ipc",
        capacity: 120
      }
    }
  };

  // Only inject models and detection defaults if we are running the full pipeline
  if (!captureOnly) {
    shared.models = {
      detection: {
        rtmdet_people: {
          type: "rtmdet",
          rtmdet_engine_path: `${modelDir}/rtmdet_t_bs4_fp16.trt`,
          rtmdet_input_width: 640,
          rtmdet_input_height: 640,
          rtmdet_conf_threshold: 0.7,
          rtmdet_iou_threshold: 0.45
        }
      },
      reid: {
        osnet_x05: {
          enabled: true,
          engine_path: `${modelDir}/osnet_x05_fp16.trt`,
          min_detection_confidence: 0.55
        }
      },
      pose: {
        rtmpose_people: {
          engine: `${modelDir}/rtmpose_bs16_fp16.trt`,
          batch: 16,
          input_w: 192,
          input_h: 256,
          split_ratio: 2.0
        }
      }
    };
    shared.defaults.detection = {
      batch_size: 4,
      detection_skip_enabled: true,
      detection_skip_frames: 20
    };
  }

  // Define the Source Stage dynamically (Ingest vs. Capture)
  const sourceStage = isIngest ? {
    multi_video_ingestion: {
      id: "ingest",
      camera_group: "capture_rig",
      loop: false,
      ...(opts.video_paths && { video_paths: opts.video_paths }) // Optional payload for ingest
    }
  } : {
    capture: {
      id: "capture",
      camera_group: "capture_rig",
      id_prefix: "cap"
    }
  };

  // Construct the pipeline dynamically
  let pipeline = { ...sourceStage };

  if (!captureOnly) {
    pipeline = {
      ...pipeline,
      detection: {
        id: "det0",
        model: "rtmdet_people",
        reid_model: "osnet_x05"
      },
      global_reid_tracking: {
        id: "global_track",
        single_person_mode: true,
        max_age: 200,
        min_hits: 1,
        min_detection_confidence: 0.5,
        appearance_threshold: 0.45,
        cross_camera_unconfirmed_threshold: 0.55
      },
      pose_estimation: {
        id: "pose0",
        model: "rtmpose_people"
      },
      triangulation: {
        id: "tri0",
        pose_source: "pose0",
        camera_group: "capture_rig",
        da3_startup_calibration: {
          engine: `${modelDir}/DA3-LARGE-1.1.engine`,
          output_dir: outputDir,
          frame_source: da3FrameSource,
          viewer_align: true,
          save_ply: "scene.ply"
        },
        compute_reprojection: true,
        store_reprojection_error: true,
        gate_by_reprojection_error: true,
        max_reprojection_error_px: 50.0,
        smoothing: {
          enabled: true,
          freq: 100.0,
          min_cutoff: 1.0,
          beta: 0.5,
          d_cutoff: 1.0,
          cleanup_interval: 300
        }
      }
    };
  }

  // Always append output as the final stage
  pipeline.output = {
    id: "output",
    camera_group: "capture_rig"
  };

  return {
    run_id,
    runtime: {
      devices: {
        gpu: 0,
        cuda_streams: 2,
        nvenc: false
      },
      buffers: {
        frame_capacity: 256,
        pose_capacity: 256,
        export_shm: true,
        camera_count: Math.max(1, cameras.length),
        camera_slots: 256,
        camera_width: width,
        camera_height: height
      }
    },
    shared: shared,
    pipeline: pipeline
  };
}

module.exports = {
  PIPE_NAME,
  DEV_IRIS_CLI_EXE,
  buildConfigFromOptions,
  getDa3StartupCalibrationOutputDir,
  getIrisCliPath,
};
