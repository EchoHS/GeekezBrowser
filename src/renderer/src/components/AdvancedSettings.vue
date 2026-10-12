<template>
    <div class="advanced-settings">
        <details class="advanced-group">
            <summary class="advanced-summary">
                <h3><SlidersHorizontal :size="17" aria-hidden="true" />{{ $t('advancedBrowser') }}</h3>
                <ChevronDown :size="16" class="advanced-chevron" aria-hidden="true" />
            </summary>
            <div class="advanced-content">
                <label v-for="option in switches" :key="option.field" class="setting-row">
                    <span class="setting-label">{{ $t(option.label) }}</span>
                    <input class="setting-switch" type="checkbox" role="switch" :checked="settings[option.field]" :disabled="changing" @change="update(option.method, $event.target.checked)">
                </label>
                <p v-if="settings.enableUaWebglModify" class="setting-notice">{{ $t('uaWebglToggleWarn') }}</p>
                <div class="setting-row">
                    <label for="advanced-close">{{ $t('advancedClose') }}</label>
                    <select id="advanced-close" :value="settings.closeBehavior" :disabled="changing" @change="update('setCloseBehavior', $event.target.value)">
                        <option value="tray">{{ $t('closeBehaviorTray') }}</option>
                        <option value="quit">{{ $t('closeBehaviorQuit') }}</option>
                    </select>
                </div>
                <div class="setting-row watermark-row">
                    <span>{{ $t('advancedWatermark') }}</span>
                    <div class="segmented-options" role="radiogroup" :aria-label="$t('advancedWatermark')">
                        <label v-for="mode in ['off', 'enhanced', 'banner']" :key="mode" :class="{ selected: settings.watermarkStyle === mode }">
                            <input type="radio" name="advanced-watermark" :value="mode" :checked="settings.watermarkStyle === mode" :disabled="changing" @change="update('saveWatermarkStyle', mode)">
                            {{ $t('advancedWatermark_' + mode) }}
                        </label>
                    </div>
                </div>
            </div>
        </details>

        <details class="advanced-group">
            <summary class="advanced-summary">
                <h3><Cable :size="17" aria-hidden="true" />{{ $t('advancedApi') }}</h3>
                <span v-if="settings.apiRunning" class="connection-status">{{ $t('apiRunning') }}</span>
                <ChevronDown :size="16" class="advanced-chevron" aria-hidden="true" />
            </summary>
            <div class="advanced-content">
                <label class="setting-row">
                    <span>{{ $t('advancedApiEnabled') }}</span>
                    <input class="setting-switch" type="checkbox" role="switch" :checked="settings.enableApiServer" :disabled="changing || settings.apiStarting" @change="update('toggleApiServer', $event.target.checked)">
                </label>
                <div v-if="settings.enableApiServer" class="api-controls">
                    <label for="advanced-port">{{ $t('apiPort') }}</label>
                    <input id="advanced-port" v-model.number="port" type="number" min="1024" max="65535">
                    <button class="outline settings-icon-button" :title="$t('save')" :aria-label="$t('save')" :disabled="changing || settings.apiStarting" @click="savePort"><Check :size="16" /></button>
                    <button class="outline settings-icon-button" :title="$t('advancedApiDocs')" :aria-label="$t('advancedApiDocs')" @click="ipcService.openUrl('https://browser.geekez.net/doc.html#doc-api')"><BookOpen :size="16" /></button>
                    <button class="outline" :disabled="changing || settings.apiStarting" @click="copyApiToken"><Copy :size="15" />{{ $t('apiCopyToken') }}</button>
                    <button class="outline" :disabled="changing || settings.apiStarting" @click="copyApiExportToken"><Copy :size="15" />{{ $t('apiCopyExportToken') }}</button>
                    <code>http://localhost:{{ settings.apiPort }}</code>
                </div>
                <p v-if="settings.apiStarting" class="setting-message" role="status">{{ $t('apiStarting') }}</p>
                <p v-if="notice" class="setting-message" role="status">{{ notice }}</p>
            </div>
        </details>

        <details class="advanced-group">
            <summary class="advanced-summary">
                <h3><FolderOpen :size="17" aria-hidden="true" />{{ $t('advancedDataDirectory') }}</h3>
                <ChevronDown :size="16" class="advanced-chevron" aria-hidden="true" />
            </summary>
            <div class="advanced-content">
                <div class="directory-value" id="currentDataPath">{{ settings.currentDataPath || $t('dataPathLoading') }}</div>
                <div class="setting-actions">
                    <span class="setting-muted">{{ $t(settings.isDefaultDataPath ? 'dataPathDefault' : 'dataPathCustom') }}</span>
                    <button class="outline" :disabled="changing" @click="selectDirectory"><FolderOpen :size="15" />{{ $t('advancedChangeDirectory') }}</button>
                    <button class="outline settings-icon-button" :disabled="changing || settings.isDefaultDataPath" :title="$t('dataPathReset')" :aria-label="$t('dataPathReset')" @click="resetDirectory"><RotateCcw :size="15" /></button>
                </div>
                <p v-if="restartRequired" class="setting-notice" role="status">{{ $t('dataPathRestart') }}</p>
            </div>
        </details>

        <WebDavSettings />
        <p v-if="error" class="setting-error" role="alert">{{ error }}</p>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { SlidersHorizontal, Cable, Check, BookOpen, Copy, FolderOpen, RotateCcw, ChevronDown } from '@lucide/vue';
