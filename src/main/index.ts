import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { analyzeProject, generateConfig, runDockerCompose, checkHealth } from './services/projectService'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Register IPC handlers
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('project:analyze', async (_, projectPath) => {
  return analyzeProject(projectPath)
})

ipcMain.handle('project:generateConfig', async (_, projectPath, report) => {
  generateConfig(projectPath, report)
  return { success: true }
})

ipcMain.handle('project:runDocker', async (event, projectPath) => {
  try {
    const child = runDockerCompose(projectPath)
    
    child.stdout?.on('data', (data) => {
      event.sender.send('docker:log', data.toString())
    })
    
    child.stderr?.on('data', (data) => {
      event.sender.send('docker:log', data.toString())
    })

    child.on('error', (err) => {
      event.sender.send('docker:log', `PROCESS ERROR: ${err.message}`)
    })

    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('project:checkHealth', async (_, services, port) => {
  return await checkHealth(services, port)
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
