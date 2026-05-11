// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getProfiles: () => ipcRenderer.invoke('get-profiles'),
    saveProfile: (data) => ipcRenderer.invoke('save-profile', data),
    updateProfile: (data) => ipcRenderer.invoke('update-profile', data),
    deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
    launchProfile: (id, watermarkStyle) => ipcRenderer.invoke('launch-profile', id, watermarkStyle),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
    exportProfile: (id) => ipcRenderer.invoke('export-profile', id),
    importProfile: () => ipcRenderer.invoke('import-profile'),
    // 通用 invoke，支持多参数传递
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    getRunningIds: () => ipcRenderer.invoke('get-running-ids'),
    onProfileStatus: (callback) => ipcRenderer.on('profile-status', (event, data) => callback(data)),
    // API events
    onRefreshProfiles: (callback) => ipcRenderer.on('refresh-profiles', () => callback()),
    onApiLaunchProfile: (callback) => ipcRenderer.on('api-launch-profile', (event, id) => callback(id)),
    onExtensionInstallProgress: (callback) => ipcRenderer.on('extension-install-progress', (event, payload) => callback(payload)),
    onProfileLaunchProgress: (callback) => ipcRenderer.on('profile-launch-progress', (event, payload) => callback(payload))
});
