// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getProfiles: () => ipcRenderer.invoke('get-profiles'),
    saveProfile: (data) => ipcRenderer.invoke('save-profile', data),
    updateProfile: (data) => ipcRenderer.invoke('update-profile', data),
    deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
    launchProfile: (id) => ipcRenderer.invoke('launch-profile', id),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
    exportProfile: (id) => ipcRenderer.invoke('export-profile', id),
    importProfile: () => ipcRenderer.invoke('import-profile'),
    // 通用 invoke，用于 open-url 等
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
	getRunningIds: () => ipcRenderer.invoke('get-running-ids'),
	onProfileStatus: (callback) => ipcRenderer.on('profile-status', (event, data) => callback(data))
});