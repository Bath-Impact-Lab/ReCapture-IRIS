/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface IrisData {  
  entities: {
      analysis: {
        centers: {
          neck: {
            conf: number,
            x: number,
            y: number,
            z: number,
          },
          pelvis: {
            conf: number,
            x: number,
            y: number,
            z: number,
          }
          spine_mid: {
            conf: number,
            x: number,
            y: number,
            z: number,
          }
        }
        joint_angles: {
          elbow_l: number,
          elbow_r: number,
          hip_l: number,
          hip_r: number,
          knee_l: number,
          knee_r: number,
          shoulder_l: number,
          shoulder_r: number,
          torso_tilt: number,
        }
      }
      id: number,
      skeleton: {
        keypoints_3d: {
          conf: number,
          joint_idx: number,
          x: number,
          y: number,
          z: number,
        }[]
      },
      seq: number,
      t_end: number,
      t_start: number,
    }[]
}

interface Window {
  electronAPI?: {
    openExternal: (url: string) => {ok: boolean, error?: string},
  }
  ipc?: {
    startIRIS: (options: any) => Promise<any>;
    stopIRIS: (Id: any) => Promise<any>;
    onIrisData: (callback: (data: IrisData[] | IrisData) => void) => void;
  }
} 