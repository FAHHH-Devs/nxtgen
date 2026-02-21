import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const customAPI = {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  analyzeProject: (path: string) => ipcRenderer.invoke('project:analyze', path),
  generateConfig: (path: string, report: any) => ipcRenderer.invoke('project:generateConfig', path, report),
  runDocker: (path: string) => ipcRenderer.invoke('project:runDocker', path),
  checkHealth: (services: string[]) => ipcRenderer.invoke('project:checkHealth', services),
  onDockerLog: (callback: (log: string) => void) => {
    const subscription = (_event: any, log: string) => callback(log)
    ipcRenderer.on('docker:log', subscription)
    return () => ipcRenderer.removeListener('docker:log', subscription)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if main script is running with `contextIsolation` enabled.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronAPI', customAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.electronAPI = customAPI
}
