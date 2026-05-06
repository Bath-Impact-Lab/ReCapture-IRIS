const ort = require('onnxruntime-node');
const fs = require('fs');
const path = require('path');

const MODEL_PATH = path.join(__dirname, 'augmenter.onnx');
let cachedSession = null;

function writeTRC(frames, markerNames, fps, outputPath) {
    const numFrames = frames.length;
    const numMarkers = markerNames.length;
    const dataRate = fps || 30;  
    const units = 'm';  
 
    let trc = `PathFileType\t4\t(X/Y/Z)\t${outputPath}\n`;
    trc += `DataRate\tCameraRate\tNumFrames\tNumMarkers\tUnits\tOrigDataRate\tOrigDataStartFrame\tOrigNumFrames\n`;
    trc += `${dataRate}\t${dataRate}\t${numFrames}\t${numMarkers}\t${units}\t${dataRate}\t1\t${numFrames}\n`;

    let header3 = 'Frame#\tTime';
    let header4 = '\t';
    for (let i = 0; i < numMarkers; i++) {
        header3 += `\t${markerNames[i]}\t\t`; 
        header4 += `\tX${i + 1}\tY${i + 1}\tZ${i + 1}`;
    }
    
    trc += header3 + '\n' + header4 + '\n\n'; 
 
    for (let i = 0; i < numFrames; i++) {
        const frame = frames[i];
        const time = (i / dataRate).toFixed(5);
        let row = `${i + 1}\t${time}`;
        
        for (let j = 0; j < frame.length; j++) {
            // Safely handle NaN values so OpenSim can parse missing markers
            const val = Number(frame[j]);
            row += `\t${Number.isNaN(val) ? 'NaN' : val.toFixed(5)}`;
        }
        trc += row + '\n';
    }

    fs.writeFileSync(outputPath, trc, 'utf8');
    return outputPath;
}

function makeMarkerNames(count, prefix) {
    const safePrefix = prefix && prefix.trim().length > 0 ? prefix.trim() : 'marker_';
    return Array.from({ length: count }, (_value, index) => `${safePrefix}${index + 1}`);
}

async function getSession() {
    if (!cachedSession) {
        cachedSession = await ort.InferenceSession.create(MODEL_PATH);
    }
    return cachedSession;
}

function normalizeInputPayload(raw) {
    if (Array.isArray(raw)) {
        return raw;
    }
    if (raw && Array.isArray(raw.frames)) {
        return raw.frames;
    }
    return null;
}

function flattenFrames(frames) {
    if (!Array.isArray(frames) || frames.length === 0) {
        throw new Error('poses.json contains no frames.');
    }

    const first = frames[0];
    if (!Array.isArray(first) || first.length === 0) {
        throw new Error('poses.json frames must be arrays of numbers.');
    }

    const featureLength = first.length;
    const sequenceLength = frames.length;
    const flat = new Float32Array(sequenceLength * featureLength);

    for (let i = 0; i < sequenceLength; i += 1) {
        const frame = frames[i];
        if (!Array.isArray(frame) || frame.length !== featureLength) {
            throw new Error('All frames must have the same length.');
        }

        for (let j = 0; j < featureLength; j += 1) {
            const value = frame[j];
            flat[i * featureLength + j] = Number.isFinite(value) ? value : 0;
        }
    }

    return { flat, sequenceLength, featureLength };
}

function reshapeOutput(outputTensor) {
    const dims = outputTensor.dims;
    const data = outputTensor.data;

    if (!Array.isArray(dims) || dims.length < 2) {
        return { dims, frames: Array.from(data) };
    }

    const sequenceLength = dims[dims.length - 2];
    const featureLength = dims[dims.length - 1];
    const frames = [];

    for (let i = 0; i < sequenceLength; i += 1) {
        const start = i * featureLength;
        const end = start + featureLength;
        frames.push(Array.from(data.slice(start, end)));
    }

    return { dims, frames };
}

