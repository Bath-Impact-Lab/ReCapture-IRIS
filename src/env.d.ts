/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface IrisData {
  people: {
    person_id: number;
    joint_angles: [number, number, number, number][];
    joint_centers: [number, number, number][]; // Array of 3D coordinates: [x, y, z]
    points_2d: [number, number][];
  }[];
}


interface Window {
  electronAPI?: {
    openExternal: (url: string) => Promise<{ ok: boolean, error?: string }>;
    minimizeWindow: () => Promise<void>;
    toggleMaximizeWindow: () => Promise<{ isMaximized: boolean }>;
    closeWindow: () => Promise<void>;
    isWindowMaximized: () => Promise<{ isMaximized: boolean }>;
    onWindowStateChange: (callback: (data: { isMaximized: boolean }) => void) => () => void;
  }
  opensimAPI?: {
    scaleModel: (params: {
      staticTrcPath: string;
      subjectMass?: number;
      subjectHeight?: number;
      outputDir: string;
      scaledModelPath?: string;
    }) => Promise<{ success: boolean; scaledModelPath?: string; error?: string }>;
    runIK: (params: {
      motionTrcPath: string;
      outputDir: string;
      scaledModelPath?: string;
      ikMotionPath?: string;
    }) => Promise<{ success: boolean; scaledModelPath?: string; ikMotionPath?: string; error?: string }>;
    runPipeline: (params: {
      staticTrcPath: string;
      motionTrcPath: string;
      subjectMass?: number;
      subjectHeight?: number;
      outputDir: string;
    }) => Promise<{ success: boolean; scaledModelPath?: string; ikMotionPath?: string; error?: string }>;
  }
  ipc?: {
    startIRIS: (options: any) => Promise<any>;
    startIRISStream: (options: any) => Promise<any>;
    stopIRIS: (Id: any) => Promise<any>;
    startIrisRecord: (options: {
      projectPath: string;
      recordingPath?: string;
      participantName?: string;
      sessionName?: string;
      shmName?: string;
      fps?: number;
      pipePath?: string;
      pipeId?: number;
      savePoses?: boolean;
      drawBboxes?: boolean;
      drawKeypoints?: boolean;
      verbose?: boolean;
      preserveIngestVideos?: boolean;
    }) => Promise<{ ok: boolean; outputDir?: string; args?: string[]; error?: string }>;
    stopIrisRecord: () => Promise<{ ok: boolean; outputDir?: string; error?: string }>;
    linkRecordings: (options: {
      projectPath: string;
      recordingPath?: string;
      participantName?: string;
      sessionName?: string;
    }) => Promise<{ ok: boolean; canceled?: boolean; outputDir?: string; copiedFiles?: string[]; error?: string }>;
    getHardwareCameras: () => Promise<{ ok: boolean; data?: { id: number; name: string }[]; error?: string }>;
    getExtrinsics: (outputDir?: string) => Promise<any>;
    getScene: (outputDir?: string) => Promise<string | null>;
    onIrisData: (callback: (data: IrisData[] | IrisData) => void) => void;

    checkIrisCli: () => Promise<{ found: boolean, path: string }>;
    onIrisCliOutput: (callback: (data: { channel: string; cameraIndex?: number; line: string }) => void) => void;
    projectCreate: (projectData: any) => Promise<{ ok: boolean; canceled?: boolean; error?: string; path?: string; project?: any }>;
    projectOpen: (filePath?: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string; path?: string; project?: any }>;
    projectSave: (filePath: string, projectData: any) => Promise<{ ok: boolean; error?: string; path?: string; project?: any }>;
    projectPruneRecents: (entries: any[]) => Promise<{ ok: boolean; error?: string; entries?: any[] }>;
    presetStoreLoad: () => Promise<{ ok: boolean; error?: string; store?: any }>;
    presetStoreSave: (store: any) => Promise<{ ok: boolean; error?: string; store?: any }>;
    augmentMarkers: (posesPath: string, outputDir?: string) => Promise<{ ok: boolean; outputPath?: string; dims?: number[]; error?: string }>;

  }
} 
