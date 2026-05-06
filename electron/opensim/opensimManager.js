const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const OPENSIM_EXE_PATH = path.join(__dirname, 'third_party', 'opensim-cmd.exe');
const SCALE_TEMPLATE_PATH = path.join(__dirname, 'opensimPipeline', 'Scaling', 'Setup_scaling_LaiUhlrich2022.xml');
const IK_TEMPLATE_PATH = path.join(__dirname, 'opensimPipeline', 'IK', 'Setup_IK.xml');
const GENERIC_MODEL_PATH = path.join(__dirname, 'opensimPipeline', 'Models', 'LaiUhlrich2022.osim');
const MARKER_SET_PATH = path.join(__dirname, 'opensimPipeline', 'Models', 'LaiUhlrich2022_markers_augmenter.xml');

function runOpenSimTool(exePath, setupXmlPath) {
  return new Promise((resolve, reject) => {
    console.log(`Running OpenSim Tool with setup: ${setupXmlPath}`);

    const proc = spawn(exePath, ['run-tool', setupXmlPath], {
      cwd: path.dirname(exePath),
      windowsHide: true,
    });

    let outputLogs = '';

    proc.stdout.on('data', (data) => {
      const message = data.toString();
      outputLogs += message;
      console.log(`[OpenSim]: ${message.trim()}`);
    });

    proc.stderr.on('data', (data) => {
      const message = data.toString();
      outputLogs += message;
      console.error(`[OpenSim Error]: ${message.trim()}`);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, logs: outputLogs });
        return;
      }

      reject(new Error(`OpenSim exited with code ${code}\nLogs:\n${outputLogs}`));
    });
  });
}

function ensureOpenSimExecutable() {
  if (!fs.existsSync(OPENSIM_EXE_PATH)) {
    throw new Error(`OpenSim executable not found at ${OPENSIM_EXE_PATH}`);
  }
}

function ensureOutputDirectory(outputDir) {
  if (typeof outputDir !== 'string' || outputDir.trim().length === 0) {
    throw new Error('outputDir is required.');
  }

  const resolvedOutputDir = outputDir.trim();
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  return resolvedOutputDir;
}

function ensureInputFile(filePath, label) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  const resolvedFilePath = filePath.trim();
  if (!fs.existsSync(resolvedFilePath)) {
    throw new Error(`${label} not found at ${resolvedFilePath}`);
  }

  return resolvedFilePath;
}

function replaceXmlTag(xml, tagName, value) {
  const pattern = new RegExp(`<${tagName}>.*?<\\/${tagName}>|<${tagName}\\s*\\/>`, 'g');
  return xml.replace(pattern, `<${tagName}>${value}</${tagName}>`);
}

function writeTempSetupFile(prefix, xml) {
  const tempPath = path.join(os.tmpdir(), `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.xml`);
  fs.writeFileSync(tempPath, xml, 'utf8');
  return tempPath;
}

function cleanupTempSetupFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;

  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    console.warn('[opensim] Failed to remove temporary setup file:', filePath, error);
  }
}

function resolveScaledModelPath(outputDir, scaledModelPath) {
  if (typeof scaledModelPath === 'string' && scaledModelPath.trim().length > 0) {
    return scaledModelPath.trim();
  }

  return path.join(outputDir, 'subject_scaled.osim');
}

function resolveIkMotionPath(outputDir, ikMotionPath) {
  if (typeof ikMotionPath === 'string' && ikMotionPath.trim().length > 0) {
    return ikMotionPath.trim();
  }

  return path.join(outputDir, 'subject_ik.mot');
}

async function runOpenSimScaleModel({ staticTrcPath, subjectMass, subjectHeight, outputDir, scaledModelPath }) {
  void subjectHeight;

  ensureOpenSimExecutable();
  const resolvedOutputDir = ensureOutputDirectory(outputDir);
  const resolvedStaticTrcPath = ensureInputFile(staticTrcPath, 'staticTrcPath');
  const resolvedScaledModelPath = resolveScaledModelPath(resolvedOutputDir, scaledModelPath);

  let tempScaleSetupPath = null;

  try {
    let scaleXml = fs.readFileSync(SCALE_TEMPLATE_PATH, 'utf8');
    scaleXml = replaceXmlTag(scaleXml, 'mass', subjectMass || 75.0);
    scaleXml = replaceXmlTag(scaleXml, 'model_file', GENERIC_MODEL_PATH);
    scaleXml = replaceXmlTag(scaleXml, 'marker_set_file', MARKER_SET_PATH);
    scaleXml = replaceXmlTag(scaleXml, 'marker_file', resolvedStaticTrcPath);
    scaleXml = replaceXmlTag(scaleXml, 'output_model_file', resolvedScaledModelPath);
    scaleXml = replaceXmlTag(scaleXml, 'time_range', '-1 9999');

    tempScaleSetupPath = writeTempSetupFile('Setup_Scale', scaleXml);

    console.log('--- Starting Scaling ---');
    await runOpenSimTool(OPENSIM_EXE_PATH, tempScaleSetupPath);

    return {
      success: true,
      scaledModelPath: resolvedScaledModelPath,
    };
  } finally {
    cleanupTempSetupFile(tempScaleSetupPath);
  }
}

async function runOpenSimIK({ motionTrcPath, outputDir, scaledModelPath, ikMotionPath }) {
  ensureOpenSimExecutable();
  const resolvedOutputDir = ensureOutputDirectory(outputDir);
  const resolvedMotionTrcPath = ensureInputFile(motionTrcPath, 'motionTrcPath');
  const resolvedScaledModelPath = ensureInputFile(
    resolveScaledModelPath(resolvedOutputDir, scaledModelPath),
    'scaledModelPath',
  );
  const resolvedIkMotionPath = resolveIkMotionPath(resolvedOutputDir, ikMotionPath);

  let tempIkSetupPath = null;

  try {
    let ikXml = fs.readFileSync(IK_TEMPLATE_PATH, 'utf8');
    ikXml = replaceXmlTag(ikXml, 'model_file', resolvedScaledModelPath);
    ikXml = replaceXmlTag(ikXml, 'marker_file', resolvedMotionTrcPath);
    ikXml = replaceXmlTag(ikXml, 'output_motion_file', resolvedIkMotionPath);
    ikXml = replaceXmlTag(ikXml, 'results_directory', resolvedOutputDir);

    tempIkSetupPath = writeTempSetupFile('Setup_IK', ikXml);

    console.log('--- Starting IK ---');
    await runOpenSimTool(OPENSIM_EXE_PATH, tempIkSetupPath);

    return {
      success: true,
      scaledModelPath: resolvedScaledModelPath,
      ikMotionPath: resolvedIkMotionPath,
    };
  } finally {
    cleanupTempSetupFile(tempIkSetupPath);
  }
}

async function runOpenSimPipeline({ staticTrcPath, motionTrcPath, subjectMass, subjectHeight, outputDir }) {
  const scaleResult = await runOpenSimScaleModel({
    staticTrcPath,
    subjectMass,
    subjectHeight,
    outputDir,
  });
  const ikResult = await runOpenSimIK({
    motionTrcPath,
    outputDir,
    scaledModelPath: scaleResult.scaledModelPath,
  });

  return {
    success: true,
    scaledModelPath: scaleResult.scaledModelPath,
    ikMotionPath: ikResult.ikMotionPath,
  };
}

module.exports = {
  runOpenSimScaleModel,
  runOpenSimIK,
  runOpenSimPipeline,
};
