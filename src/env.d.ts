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
  ipc?: {
    startIRIS: (options: any) => Promise<any>;
    startIRISStream: (options: any) => Promise<any>;
    stopIRIS: (Id: any) => Promise<any>;
    startIrisRecord: (options: {
      projectPath: string;
      shmName?: string;
      fps?: number;
      pipePath?: string;
      pipeId?: number;
      savePoses?: boolean;
      drawBboxes?: boolean;
      drawKeypoints?: boolean;
      verbose?: boolean;
    }) => Promise<{ ok: boolean; outputDir?: string; args?: string[]; error?: string }>;
    stopIrisRecord: () => Promise<{ ok: boolean; error?: string }>;
    getHardwareCameras: () => Promise<{ ok: boolean; data?: { id: number; name: string }[]; error?: string }>;
    getExtrinsics: (outputDir?: string) => Promise<any>;
    getScene: (outputDir?: string) => Promise<string | null>;
    onIrisData: (callback: (data: IrisData[] | IrisData) => void) => void;

    checkIrisCli: () => Promise<{ found: boolean, path: string }>;
    onIrisCliOutput: (callback: (data: { channel: string; cameraIndex?: number; line: string }) => void) => void;
    projectCreate: (projectData: any) => Promise<{ ok: boolean; canceled?: boolean; error?: string; path?: string; project?: any }>;
    projectOpen: (filePath?: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string; path?: string; project?: any }>;
    projectSave: (filePath: string, projectData: any) => Promise<{ ok: boolean; error?: string; path?: string; project?: any }>;
    presetStoreLoad: () => Promise<{ ok: boolean; error?: string; store?: any }>;
    presetStoreSave: (store: any) => Promise<{ ok: boolean; error?: string; store?: any }>;

    openRecordings: (path: string) => void;
  }
} 
