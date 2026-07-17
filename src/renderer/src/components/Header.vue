<template>
    <div class="header">
        <div class="logo">
            <svg class="logo-svg" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="neon" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#00e0ff;stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#2980b9;stop-opacity:1" />
                    </linearGradient>
                </defs>
                <path
                    d="M256 100 H 120 A 20 20 0 0 0 100 120 V 392 A 20 20 0 0 0 120 412 H 392 A 20 20 0 0 0 412 392 V 256 H 256 V 320 H 330 V 332 H 180 V 180 H 330 V 100"
                    fill="url(#neon)" />
                <rect x="360" y="80" width="60" height="40" fill="#ff0055" opacity="0.8" />
                <rect x="80" y="280" width="40" height="20" fill="#00e0ff" opacity="0.6" />
                <rect x="400" y="400" width="30" height="30" fill="#00e0ff" />
                <rect x="80" y="80" width="20" height="20" fill="#ff0055" />
            </svg>
            <div class="logo-text">eek<span class="highlight">EZ</span><span class="ver" id="app-version">{{ appVersion }}</span></div>
        </div>
        <div class="top-actions">
            <select class="theme-select" v-model="uiStore.theme" @change="uiStore.setTheme(uiStore.theme)" id="themeSelect">
                <option value="geek">{{ $t('themeGeek') }}</option>
                <option value="light">{{ $t('themeLight') }}</option>
                <option value="dark">{{ $t('themeDark') }}</option>
                <option value="tech-gray">{{ $t('themeTechGray') }}</option>
            </select>
            <div class="icon-btn" @click="openGithub" title="Github"><svg viewBox="0 0 24 24" width="20" height="20"
                    fill="currentColor">
                    <path
                        d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg></div>
            <div class="icon-btn" @click="openHelp" title="Help"><svg viewBox="0 0 24 24" width="20" height="20"
                    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <circle cx="12" cy="17" r="0.5" fill="currentColor"></circle>
                </svg></div>
            <div class="icon-btn" @click="openSettings" title="Settings"><svg viewBox="0 0 24 24" width="20"
                    height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                    stroke-linejoin="round">
                    <path
                        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z">
                    </path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg></div>
            <div class="icon-btn" :class="{ 'has-update': hasUpdateBadge }" @click="checkUpdates" title="Check Updates" id="btnUpdate"><svg viewBox="0 0 24 24"
                    width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                    stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M16 12l-4-4-4 4"></path>
                    <path d="M12 16V8"></path>
                </svg></div>
            <div class="lang-btn" @click="toggleLang">CN/EN</div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useUIStore } from '../store/useUIStore';
import { ipcService } from '../services/ipc.service';

const uiStore = useUIStore();
const appVersion = ref('');
const pendingAppVersion = ref('');
const pendingXrayVersion = ref('');
const hasUpdateBadge = computed(() => !!pendingAppVersion.value || !!pendingXrayVersion.value);

const SKIPPED_APP_VERSION_KEY = 'geekez_skipped_version';
const SKIPPED_XRAY_VERSION_KEY = 'geekez_skipped_xray_version';

const t = (key) => window.t ? window.t(key) : key;

function normalizeVersion(version) {
    return String(version || '').trim().replace(/^v/i, '');
}

function getSkippedVersion(storageKey) {
    return normalizeVersion(localStorage.getItem(storageKey) || '');
}

function setSkippedVersion(storageKey, version) {
    localStorage.setItem(storageKey, normalizeVersion(version));
}

