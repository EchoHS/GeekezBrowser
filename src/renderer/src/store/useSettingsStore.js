import { defineStore } from 'pinia';
import { settingService } from '../services/setting.service';
import { ipcService } from '../services/ipc.service';

export const useSettingsStore = defineStore('settings', {
    state: () => ({
        enableRemoteDebugging: false,
        enableCustomArgs: false,
        enableUaWebglModify: false,
        enableApiServer: false,
        closeBehavior: 'tray',
        apiPort: 12138,
        apiRunning: false,
        apiStarting: false,
        watermarkStyle: 'enhanced',
        userExtensions: [],
        currentDataPath: '',
        isDefaultDataPath: true,
        activeTab: 'extensions'
    }),

    actions: {
        async loadSettings() {
            try {
                const settings = await ipcService.getSettings();
                if (!settings) {
                    console.warn('[SettingsStore] getSettings returned null, using defaults');
                    return;
                }
                this.enableRemoteDebugging = settings.enableRemoteDebugging || false;
                this.enableCustomArgs = settings.enableCustomArgs || false;
                this.enableUaWebglModify = settings.enableUaWebglModify || false;
                this.enableApiServer = settings.enableApiServer || false;
                this.closeBehavior = settings.closeBehavior === 'quit' ? 'quit' : 'tray';
                this.apiPort = settings.apiPort || 12138;
                this.watermarkStyle = settings.watermarkStyle || 'enhanced';

                // Load API Status
                try {
                    const apiStatus = await settingService.getApiStatus();
                    this.apiRunning = apiStatus ? apiStatus.running : false;
                    this.apiStarting = false;
                } catch (e) {
                    console.warn('[SettingsStore] getApiStatus failed:', e);
                    this.apiRunning = false;
                    this.apiStarting = false;
                }

                // Load Extensions
                await this.loadExtensions();

                // Load Data Path Info
                try {
                    const pathInfo = await settingService.getDataPathInfo();
                    if (pathInfo) {
                        this.currentDataPath = pathInfo.currentPath || '';
                        this.isDefaultDataPath = pathInfo.isDefault !== false;
                    }
                } catch (e) {
                    console.warn('[SettingsStore] getDataPathInfo failed:', e);
                }
            } catch (e) {
                console.error('[SettingsStore] loadSettings failed:', e);
            }
        },

        async toggleRemoteDebugging(enabled) {
            this.enableRemoteDebugging = enabled;
            const settings = await ipcService.getSettings();
            settings.enableRemoteDebugging = enabled;
            await ipcService.saveSettings(settings);
        },

        async toggleCustomArgs(enabled) {
            this.enableCustomArgs = enabled;
            const settings = await ipcService.getSettings();
            settings.enableCustomArgs = enabled;
            await ipcService.saveSettings(settings);
        },

        async toggleUaWebglModify(enabled) {
            this.enableUaWebglModify = enabled;
            const settings = await ipcService.getSettings();
            settings.enableUaWebglModify = enabled;
            await ipcService.saveSettings(settings);
        },

        async toggleApiServer(enabled) {
            this.enableApiServer = enabled;
            const settings = await ipcService.getSettings();
            settings.enableApiServer = enabled;
            await ipcService.saveSettings(settings);

            if (enabled) {
                this.apiStarting = true;
                try {
                    const res = await settingService.startApiServer(this.apiPort);
                    this.apiRunning = !!res.success;
                } finally {
                    this.apiStarting = false;
                }
            } else {
                await settingService.stopApiServer();
                this.apiRunning = false;
                this.apiStarting = false;
            }
        },

        async setCloseBehavior(mode) {
            this.closeBehavior = mode === 'quit' ? 'quit' : 'tray';
            const settings = await ipcService.getSettings();
            settings.closeBehavior = this.closeBehavior;
            await ipcService.saveSettings(settings);
        },

        async saveApiPort(port) {
            this.apiPort = port;
            const settings = await ipcService.getSettings();
            settings.apiPort = port;
            await ipcService.saveSettings(settings);

            if (this.enableApiServer) {
                await settingService.stopApiServer();
                this.apiStarting = true;
                try {
                    const res = await settingService.startApiServer(port);
                    this.apiRunning = !!res.success;
                } finally {
                    this.apiStarting = false;
                }
            }
        },

        async saveWatermarkStyle(style) {
            this.watermarkStyle = style;
            const settings = await ipcService.getSettings();
            settings.watermarkStyle = style;
            await ipcService.saveSettings(settings);
        },

        async loadExtensions() {
            try {
                this.userExtensions = await settingService.getUserExtensions() || [];
            } catch (e) {
                console.warn('[SettingsStore] loadExtensions failed:', e);
                this.userExtensions = [];
            }
        },

        async addExtension(path) {
            await settingService.addUserExtension({ type: 'folder', path });
            await this.loadExtensions();
        },

        async addCrxExtension(path) {
            await settingService.addUserExtension({ type: 'crx', path });
            await this.loadExtensions();
        },

        async addStoreExtension(item) {
            const payload = {
                type: 'store',
                storeId: item?.id || item?.storeId || '',
                name: item?.name || '',
                homepage: item?.homepage || ''
            };
            await settingService.addUserExtension(payload);
            await this.loadExtensions();
        },

        async removeExtension(ext) {
            await settingService.removeUserExtension({ id: ext?.id, path: ext?.path });
            await this.loadExtensions();
        },

        async updateExtensionScope(id, applyMode, profileIds = []) {
            const safeProfileIds = Array.from(profileIds || []).map(v => String(v || '')).filter(Boolean);
            await settingService.updateExtensionScope(String(id || ''), applyMode, safeProfileIds);
            await this.loadExtensions();
        },

        setTab(tab) {
            this.activeTab = tab;
        }
    }
});
