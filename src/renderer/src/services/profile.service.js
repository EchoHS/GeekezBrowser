import { ipcService } from './ipc.service';

/**
 * 环境管理服务 - 处理环境启动、删除与状态同步
 */
export const profileService = {
    /**
     * 加载所有环境列表
     */
    async loadProfiles() {
        return await ipcService.invoke('get-profiles');
    },

    /**
     * 启动指定环境
     */
    async launch(id) {
        try {
            const watermarkStyle = localStorage.getItem('geekez_watermark_style') || 'enhanced';
            const lang = localStorage.getItem('geekez_lang') === 'en' ? 'en' : 'cn';
            const msg = await ipcService.invoke('launch-profile', id, watermarkStyle, lang);
            return {
                success: true,
                message: msg || ''
            };
        } catch (error) {
            return { success: false, message: error.message || 'Launch failed' };
        }
    },

    /**
     * 批量启动环境（顺序启动，降低资源峰值）
     */
    async launchBatch(ids = []) {
        const results = [];
        for (const id of ids) {
            // eslint-disable-next-line no-await-in-loop
            const result = await this.launch(id);
            results.push({ id, ...result });
        }
        return results;
    },

    /**
     * 创建/保存新环境
     */
    async saveProfile(data) {
        return await ipcService.invoke('save-profile', data);
    },

    /**
     * 获取当前运行中的环境 ID 列表
     */
    async getRunningIds() {
        try {
            return await ipcService.invoke('get-running-ids') || [];
        } catch (e) {
            console.error('Failed to get running IDs:', e);
            return [];
        }
    },

    async getRuntimeState() {
        try {
            return await ipcService.invoke('get-profile-runtime-state') || { runningIds: [], launchingIds: [] };
        } catch (e) {
            console.error('Failed to get profile runtime state:', e);
            return { runningIds: [], launchingIds: [] };
        }
    },


    /**
     * 删除指定环境
     */
    async deleteProfile(id) {
        try {
            await ipcService.invoke('delete-profile', id);
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message || 'Delete failed' };
        }
    },

    /**
     * 批量删除环境（顺序删除，避免文件锁冲突）
     */
    async deleteBatch(ids = []) {
        const results = [];
        for (const id of ids) {
            // eslint-disable-next-line no-await-in-loop
            const result = await this.deleteProfile(id);
            results.push({ id, ...result });
        }
        return results;
    },

    /**
     * 更新环境配置
     */
    async updateProfile(profile) {
        return await ipcService.invoke('update-profile', profile);
    },

    /**
     * 监听环境运行状态变化
     */
    onStatusChange(callback) {
        if (window.electronAPI && typeof window.electronAPI.onProfileStatus === 'function') {
            window.electronAPI.onProfileStatus(callback);
            return;
        }
        ipcService.on('profile-status', (_event, payload) => callback(payload));
    },

    /**
     * 监听环境列表刷新请求
     */
    onRefreshProfiles(callback) {
        if (window.electronAPI && typeof window.electronAPI.onRefreshProfiles === 'function') {
            window.electronAPI.onRefreshProfiles(callback);
            return;
        }
        ipcService.on('refresh-profiles', () => callback());
    },

    /**
     * 监听来自 API 的启动请求
     */
    onApiLaunchProfile(callback) {
        if (window.electronAPI && typeof window.electronAPI.onApiLaunchProfile === 'function') {
            window.electronAPI.onApiLaunchProfile(callback);
            return;
        }
        ipcService.on('api-launch-profile', (_event, profileId) => callback(profileId));
    },

    onLaunchProgress(callback) {
        if (window.electronAPI && typeof window.electronAPI.onProfileLaunchProgress === 'function') {
            window.electronAPI.onProfileLaunchProgress(callback);
            return;
        }
        ipcService.on('profile-launch-progress', (_event, payload) => callback(payload));
    }
};