function clearSkippedVersion(storageKey, version = '') {
    const current = getSkippedVersion(storageKey);
    const normalized = normalizeVersion(version);
    if (!normalized || current === normalized) {
        localStorage.removeItem(storageKey);
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function parseMarkdown(notes) {
    if (!notes) return '';

    return escapeHtml(notes)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="#" onclick="window.electronAPI.invoke(\'open-url\', \'$2\'); return false;" style="color:var(--accent);text-decoration:none;">$1</a>')
        .replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul style="padding-left:20px;margin:5px 0;">$1</ul>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>');
}

function closeCheckingAlert() {
    uiStore.alertModalVisible = false;
}

const openGithub = () => {
    ipcService.openUrl('https://github.com/echohs/GeekezBrowser');
};

const openHelp = () => {
    uiStore.helpModalVisible = true;
};

const openSettings = () => {
    uiStore.settingsModalVisible = true;
};

async function promptAppUpdate(version, url, notes, onSkip = null) {
    pendingAppVersion.value = normalizeVersion(version);
    closeCheckingAlert();

    uiStore.showConfirm(
        `${t('appUpdateFound')} (v${version})`,
        () => {
            pendingAppVersion.value = '';
            clearSkippedVersion(SKIPPED_APP_VERSION_KEY, version);
            ipcService.openUrl(url);
        },
        parseMarkdown(notes),
        {
            cancelText: t('skipVersion'),
            okText: t('startUpgrade'),
            onCancel: () => {
                setSkippedVersion(SKIPPED_APP_VERSION_KEY, version);
                pendingAppVersion.value = '';
                if (typeof onSkip === 'function') onSkip();
            }
        }
    );
}

async function promptXrayUpdate(version, downloadUrl) {
    pendingXrayVersion.value = normalizeVersion(version);
    closeCheckingAlert();

    uiStore.showConfirm(
        `${t('xrayUpdatePrompt')} (v${version})`,
        async () => {
            uiStore.showAlert(`${t('xrayUpdateFound')} (v${version})`, false);
            const success = await ipcService.invoke('download-xray-update', downloadUrl);
            closeCheckingAlert();

            if (success) {
                pendingXrayVersion.value = '';
                clearSkippedVersion(SKIPPED_XRAY_VERSION_KEY, version);
                uiStore.showAlert(t('updateDownloaded'));
                return;
            }

            uiStore.showAlert(t('updateError'));
        },
        '',
        {
            cancelText: t('skipVersion'),
            okText: t('confirmUpdate'),
            onCancel: () => {
                setSkippedVersion(SKIPPED_XRAY_VERSION_KEY, version);
                pendingXrayVersion.value = '';
            }
        }
    );
}

async function checkAppUpdateFlow(onSkip = null) {
    const appRes = await ipcService.invoke('check-app-update');
    const remoteVersion = normalizeVersion(appRes?.remote);

    if (!appRes?.update || !remoteVersion) {
        pendingAppVersion.value = '';
        return { prompted: false, update: false, error: appRes?.error || '' };
    }

    if (getSkippedVersion(SKIPPED_APP_VERSION_KEY) === remoteVersion) {
        pendingAppVersion.value = '';
        return { prompted: false, update: false, skipped: true };
    }

    await promptAppUpdate(remoteVersion, appRes.url, appRes.notes, onSkip);
    return { prompted: true, update: true };
}

async function checkXrayUpdateFlow() {
    const xrayRes = await ipcService.invoke('check-xray-update');
    const remoteVersion = normalizeVersion(xrayRes?.remote);

    if (!xrayRes?.update || !remoteVersion) {
        pendingXrayVersion.value = '';
        return { prompted: false, update: false };
    }

    if (getSkippedVersion(SKIPPED_XRAY_VERSION_KEY) === remoteVersion) {
        pendingXrayVersion.value = '';
        return { prompted: false, update: false, skipped: true };
    }

    await promptXrayUpdate(remoteVersion, xrayRes.downloadUrl);
    return { prompted: true, update: true };
}

const checkUpdates = async () => {
    const btn = document.getElementById('btnUpdate');
    if (btn) {
        btn.style.transition = 'transform 1s';
        btn.style.transform = 'rotate(360deg)';
    }

    uiStore.showAlert(t('checkingUpdate'), false);
    let hadError = false;

    try {
        const appResult = await checkAppUpdateFlow(async () => {
            await checkXrayUpdateFlow();
        });
        hadError = hadError || !!appResult.error;
        if (appResult.prompted) return;

        const xrayResult = await checkXrayUpdateFlow();
        if (xrayResult.prompted) return;

        uiStore.showAlert(hadError ? t('updateError') : t('noUpdate'));
    } catch (e) {
        uiStore.showAlert(t('updateError'));
    } finally {
        setTimeout(() => {
            if (btn) btn.style.transform = 'none';
        }, 1000);
    }
};

const checkUpdatesSilent = async () => {
    try {
        const appResult = await checkAppUpdateFlow(async () => {
            await checkXrayUpdateFlow();
        });
        if (appResult.prompted) return;

        await checkXrayUpdateFlow();
    } catch (e) {
        console.error('Silent update check failed:', e);
    }
};

const toggleLang = () => {
    uiStore.toggleLang();
};

onMounted(() => {
    uiStore.setTheme(uiStore.theme);
    ipcService.getAppInfo()
        .then((info) => {
            if (info && info.version) {
                appVersion.value = `v${info.version}`;
            }
            if (info && info.platform) {
                document.documentElement.dataset.platform = info.platform;
            }
            if (info && info.nativeGlass) {
                document.documentElement.dataset.nativeGlass = 'true';
            } else {
                delete document.documentElement.dataset.nativeGlass;
            }
        })
        .catch(() => { });

    setTimeout(() => {
        checkUpdatesSilent().catch(() => { });
    }, 2200);
});
</script>

<style scoped>
/* Scoped styles will be migrated later if needed */
</style>