import { useSettingsStore } from '../store/useSettingsStore';
import { useUIStore } from '../store/useUIStore';
import { settingService } from '../services/setting.service';
import { ipcService } from '../services/ipc.service';
import WebDavSettings from './WebDavSettings.vue';

const settings = useSettingsStore();
const ui = useUIStore();
const port = ref(settings.apiPort);
const changing = ref(false);
const error = ref('');
const notice = ref('');
const restartRequired = ref(false);
const switches = [
    { field: 'enableUaWebglModify', method: 'toggleUaWebglModify', label: 'advancedUa' },
    { field: 'enableRemoteDebugging', method: 'toggleRemoteDebugging', label: 'advancedDebug' },
    { field: 'enableCustomArgs', method: 'toggleCustomArgs', label: 'advancedArgs' }
];
watch(() => settings.apiPort, value => { port.value = value; });

async function update(method, value) {
    changing.value = true;
    error.value = '';
    notice.value = '';
    try { await settings[method](value); }
    catch (caught) { error.value = caught.message; await settings.loadSettings(); }
    finally { changing.value = false; }
}
async function savePort() {
    if (!Number.isInteger(port.value) || port.value < 1024 || port.value > 65535) { error.value = window.t('apiPortInvalid'); return; }
    await update('saveApiPort', port.value);
}
async function copyApiToken() {
    error.value = '';
    notice.value = '';
    try {
        const result = await settingService.copyApiToken();
        if (!result?.success) throw new Error(result?.error || window.t('apiTokenCopyFailed'));
        notice.value = window.t('apiTokenCopied');
    } catch (caught) { error.value = caught.message; }
}
async function copyApiExportToken() {
    error.value = '';
    notice.value = '';
    try {
        const result = await settingService.copyApiExportToken();
        if (result?.canceled) return;
        if (!result?.success) throw new Error(result?.error || window.t('apiExportTokenCopyFailed'));
        notice.value = window.t('apiExportTokenCopied');
    } catch (caught) { error.value = caught.message; }
}
async function selectDirectory() {
    const directory = await settingService.selectDataDirectory();
    if (!directory) return;
    ui.showConfirm(window.t('dataPathConfirmMigrate'), async () => {
        changing.value = true;
        try {
            const result = await settingService.setDataDirectory(directory, true);
            if (!result.success) throw new Error(result.error);
            restartRequired.value = true;
            await settings.loadSettings();
        } catch (caught) { error.value = caught.message; }
        finally { changing.value = false; }
    });
}
function resetDirectory() {
    ui.showConfirm(window.t('dataPathConfirmReset'), async () => {
        changing.value = true;
        try {
            const result = await settingService.resetDataDirectory();
            if (!result.success) throw new Error(result.error || window.t('dataPathError'));
            restartRequired.value = true;
            await settings.loadSettings();
        } catch (caught) { error.value = caught.message; }
        finally { changing.value = false; }
    });
}
</script>

