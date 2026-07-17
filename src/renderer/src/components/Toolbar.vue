<template>
    <div>
    <div class="toolbar">
        <div style="display:flex; gap:15px; align-items:center;">
            <label style="font-size:13px; cursor:pointer; display:flex; align-items:center; gap:8px;">
                <input type="checkbox" v-model="proxyStore.settings.enablePreProxy" @change="handlePreProxyToggle" style="width:auto; margin:0;"> 
                <span data-i18n="enablePreProxy">{{ $t('enablePreProxy') }}</span>
            </label>
            <span class="status-badge" :style="proxyStore.proxyStatusStyle">{{ proxyStore.proxyStatusText }}</span>
            <button class="outline" @click="openProxyManager">{{ $t('manageChain') }}</button>
        </div>
        <div style="display:flex; gap:10px;">
            <button class="outline" @click="openExportModal">{{ $t('btnExport') }}</button>
            <div style="position: relative;">
                <button class="outline" @click="toggleImportMenu" id="importBtn">{{ $t('importYaml') }} ▾</button>
                <div v-if="importMenuVisible" class="import-menu-dropdown"
                    style="position: absolute; top: 35px; right: 0; background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; min-width: 200px; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                    <div @click="handleImportFull"
                        style="padding: 10px 15px; cursor: pointer; font-size: 13px;"
                        class="menu-item">
                        🔐 {{ $t('importBackup') || '导入完整备份 (.geekez)' }}
                    </div>
                    <div @click="handleImportYaml"
                        style="padding: 10px 15px; cursor: pointer; border-top: 1px solid var(--border); font-size: 13px;"
                        class="menu-item">
                        📄 {{ $t('importYamlOption') || '导入 YAML 配置' }}
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="sub-toolbar">
        <div class="sub-left">
            <button @click="openAddModal">
                <svg class="essentials-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                    <path d="M12 5v14M5 12h14" />
                </svg>
                {{ $t('newProfile') }}
            </button>
            <button class="outline" @click="toggleSelectAllFiltered">
                {{ allFilteredSelected ? t('unselectFiltered') : t('selectFiltered') }}
            </button>
            <button v-if="selectedCount > 0" class="outline" @click="handleBatchLaunch">
                {{ `${t('batchLaunch')} (${selectedCount})` }}
            </button>
            <button v-if="selectedCount > 0" class="danger" @click="handleBatchDelete">
                {{ `${t('batchDelete')} (${selectedCount})` }}
            </button>
        </div>
        <div class="sub-right">
            <select v-model="selectedTagFilter" style="width: 170px; margin: 0;">
                <option value="">{{ t('allTags') }}</option>
                <option v-for="tag in availableTags" :key="tag" :value="tag">
                    {{ tag }}
                </option>
            </select>
            <input type="text" v-model="searchQuery" @input="handleSearch" class="search-box" :placeholder="$t('search') || 'Search...'">
            <div class="icon-btn" @click="toggleViewMode" title="Toggle View">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                </svg>
            </div>
        </div>
    </div>
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useUIStore } from '../store/useUIStore';
import { useProxyStore } from '../store/useProxyStore';
import { useProfileStore } from '../store/useProfileStore';
import { settingService } from '../services/setting.service';
import { profileService } from '../services/profile.service';

const uiStore = useUIStore();
const proxyStore = useProxyStore();
const profileStore = useProfileStore();
const t = (key) => window.t ? window.t(key) : key;

const searchQuery = ref('');
const importMenuVisible = ref(false);
const availableTags = computed(() => profileStore.availableTags);
const selectedCount = computed(() => profileStore.selectedCount);
const selectedTagFilter = computed({
    get: () => profileStore.selectedTag,
    set: (value) => profileStore.setSelectedTag(value)
});

const allFilteredSelected = computed(() => {
    const ids = profileStore.filteredProfiles.map(profile => profile.id);
    if (ids.length === 0) return false;
    return ids.every(id => profileStore.selectedIds.includes(id));
});

const openAddModal = () => {
  uiStore.openAddModal();
};

const openProxyManager = () => {
  uiStore.openProxyManager();
};

