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
  startIrisScaleExtrinsicsRecord: (options) => ipcRenderer.invoke('start-iris-scale-extrinsics-record', options),
  stopIrisScaleExtrinsicsRecord: () => ipcRenderer.invoke('stop-iris-scale-extrinsics-record'),
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
  presetStoreLoad: () => ipcRenderer.invoke('preset-store-load'),
  presetStoreSave: (store) => ipcRenderer.invoke('preset-store-save', store),
 
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
