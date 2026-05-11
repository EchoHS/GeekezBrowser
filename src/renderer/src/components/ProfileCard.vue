<template>
    <div class="profile-item no-drag">
        <div class="profile-info">
            <div style="display:flex; align-items:center;">
                <input
                    type="checkbox"
                    class="batch-checkbox no-drag"
                    :checked="isSelected"
                    @change="toggleSelected"
                >
                <h4>{{ profile.name }}</h4>
                <span
                    :id="`status-${profile.id}`"
                    class="running-badge"
                    :class="{ active: isRunning, launching: isLaunching }"
                >
                    {{ isLaunching ? t('launchingStatus') : t('runningStatus') }}
                </span>
            </div>
            <div class="profile-meta">
                <span v-for="tag in profile.tags" :key="tag" class="tag"
                      :style="{ background: stringToColor(tag) + '33', color: stringToColor(tag), border: '1px solid ' + stringToColor(tag) + '44' }">
                    {{ tag }}
                </span>
                <span class="tag">{{ displayProto }}</span>
                <span class="tag">{{ displayScreen }}</span>
                <span class="tag" style="border:1px solid var(--accent);">
                    <select class="quick-switch-select no-drag" :value="profile.preProxyOverride || 'default'" @change="quickUpdatePreProxy($event.target.value)">
                        <option value="default">{{ t('qsDefault') }}</option>
                        <option value="on">{{ t('qsOn') }}</option>
                        <option value="off">{{ t('qsOff') }}</option>
                    </select>
                </span>
            </div>
        </div>
        <div class="actions">
            <button class="no-drag" @click="launch" :disabled="isLaunching">{{ isLaunching ? t('launchingStatus') : t('launch') }}</button>
            <button class="outline no-drag" @click="edit">{{ t('edit') }}</button>
            <button class="danger no-drag" @click="remove">{{ t('delete') }}</button>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useUIStore } from '../store/useUIStore';
import { useProfileStore } from '../store/useProfileStore';
import { profileService } from '../services/profile.service';

const uiStore = useUIStore();
const profileStore = useProfileStore();

const props = defineProps({
    profile: {
        type: Object,
        required: true
    },
    isRunning: {
        type: Boolean,
        default: false
    },
    isLaunching: {
        type: Boolean,
        default: false
    },
    isSelected: {
        type: Boolean,
        default: false
    }
});

const t = (key) => window.t ? window.t(key) : key;

const stringToColor = (str) => {
    if(!str) return '#ffffff';
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
};

const displayProto = computed(() => {
    if (!props.profile.proxyStr) return 'N/A';
    return (props.profile.proxyStr.split('://')[0] || 'UNK').toUpperCase();
});

const displayScreen = computed(() => {
    const screen = props.profile.fingerprint?.screen;
    if (screen && screen.width && screen.height) {
        return `${screen.width}x${screen.height}`;
    }
    return '0x0';
});

const quickUpdatePreProxy = async (val) => {
    const p = profileStore.profiles.find(x => x.id === props.profile.id);
    if (p) {
        const previous = p.preProxyOverride || 'default';
        p.preProxyOverride = val;
        const safeProfile = JSON.parse(JSON.stringify(p));
        try {
            await profileStore.updateProfile(safeProfile);
        } catch (e) {
            p.preProxyOverride = previous;
            uiStore.showAlert('保存前置代理设置失败: ' + (e?.message || e));
        }
    }
};

const toggleSelected = () => {
    profileStore.toggleSelected(props.profile.id);
};

const launch = async () => {
    if (props.isLaunching) return;
    const res = await profileService.launch(props.profile.id);
    if (!res.success && res.message) {
        uiStore.showAlert(res.message);
    }
};

const edit = () => {
    uiStore.openEditModal(props.profile.id);
};

const remove = () => {
    const msg = window.t('confirmDel') || 'Confirm delete?';
    uiStore.showConfirm(msg, async () => {
        await profileStore.deleteProfile(props.profile.id);
    });
};
</script>

<style scoped>
.batch-checkbox {
    width: 14px;
    height: 14px;
    margin-right: 8px;
    margin-bottom: 0;
}

:deep(.running-badge.launching) {
    color: #f39c12;
    border-color: rgba(243, 156, 18, 0.6);
    background: rgba(243, 156, 18, 0.12);
}
</style>
