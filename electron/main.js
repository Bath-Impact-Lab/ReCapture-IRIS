const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require('electron');
const { registerIrisIpc } = require('./iris');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let irisProc = null; // Mock IRIS child process
let irisReady = false;
let irisSubscribers = new Set();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        title: process.env.VITE_APP_TITLE || 'IRIS Starter',
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#111418' : '#ffffff',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    const devServer = process.env.VITE_DEV_SERVER_URL;
    if (devServer) {
        mainWindow.loadURL(devServer);
        if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    registerIrisIpc();
    createWindow();
    startIrisMockProcess();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-external', async (event, url) => {
    console.log('[Main] Received open-external request for:', url);
    try {
        console.log('[Main] Calling shell.openExternal...');
        await shell.openExternal(url);
        console.log('[Main] shell.openExternal call completed successfully.');
        return { ok: true };
    } catch (e) {
        console.error('[Main] shell.openExternal failed:', e);
        return { ok: false, error: e.message };
    }
});