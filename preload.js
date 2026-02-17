const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-minimize'),
    toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
    close: () => ipcRenderer.send('window-close'),
    reload: () => ipcRenderer.send('window-reload')
});
