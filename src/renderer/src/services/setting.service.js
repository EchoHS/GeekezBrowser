import { ipcService } from './ipc.service';

/**
 * 系统设置与扩展服务 - 处理更新、API 服务及插件管理
 */
export const settingService = {
    /**
     * 检查软件更新
     */
    async checkUpdates() {
        return await ipcService.invoke('check-updates');
    },

    /**
     * API 服务管理
     */
    async startApiServer(port) {
        return await ipcService.invoke('start-api-server', { port });
    },

    async stopApiServer() {
        return await ipcService.invoke('stop-api-server');
    },

    async getApiStatus() {
        return await ipcService.invoke('get-api-status');
    },

    async copyApiToken() {
        return await ipcService.invoke('copy-api-token');
    },

    /**
     * 扩展/插件管理
     */
    async getUserExtensions() {
        return await ipcService.invoke('get-user-extensions');
    },

    async addUserExtension(payload) {
        return await ipcService.invoke('add-user-extension', payload);
    },

    async removeUserExtension(payload) {
        return await ipcService.invoke('remove-user-extension', payload);
    },

    async selectExtensionFolder() {
        return await ipcService.invoke('select-extension-folder');
    },

    async selectExtensionCrx() {
        return await ipcService.invoke('select-extension-crx');
    },

    async searchExtensionStore(query) {
        return await ipcService.invoke('search-extension-store', query || '');
    },

    async updateExtensionScope(id, applyMode, profileIds = []) {
        return await ipcService.invoke('update-user-extension-scope', { id, applyMode, profileIds });
    },

    onExtensionInstallProgress(callback) {
        if (window.electronAPI && typeof window.electronAPI.onExtensionInstallProgress === 'function') {
            window.electronAPI.onExtensionInstallProgress(callback);
        }
    },

    /**
     * 数据目录管理
     */
    async selectDataDirectory() {
        return await ipcService.invoke('select-data-directory');
    },

    async resetDataDirectory() {
        return await ipcService.invoke('reset-data-directory');
    },

    /**
     * 获取数据目录信息
     */
    async getDataPathInfo() {
        return await ipcService.invoke('get-data-path-info');
    },

    /**
     * 设置数据目录
     */
    async setDataDirectory(newPath, migrate = true) {
        return await ipcService.invoke('set-data-directory', { newPath, migrate });
    },

    /**
     * 获取导出环境列表
     */
    async getExportProfiles() {
        return await ipcService.invoke('get-export-profiles');
    },

    /**
     * 导出选择的数据 (如代理)
     */
    async exportSelectedData(options) {
        return await ipcService.invoke('export-selected-data', options);
    },

    async selectSaveFullBackup() {
        return await ipcService.invoke('select-save-full-backup');
    },

    /**
     * 导出全量备份
     */
    async exportFullBackup(password, profileIds, filePath) {
        return await ipcService.invoke('export-full-backup', { password, profileIds, filePath });
    },

    async selectBackupFile() {
        return await ipcService.invoke('select-backup-file');
    },

    async getImportProgress() {
        return await ipcService.invoke('get-import-progress');
    },

    /**
     * 导入全量备份
     */
    async importFullBackup(filePath, password) {
        return await ipcService.invoke('import-full-backup', { filePath, password });
    },

    /**
     * 导入数据
     */
    async importData() {
        return await ipcService.invoke('import-data');
    },

    /**
     * 获取远程 URL 内容 (订阅等)
     */
    async fetchUrl(url) {
        return await ipcService.invoke('fetch-url', url);
    },

    /**
     * 获取代理节点备注
     */
    async getProxyRemark(url) {
        return await ipcService.invoke('get-proxy-remark', url);
    }
};