const handlePreProxyToggle = async () => {
    const enabled = !!proxyStore.settings.enablePreProxy;
    try {
        await proxyStore.saveSettings();
        uiStore.showAlert(enabled
            ? (window.t?.('preProxyEnabledMsg') || '前置代理已开启')
            : (window.t?.('preProxyDisabledMsg') || '前置代理已关闭'));
    } catch (e) {
        proxyStore.settings.enablePreProxy = !enabled;
        uiStore.showAlert((window.t?.('preProxySaveFailed') || '保存前置代理设置失败：') + (e?.message || e));
    }
};

const openExportModal = () => {
  uiStore.exportModalVisible = true;
};

const toggleImportMenu = () => {
  importMenuVisible.value = !importMenuVisible.value;
};

const handleImportFull = async () => {
    importMenuVisible.value = false;
    
    // 1. 先调用主进程的 select-backup-file 让用户选文件
    const filePath = await settingService.selectBackupFile();
    if (!filePath) return;

    // 2. 如果选了文件，弹出密码框
    const title = window.t('inputBackupPassword') || 'Enter Backup Password';
    uiStore.openPasswordModal(title, false, async (password) => {
        uiStore.progressTitle = window.t('importingMsg') || 'Restoring Backup...';
        uiStore.progressWarn = window.t('importingWarn') || 'Please DO NOT close the application while importing data.';
        uiStore.progressPercent = 0;
        uiStore.progressMessage = 'Starting...';
        uiStore.progressModalVisible = true;

        let progressInterval = setInterval(async () => {
            try {
                const prog = await settingService.getImportProgress();
                if (prog) {
                    uiStore.progressPercent = prog.percent || 0;
                    uiStore.progressMessage = prog.message || '...';
                }
            } catch(e) {}
        }, 300);

        try {
            const res = await settingService.importFullBackup(filePath, password);
            clearInterval(progressInterval);
            uiStore.progressPercent = 100;
            uiStore.progressMessage = 'Finishing...';
            
            setTimeout(() => {
                uiStore.progressModalVisible = false;
                if (res && res.success) {
                    uiStore.showAlert(window.t('importSuccess') || 'Import successful. App will reload.');
                    setTimeout(() => location.reload(), 1500);
                } else if (res) {
                    uiStore.showAlert((window.t('importError') || 'Error: ') + (res.message || 'Unknown error'));
                }
            }, 600);
        } catch (e) {
            clearInterval(progressInterval);
            uiStore.progressModalVisible = false;
            uiStore.showAlert("Import Failed: " + e.message);
        }
    });
};

const handleImportYaml = async () => {
    importMenuVisible.value = false;
    try {
        const res = await settingService.importData();
        if (res) {
            await proxyStore.loadSettings();
            await profileStore.loadProfiles();
            uiStore.showAlert(window.t('msgImportSuccess') || 'Import successful');
        }
    } catch (e) {
        uiStore.showAlert("Import Failed: " + e.message);
    }
};

const handleSearch = () => {
    profileStore.setSearchText(searchQuery.value);
};

const toggleSelectAllFiltered = () => {
    profileStore.toggleSelectAllFiltered();
};

const handleBatchLaunch = async () => {
    const ids = [...profileStore.selectedIds];
    if (ids.length === 0) return;

    const results = await profileService.launchBatch(ids);
    const failed = results.filter(item => !item.success);
    await profileStore.loadProfiles();

    if (failed.length > 0) {
        uiStore.showAlert(`${t('batchLaunch')} ${results.length - failed.length}/${results.length}, ${t('msgUpdateFailed')} ${failed.length}`);
    } else {
        uiStore.showAlert(`${t('batchLaunch')} OK: ${results.length}`);
    }
};

const handleBatchDelete = () => {
    const ids = [...profileStore.selectedIds];
    if (ids.length === 0) return;
    uiStore.showConfirm(`${t('batchDeleteConfirm')} (${ids.length})`, async () => {
        const results = await profileService.deleteBatch(ids);
        const failed = results.filter(item => !item.success);
        await profileStore.loadProfiles();
        profileStore.clearSelection();

        if (failed.length > 0) {
            uiStore.showAlert(`${t('batchDelete')} ${results.length - failed.length}/${results.length}, ${t('msgUpdateFailed')} ${failed.length}`);
        } else {
            uiStore.showAlert(`${t('batchDelete')} OK: ${results.length}`);
        }
    });
};

const toggleViewMode = () => {
    profileStore.toggleViewMode();
};

onMounted(() => {
    proxyStore.loadSettings();
});
</script>
