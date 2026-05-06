const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipc', {
  startIRIS: (options) => ipcRenderer.invoke('start-iris', options),
  startIRISStream: (options) => ipcRenderer.invoke('start-iris-stream', options),
  getHardwareCameras: () => ipcRenderer.invoke('get-hardware-cameras'),
  getExtrinsics: (outputDir) => ipcRenderer.invoke('get-extrinsics', outputDir),
  getScene: (outputDir) => ipcRenderer.invoke('get-scene', outputDir),
  stopIRIS: (Id) => ipcRenderer.invoke('stop-iris', Id),
  startIrisRecord: (options) => ipcRenderer.invoke('start-iris-record', options),
  stopIrisRecord: () => ipcRenderer.invoke('stop-iris-record'),
  linkRecordings: (options) => ipcRenderer.invoke('link-recordings', options),
  onIrisData: (callback) => {
    ipcRenderer.on('iris-data', (event, data,) => {
      callback(data)
    })
  },
  onIrisCliOutput: (callback) => {
    ipcRenderer.on('iris-cli-output', (event, data) => {
      callback(data)
    })
  }, 
  checkIrisCli: () => ipcRenderer.invoke('check-iris-cli'),
   
  projectCreate: (projectData) => ipcRenderer.invoke('project-create', projectData),
  projectOpen: (filePath) => ipcRenderer.invoke('project-open', filePath),
  projectSave: (filePath, projectData) => ipcRenderer.invoke('project-save', filePath, projectData),
  projectPruneRecents: (entries) => ipcRenderer.invoke('project-prune-recents', entries),
  presetStoreLoad: () => ipcRenderer.invoke('preset-store-load'),
  presetStoreSave: (store) => ipcRenderer.invoke('preset-store-save', store),
  augmentMarkers: (posesPath, outputDir) => ipcRenderer.invoke('augment-markers', { posesPath, outputDir }),
 
})

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: async (url) => ipcRenderer.invoke('open-external', url),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowStateChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('window-state', handler);
    return () => ipcRenderer.removeListener('window-state', handler);
  },
})

contextBridge.exposeInMainWorld('opensimAPI', {
  scaleModel: (params) => ipcRenderer.invoke('opensim-scale-model', params),
  runIK: (params) => ipcRenderer.invoke('opensim-run-ik', params),
  runPipeline: (params) => ipcRenderer.invoke('run-opensim', params),
})