<style>
.advanced-settings { min-width: 0; padding: 0 10px 12px; color: var(--text-primary); font-size: 13px; letter-spacing: 0; }
.advanced-settings *, .advanced-settings button, .advanced-settings input, .advanced-settings select { -webkit-app-region: no-drag; letter-spacing: 0; }
.advanced-group { border-bottom: 1px solid var(--border); }
.advanced-group:last-of-type { border-bottom: 0; }
.advanced-summary { display: flex; align-items: center; gap: 12px; min-height: 56px; box-sizing: border-box; padding: 16px 2px; border-radius: 4px; list-style: none; cursor: pointer; }
.advanced-summary::-webkit-details-marker { display: none; }
.advanced-summary:hover { background: var(--input-bg); }
.advanced-summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.advanced-summary h3 { display: flex; flex: 1; min-width: 0; align-items: center; gap: 9px; margin: 0; color: var(--text-primary); font-size: 14px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.advanced-summary h3 > svg { color: var(--accent); flex-shrink: 0; }
.advanced-chevron { flex: 0 0 16px; color: var(--text-secondary); transform: rotate(-90deg); }
.advanced-group[open] > .advanced-summary > .advanced-chevron { transform: rotate(0); }
.advanced-content { padding: 0 2px 20px; }
.setting-row { box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 44px; margin: 0; padding: 8px 0; }
.setting-label { min-width: 0; }
.advanced-settings input.setting-switch { appearance: none; position: relative; flex: 0 0 36px; width: 36px; height: 21px; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: 12px; background: var(--input-bg); cursor: pointer; box-shadow: none; }
.advanced-settings input.setting-switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 13px; height: 13px; border-radius: 50%; background: var(--text-secondary); transition: transform .15s ease; }
.advanced-settings input.setting-switch:checked { background: var(--accent); border-color: var(--accent); }
.advanced-settings input.setting-switch:checked::after { transform: translateX(15px); background: #fff; }
.advanced-settings input:focus-visible, .advanced-settings button:focus-visible, .advanced-settings select:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.advanced-settings input:disabled, .advanced-settings button:disabled { opacity: .5; cursor: not-allowed; }
.advanced-settings .setting-row select { width: auto; max-width: 65%; font-size: 12px; margin: 0; padding: 8px; }
.segmented-options { display: flex; padding: 3px; gap: 3px; border: 1px solid var(--border); border-radius: 6px; background: var(--input-bg); }
.segmented-options label { position: relative; display: flex; align-items: center; justify-content: center; min-height: 28px; padding: 0 10px; color: var(--text-secondary); border-radius: 4px; cursor: pointer; font-size: 12px; }
.segmented-options label.selected { background: var(--card-bg); color: var(--accent); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.segmented-options input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.segmented-options label:has(input:focus-visible) { outline: 2px solid var(--accent); }
.advanced-settings button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; padding: 0 12px; font-size: 12px; text-transform: none; border-radius: 6px; white-space: normal; line-height: 1.4; }
.advanced-settings .settings-icon-button { width: 34px; min-width: 34px; height: 34px; padding: 0; flex-shrink: 0; }
.setting-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.setting-actions > .setting-muted { margin-right: auto; }
.setting-muted { color: var(--text-secondary); font-size: 12px; }
.setting-notice, .setting-error, .setting-message { margin: 10px 0 0; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.setting-notice { color: var(--warning, #b7791f); }
.setting-error { color: var(--danger, #dc4157); }
.setting-message { color: var(--text-secondary); }
.connection-status { margin-left: auto; font-size: 11px; font-weight: 400; color: var(--success, #319978); }
.directory-value { padding: 12px; background: var(--input-bg); border: 1px solid var(--border); border-radius: 6px; font: 12px/1.6 monospace; overflow-wrap: anywhere; }
.api-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
.advanced-settings .api-controls input { width: 90px; margin: 0; font-size: 12px; padding: 8px; }
.api-controls code { width: 100%; margin-top: 4px; color: var(--text-secondary); font-size: 12px; }
@media (max-width: 520px) { .advanced-settings { padding: 0 2px 8px; } .watermark-row { flex-wrap: wrap; } .advanced-settings .setting-row select { max-width: 60%; } }
</style>
