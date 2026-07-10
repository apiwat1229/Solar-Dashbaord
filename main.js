import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

function getInitialWindowBounds() {
    const { workAreaSize } = screen.getPrimaryDisplay();
    const width = Math.min(workAreaSize.width, Math.max(1280, Math.floor(workAreaSize.width * 0.92)));
    const height = Math.min(workAreaSize.height, Math.max(760, Math.floor(workAreaSize.height * 0.92)));

    return { width, height };
}

function toggleImmersiveFullscreen(win) {
    const isWindows = process.platform === 'win32';
    const nextState = isWindows ? !win.isKiosk() : !win.isFullScreen();

    if (isWindows) {
        win.setKiosk(nextState);
    }

    win.setFullScreen(nextState);
    win.focus();
}

function createWindow() {
    const { width, height } = getInitialWindowBounds();
    const win = new BrowserWindow({
        width,
        height,
        minWidth: 1200,
        minHeight: 760,
        center: true,
        frame: false,
        autoHideMenuBar: true,
        fullscreenable: true,
        backgroundColor: '#f0f2f5',
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

    ipcMain.on('window-toggle-fullscreen', () => toggleImmersiveFullscreen(win));

    ipcMain.on('window-close', () => win.close());

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