async function runMarkerAugmentation(posesPath, outputDir) {
    if (typeof posesPath !== 'string' || posesPath.trim().length === 0) {
        throw new Error('posesPath is required.');
    }

    const inputPath = posesPath.trim();
    if (!fs.existsSync(inputPath)) {
        throw new Error(`poses.json not found at ${inputPath}`);
    }
    
    const raw = fs.readFileSync(inputPath, 'utf8');
    
    const refMean = require('./reference_trainFeatures_mean.json');
    const refStd = require('./reference_trainFeatures_std.json');

    let parsed;
    const frameHeights = [];
    const frameMidHips = [];

    const frameThetas = []; 
    let firstFrameMidHip = null;
    let firstFrameTheta = null;

    let inputTrcFrames = null;
    if (inputPath.endsWith('.jsonl')) {
        inputTrcFrames = [];
        parsed = raw.split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => JSON.parse(line))
            .filter(obj => obj.people && obj.people.length > 0)
            .map(obj => {
                const halpeJoints = obj.people[0].joint_centers; 
 
                const midHipX = (halpeJoints[11][0] + halpeJoints[12][0]) / 2;
                const midHipY = (halpeJoints[11][1] + halpeJoints[12][1]) / 2;
                const midHipZ = (halpeJoints[11][2] + halpeJoints[12][2]) / 2;
                frameMidHips.push([midHipX, midHipY, midHipZ]);
 
                const dx = halpeJoints[11][0] - halpeJoints[12][0]; 
                const dz = halpeJoints[11][2] - halpeJoints[12][2]; 
                const theta = -Math.atan2(dx, -dz);
                frameThetas.push(theta);
 
                if (!firstFrameMidHip) {
                    firstFrameMidHip = [midHipX, midHipY, midHipZ];
                    firstFrameTheta = theta;
                }
 
                const crown = halpeJoints[17]; 
                const heelX = (halpeJoints[24][0] + halpeJoints[25][0]) / 2;
                const heelY = (halpeJoints[24][1] + halpeJoints[25][1]) / 2;
                const heelZ = (halpeJoints[24][2] + halpeJoints[25][2]) / 2;
                
                const hdx = crown[0] - heelX;
                const hdy = crown[1] - heelY;
                const hdz = crown[2] - heelZ;
                const calculatedHeight = Math.sqrt(hdx*hdx + hdy*hdy + hdz*hdz);
                const safeHeight = calculatedHeight > 0.001 ? calculatedHeight : 1.0;
                frameHeights.push(safeHeight);
 
                const targetIndices = [18,6,5,12,11,14,13,16,15,25,24,23,22,21,20];
                let frameFeatures = [];
                let rawMarkerFrame = []; 
                
                const cosT = Math.cos(theta);
                const sinT = Math.sin(theta);

                for (let i = 0; i < targetIndices.length; i++) {
                    const idx = targetIndices[i]; 
                     
                    rawMarkerFrame.push(halpeJoints[idx][0]);
                    rawMarkerFrame.push(halpeJoints[idx][1]);
                    rawMarkerFrame.push(halpeJoints[idx][2]);
 
                    let cx = halpeJoints[idx][0] - midHipX;
                    let cy = halpeJoints[idx][1] - midHipY;
                    let cz = halpeJoints[idx][2] - midHipZ;
 
                    let rotX = cx * cosT - cz * sinT;
                    let rotY = cy;
                    let rotZ = cx * sinT + cz * cosT; 

                    frameFeatures.push(rotX / safeHeight);
                    frameFeatures.push(rotY / safeHeight);
                    frameFeatures.push(rotZ / safeHeight);
                } 
                inputTrcFrames.push(rawMarkerFrame); 

                const nominalMetricHeight = 1.70; 
                const nominalWeight = 75.0; 
                frameFeatures.push(nominalMetricHeight, nominalWeight);

                for (let i = 0; i < frameFeatures.length; i++) {
                    frameFeatures[i] = (frameFeatures[i] - refMean[i]) / refStd[i];
                }

                return frameFeatures; 
            });
    } else {
        parsed = JSON.parse(raw);
    }

    const frames = normalizeInputPayload(parsed);
 
    if (!frames) {
        throw new Error('Unsupported poses.json format. Expected an array of frames or { frames: [...] }.');
    }

    if (!inputTrcFrames) {
        inputTrcFrames = frames;
    }

    const { flat, sequenceLength, featureLength } = flattenFrames(frames);
    const session = await getSession();

    const inputTensor = new ort.Tensor('float32', flat, [1, sequenceLength, featureLength]);
    const feeds = { [session.inputNames[0]]: inputTensor };
    const results = await session.run(feeds);

    const outputName = session.outputNames[0];
    const outputTensor = results[outputName];
    const reshaped = reshapeOutput(outputTensor);
   
    const cos0 = Math.cos(firstFrameTheta);
    const sin0 = Math.sin(firstFrameTheta);
     
    const TARGET_METRIC_HEIGHT = 1.77; 

    for (let i = 0; i < reshaped.frames.length; i++) {
        let frame = reshaped.frames[i];
         
        let originalHeight = frameHeights[i] || 1.0; 
        let scaleRatio = TARGET_METRIC_HEIGHT / originalHeight;

        let midHip = frameMidHips[i] || [0, 0, 0];
        let theta = frameThetas[i] || 0;

        let cosInv = Math.cos(-theta);
        let sinInv = Math.sin(-theta);
 
        let metricDeltaHipX = (midHip[0] - firstFrameMidHip[0]) * scaleRatio;
        let metricDeltaHipY = midHip[1] * scaleRatio; 
        let metricDeltaHipZ = (midHip[2] - firstFrameMidHip[2]) * scaleRatio;

        for (let j = 0; j < frame.length; j += 3) {  
            let localX = frame[j] * TARGET_METRIC_HEIGHT;
            let localY = frame[j + 1] * TARGET_METRIC_HEIGHT;
            let localZ = frame[j + 2] * TARGET_METRIC_HEIGHT;
  
            let camX = localX * cosInv - localZ * sinInv;
            let camZ = localX * sinInv + localZ * cosInv;
  
            let seqX = camX + metricDeltaHipX;
            let seqY = localY + metricDeltaHipY;
            let seqZ = camZ + metricDeltaHipZ; 
             
            frame[j] = seqX * cos0 - seqZ * sin0;
            frame[j + 1] = seqY;
            frame[j + 2] = seqX * sin0 + seqZ * cos0;
        }
    }

    // --- PAD MISSING ARM MARKERS IF NEEDED ---
    // If the model generates 35 markers (105 features), we must pad the 8 missing
    // arm markers with NaN so the TRC file contains the expected 43 markers (129 features).
    if (reshaped.frames.length > 0 && reshaped.frames[0].length === 105) {
        for (let i = 0; i < reshaped.frames.length; i++) {
            const frame = reshaped.frames[i];
            const paddedFrame = [];
            
            // 1. Copy the first 21 markers (63 features)
            for (let j = 0; j < 63; j++) paddedFrame.push(frame[j]);
            
            // 2. Inject NaN for the 8 missing arm markers (24 features)
            for (let j = 0; j < 24; j++) paddedFrame.push(NaN);
            
            // 3. Copy the remaining 14 markers (42 features)
            for (let j = 63; j < 105; j++) paddedFrame.push(frame[j]);
            
            reshaped.frames[i] = paddedFrame;
        }
    }

    const targetDir = outputDir && outputDir.trim().length > 0
        ? outputDir.trim()
        : path.dirname(inputPath);
    const outputPath = path.join(targetDir, 'augmented-poses.json');

    fs.mkdirSync(targetDir, { recursive: true });

    const markerNames = [
        // 1. Upper Body / Pelvis Base (First 7)
        "C7_study", "r_shoulder_study", "L_shoulder_study", "r.ASIS_study", "L.ASIS_study",
        "r.PSIS_study", "L.PSIS_study", 
        
        // 2. Corrected Interleaved Legs (Next 14)
        "r_knee_study", "L_knee_study", 
        "r_mknee_study", "L_mknee_study", 
        "r_ankle_study", "L_ankle_study", 
        "r_mankle_study", "L_mankle_study", 
        "r_calc_study", "L_calc_study", 
        "r_toe_study", "L_toe_study", 
        "r_5meta_study", "L_5meta_study", 
        
        // 3. Padded Arms (Next 8)
        "r_lelbow_study", "L_lelbow_study", 
        "r_melbow_study", "L_melbow_study",
        "r_lwrist_study", "L_lwrist_study", 
        "r_mwrist_study", "L_mwrist_study", 
        
        // 4. Interleaved Thighs, Shins, and HJCs (Final 14)
        "r_thigh1_study", "L_thigh1_study", 
        "r_thigh2_study", "L_thigh2_study", 
        "r_thigh3_study", "L_thigh3_study",
        "r_sh1_study", "L_sh1_study", 
        "r_sh2_study", "L_sh2_study", 
        "r_sh3_study", "L_sh3_study",
        "RHJC_study", "LHJC_study"
    ];

    const trcOutputPath = path.join(targetDir, 'augmented-poses.trc');
    const inputTrcOutputPath = path.join(targetDir, 'input-poses.trc');
     
    const framerate = 100; 
    writeTRC(reshaped.frames, markerNames, framerate, trcOutputPath);

    if (Array.isArray(inputTrcFrames) && inputTrcFrames.length > 0) {
        const inputFeatureLength = inputTrcFrames[0].length;
        if (inputFeatureLength % 3 === 0) {
            const inputMarkerNames = makeMarkerNames(inputFeatureLength / 3, 'input_');
            writeTRC(inputTrcFrames, inputMarkerNames, framerate, inputTrcOutputPath);
        } else {
            console.warn('[augmenter] input frames not divisible by 3; skipping input TRC.');
        }
    }

    fs.writeFileSync(outputPath, JSON.stringify({
        source: inputPath,
        dims: reshaped.dims,
        frames: reshaped.frames,
    }, null, 2), 'utf8');

    return { outputPath, dims: reshaped.dims };
}

module.exports = {
    runMarkerAugmentation,
};