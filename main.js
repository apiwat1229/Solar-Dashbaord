import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
    const win = new BrowserWindow({
        width: 1920,
        height: 1080,
        frame: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        },
    });

    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }

    // IPC Handlers
    ipcMain.on('window-minimize', () => win.minimize());
    ipcMain.on('window-toggle-maximize', () => {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
    });

    ipcMain.on('window-close', async () => {
        const result = await dialog.showMessageBox(win, {
            type: 'question',
            buttons: ['Yes', 'No'],
            title: 'Confirm Exit',
            message: 'Are you sure you want to close Solar Dashboard?',
            defaultId: 1,
            cancelId: 1
        });
        if (result.response === 0) win.close();
    });

    ipcMain.on('window-reload', () => win.webContents.reloadIgnoringCache());
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
