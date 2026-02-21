import { ElectronAPI } from '@electron-toolkit/preload'

export interface ProjectReport {
  framework: string
  database: string
  cache: string
  services: string[]
  configFound: boolean
  port: number
}

export interface ElectronAPI_Custom {
  selectFolder: () => Promise<string | null>
  analyzeProject: (path: string) => Promise<ProjectReport>
  generateConfig: (path: string, report: ProjectReport) => Promise<{ success: boolean }>
  runDocker: (path: string) => Promise<{ success: boolean; error?: string }>
  checkHealth: (services: string[], port?: number) => Promise<Record<string, boolean>>
  cloneRepo: (repoUrl: string, clonePath: string) => Promise<{ success: boolean; error?: string }>
  openEditor: (path: string) => Promise<{ success: boolean; error?: string }>
  onDockerLog: (callback: (log: string) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    electronAPI: ElectronAPI_Custom
  }
}
