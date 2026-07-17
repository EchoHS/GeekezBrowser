<template>
    <!-- 导出环境选择模态框 -->
    <div id="exportSelectModal" class="modal-overlay" style="z-index: 2300;" @mousedown.self="uiStore.closeExportSelectModal()">
        <div class="modal-content" style="width: 480px; max-width: 90vw;">
            <div class="modal-header" style="border-bottom: 1px solid var(--border); padding-bottom: 12px;">
                <span id="exportSelectTitle"
                    style="font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    <span style="color: var(--accent);">📦</span>
                    <span>{{ getModalTitle || t('expSelectTitle') }}</span>
                </span>
                <span style="cursor:pointer; padding: 4px 8px; border-radius: 4px; transition: background 0.15s;"
                    @click="uiStore.closeExportSelectModal()">✕</span>
            </div>
            <div class="modal-body" style="padding: 16px 0;">
                <!-- 顶部控制栏 -->
                <div
                    style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 8px 12px; background: rgba(0,255,255,0.05); border-radius: 8px; border: 1px solid rgba(0,255,255,0.1);">
                    <label
                        style="display: flex; align-items: center; gap: 10px; cursor: pointer; white-space: nowrap; font-size: 13px;">
                        <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll"
                            style="width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer;">
                        <span style="font-weight: 500;">{{ t('expSelectAll') || '全选' }}</span>
                    </label>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span id="exportSelectedCount"
                            style="font-size: 12px; color: var(--accent); font-weight: 600; background: rgba(0,255,255,0.1); padding: 4px 10px; border-radius: 12px;">
                            {{ selectedIds.size }}/{{ profiles.length }}    
                        </span>
                        <span style="font-size: 12px; color: var(--text-secondary);">{{ t('expSelected') || '已选择' }}</span>
                    </div>
                </div>
                <!-- 环境列表 -->
                <div id="exportProfileList"
                    style="max-height: 320px; overflow-y: auto; border: 1px solid var(--border); border-radius: 10px; padding: 8px; background: rgba(0,0,0,0.2);">
                    
                    <div v-if="profiles.length === 0" style="text-align: center; padding: 20px; color: var(--text-secondary);">
                        {{ t('expNoProfiles') || 'No profiles available' }}
                    </div>
                    
                    <label v-for="p in profiles" :key="p.id" 
                        style="display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;"
                        @mouseover="$event.currentTarget.style.background='var(--card-bg)'"
                        @mouseout="$event.currentTarget.style.background='transparent'">
                        <input type="checkbox" :checked="selectedIds.has(p.id)" @change="toggleProfile(p.id)"
                            style="width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer;">
                        <span style="font-size: 14px; font-weight: 500;">{{ p.name }}</span>
                    </label>
                </div>
            </div>
            <div class="modal-footer"
                style="display: flex; justify-content: flex-end; gap: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
                <button class="outline" @click="uiStore.closeExportSelectModal()"
                    style="padding: 8px 20px;">{{ t('cancel') || '取消' }}</button>
                <button @click="confirmExport" :disabled="isExporting"
                    style="padding: 8px 24px; font-weight: 600;">
                    {{ isExporting ? '...' : (t('expConfirm') || '导出') }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useUIStore } from '../store/useUIStore';
import { settingService } from '../services/setting.service';

const uiStore = useUIStore();
const t = window.t || ((key) => key);

const profiles = ref([]);
const selectedIds = ref(new Set());
const isExporting = ref(false);

watch(() => uiStore.exportSelectModalVisible, async (visible) => {
    if (visible) {
        profiles.value = [];
        selectedIds.value.clear();
        try {
            const list = await settingService.getExportProfiles();
            profiles.value = list || [];
            if (profiles.value.length > 0) {
                const newSet = new Set();
                profiles.value.forEach(p => newSet.add(p.id));
                selectedIds.value = newSet;
            }
        } catch (e) {
            console.error('Failed to load export profiles:', e);
        }
    }
});

const isAllSelected = computed(() => {
    return profiles.value.length > 0 && selectedIds.value.size === profiles.value.length;
});

const getModalTitle = computed(() => {
    return uiStore.exportType === 'full-backup' ? t('expSelectTitleFull') : t('expSelectTitle');
});

const toggleSelectAll = () => {
    if (isAllSelected.value) {
        selectedIds.value = new Set();
    } else {
        const newSet = new Set();
        profiles.value.forEach(p => newSet.add(p.id));
        selectedIds.value = newSet;
    }
};

const toggleProfile = (id) => {
    const newSet = new Set(selectedIds.value);
    if (newSet.has(id)) {
        newSet.delete(id);
    } else {
        newSet.add(id);
    }
    selectedIds.value = newSet;
};

const confirmExport = async () => {
    if (selectedIds.value.size === 0) {
        uiStore.showAlert(t('expNoProfiles') || 'No profiles selected');
        return;
    }

    const type = uiStore.exportType;
    const ids = Array.from(selectedIds.value);

    if (type === 'full-backup') {
        const filePath = await settingService.selectSaveFullBackup();
        if (!filePath) return;

        uiStore.openPasswordModal(t('expFullBackup') || 'Full Backup Password', true, async (pwd) => {
            if (!pwd) return;
            uiStore.closeExportSelectModal();
            isExporting.value = true;
            
            uiStore.progressTitle = t('exportingMsg') || 'Preparing Backup...';
            uiStore.progressWarn = t('exportingWarn') || 'Please DO NOT close the application while exporting data.';
            uiStore.progressPercent = 0;
            uiStore.progressMessage = 'Starting Export...';
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
                const res = await settingService.exportFullBackup(pwd, ids, filePath);
                clearInterval(progressInterval);
                uiStore.progressPercent = 100;
                uiStore.progressMessage = 'Finishing...';
                
                setTimeout(() => {
                    uiStore.progressModalVisible = false;
                    if (res && res.success) {
                        uiStore.showAlert(t('msgExportSuccess') || 'Export Successful!');
                    } else if (res && !res.success) {
                        uiStore.showAlert("Export failed: " + (res.message || 'Unknown error'));
                    }
                }, 600);
            } catch(err) {
                clearInterval(progressInterval);
                uiStore.progressModalVisible = false;
                uiStore.showAlert("Export failed: " + err.message);
            } finally {
                isExporting.value = false;
            }
        });
    } else {
        isExporting.value = true;
        try {
            const res = await settingService.exportSelectedData({ type, profileIds: ids });
            if (res && res.success) {
                uiStore.showAlert(t('msgExportSuccess') || 'Export Successful!');
                uiStore.closeExportSelectModal();
            } else if (res && !res.success) {
                uiStore.showAlert("Export failed: " + (res.message || 'Unknown error'));
            }
        } finally {
            isExporting.value = false;
        }
    }
};
</script>
