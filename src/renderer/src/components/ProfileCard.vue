<template>
    <div class="profile-item">
        <div class="profile-info">
            <div class="profile-header-row">
                <div class="profile-drag-handle" :title="t('dragProfile')" aria-hidden="true"></div>
                <input
                    type="checkbox"
                    class="batch-checkbox no-drag"
                    :checked="isSelected"
                    @change="toggleSelected"
                >
                <h4 class="profile-name">{{ profile.name }}</h4>
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
                      :style="getTagStyle(tag)">
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
            <button class="no-drag" @click="launch" :disabled="isLaunching">
                <svg class="essentials-action-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                {{ isLaunching ? t('launchingStatus') : t('launch') }}
            </button>
            <button class="outline no-drag" @click="edit">
                <svg class="essentials-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
                </svg>
                {{ t('edit') }}
            </button>
            <button class="danger no-drag" @click="remove">
                <svg class="essentials-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
                </svg>
                {{ t('delete') }}
            </button>
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

const stringToHue = (str) => {
    if (!str) return 210;
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash) % 360;
};

const getTagStyle = (tag) => {
    if (uiStore.theme === 'tech-gray') {
        return {
            backgroundColor: 'rgba(255, 255, 255, 0.86)',
            color: '#707070',
            border: '1px solid rgba(24, 24, 24, 0.11)'
        };
    }
    const hue = stringToHue(tag);
    if (uiStore.theme === 'geek') {
        return {
            backgroundColor: `hsla(${hue}, 44%, 50%, 0.1)`,
            color: `hsl(${hue}, 54%, 72%)`,
            border: '1px solid rgba(72, 82, 103, 0.24)'
        };
    }
    if (uiStore.theme === 'light') {
        return {
            backgroundColor: `hsla(${hue}, 48%, 54%, 0.09)`,
            color: `hsl(${hue}, 42%, 43%)`,
            border: '1px solid rgba(87, 98, 112, 0.12)'
        };
    }
    const isDarkTheme = uiStore.theme === 'dark';
    if (isDarkTheme) {
        return {
            backgroundColor: `hsla(${hue}, 38%, 48%, 0.09)`,
            color: `hsl(${hue}, 48%, 72%)`,
            border: '1px solid rgba(69, 77, 71, 0.23)'
        };
    }
    return {
        backgroundColor: `hsla(${hue}, 68%, 48%, 0.12)`,
        color: `hsl(${hue}, 58%, 34%)`,
        border: `1px solid hsla(${hue}, 62%, 42%, 0.2)`
    };
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
.profile-header-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
}

.profile-name {
    flex: 1 1 auto;
    min-width: 0;
}

.batch-checkbox {
    width: 14px;
    height: 14px;
    margin-right: 0;
    margin-bottom: 0;
}

:deep(.running-badge.launching) {
    color: #f39c12;
    border-color: rgba(243, 156, 18, 0.6);
    background: rgba(243, 156, 18, 0.12);
}
</style>
