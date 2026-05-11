<template>
    <!-- Settings Modal -->
    <div id="settingsModal" class="modal-overlay" :class="{ active: uiStore.settingsModalVisible }">
        <div class="modal-content">
            <div class="modal-header">
                <span data-i18n="settingsTitle">{{ $t('settingsTitle') }}</span>
                <span style="cursor:pointer" @click="uiStore.closeSettings()">✕</span>
            </div>

            <div class="tab-header">
                <div class="tab-btn" :class="{ active: settingsStore.activeTab === 'extensions' }" 
                    @click="settingsStore.setTab('extensions')" data-i18n="settingsTabExtensions">
                    {{ $t('settingsTabExtensions') }}
                </div>
                <div class="tab-btn" :class="{ active: settingsStore.activeTab === 'advanced' }" 
                    @click="settingsStore.setTab('advanced')" data-i18n="settingsTabAdvanced">
                    {{ $t('settingsTabAdvanced') }}
                </div>
            </div>

            <div id="settingsContent" style="flex:1; overflow-y:auto; padding:10px;">
                <!-- Extensions Tab -->
                <div v-if="settingsStore.activeTab === 'extensions'" class="settings-section">
                    <h3 style="margin-bottom:15px; color:var(--accent);" data-i18n="settingsExtTitle">{{ $t('settingsExtTitle') }}</h3>
                    <p style="font-size:12px; opacity:0.7; margin-bottom:15px;" data-i18n="settingsExtDesc">
                        {{ $t('settingsExtDesc') }}
                    </p>
                    <div class="ext-install-toolbar">
                        <button class="outline ext-toolbar-btn" @click="showStoreSearch = !showStoreSearch" :disabled="installingExtension">应用商店搜索安装</button>
                        <button class="outline ext-toolbar-btn" @click="handleSelectCrx" :disabled="installingExtension">通过 CRX 安装</button>
                        <button class="ext-toolbar-btn" @click="handleSelectExtension" :disabled="installingExtension" data-i18n="settingsExtAddBtn">
                            {{ $t('settingsExtAddBtn') }}
                        </button>
                    </div>

                    <div v-if="installingExtension" style="margin-bottom:12px; padding:10px; border:1px solid var(--border); border-radius:8px; background:rgba(0,0,0,0.12);">
                        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
                            <span>{{ installProgressMessage || '正在安装扩展...' }}</span>
                            <span>{{ installProgressPercent }}%</span>
                        </div>
                        <div style="height:8px; border-radius:6px; background:rgba(255,255,255,0.12); overflow:hidden;">
                            <div :style="{ width: installProgressPercent + '%', height: '100%', background: 'var(--accent)', transition: 'width 0.2s ease' }"></div>
                        </div>
                    </div>

                    <div v-if="showStoreSearch" style="margin-bottom:14px; border:1px solid var(--border); border-radius:8px; padding:10px;">
                        <div class="ext-search-row">
                            <input v-model="storeSearchQuery" type="text" placeholder="输入扩展名、商店ID或完整商店链接" style="margin:0;">
                            <button class="outline ext-search-btn" @click="handleSearchStore" :disabled="storeSearching || installingExtension">
                                {{ storeSearching ? '搜索中...' : '搜索' }}
                            </button>
                        </div>
                        <div v-if="storeSearchResults.length === 0" style="font-size:12px; opacity:0.6; padding:4px 0;">
                            暂无结果，可尝试更换关键词。
                        </div>
                        <div v-else style="display:flex; flex-direction:column; gap:8px;">
                            <div v-for="item in storeSearchResults" :key="item.id" class="ext-item" style="margin-bottom:0;">
                                <div style="min-width:0;">
                                    <div style="font-weight:bold;">{{ item.name }}</div>
                                    <div style="font-size:11px; opacity:0.65; word-break:break-all;">{{ item.id }}</div>
                                    <div style="font-size:11px; opacity:0.75;">{{ item.description }}</div>
                                </div>
                                <button class="primary outline ext-install-btn" @click="handleInstallStore(item)" :disabled="installingExtension || installingStoreId === item.id">
                                    {{ installingStoreId === item.id ? '安装中...' : '安装' }}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div id="userExtensionList" style="margin-top:10px;">
                        <div v-if="settingsStore.userExtensions.length === 0" 
                            style="opacity:0.5; text-align:center; padding:20px;" data-i18n="settingsExtNoExt">
                            {{ $t('settingsExtNoExt') }}
                        </div>
                        <div v-else v-for="ext in settingsStore.userExtensions" :key="ext.id || ext.path" class="ext-item">
                            <div style="min-width:0; flex:1;">
                                <div style="font-weight:bold;">{{ ext.name || ext.path.split(/[\\/]/).pop() }}</div>
                                <div style="font-size:11px; opacity:0.6; word-break:break-all;">{{ ext.path }}</div>
                                <div style="font-size:11px; opacity:0.65; margin-top:4px;">
                                    来源：{{ ext.source || 'folder' }} <span v-if="ext.version"> · v{{ ext.version }}</span>
                                </div>

                                <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                                    <label style="font-size:11px; opacity:0.8;">应用范围</label>
                                    <select :value="ext.applyMode || 'all'" style="width:84px; margin:0; font-size:12px; padding:6px 8px;"
                                        @change="(e) => handleExtensionScopeChange(ext, e.target.value)">
                                        <option value="all">全部环境</option>
                                        <option value="selected">指定环境</option>
                                    </select>
                                </div>

                                <div v-if="(ext.applyMode || 'all') === 'selected'" class="scope-panel">
                                    <div class="scope-layout">
                                        <div class="scope-group-list">
                                            <button
                                                v-for="group in getScopeGroups(ext)"
                                                :key="group.key"
                                                class="outline scope-group-btn"
                                                :class="{ active: getActiveScopeGroupKey(ext) === group.key }"
                                                @click="setActiveScopeGroup(ext, group.key)">
                                                <span class="scope-group-label">{{ group.label }}</span>
                                                <span class="scope-group-count">{{ group.profiles.length }}</span>
                                            </button>
                                        </div>
                                        <div class="scope-profile-pane">
                                            <div class="scope-profile-header">
                                                <span class="scope-group-name">{{ getActiveScopeGroupLabel(ext) }}</span>
                                                <button class="outline scope-group-select-btn" @click="toggleSelectGroup(ext, getActiveScopeGroup(ext))">
                                                    {{ isGroupFullySelected(ext, getActiveScopeGroup(ext)) ? '取消全选' : '全选当前分组' }}
                                                </button>
                                            </div>
                                            <div class="scope-profile-col">
                                            <button
                                                v-for="profile in getActiveScopeProfiles(ext)"
                                                :key="profile.id"
                                                class="outline scope-profile-chip"
                                                :class="{ selected: (ext.profileIds || []).includes(profile.id) }"
                                                @click="toggleProfileCard(ext, profile.id)">
                                                {{ profile.name }}
                                            </button>
                                                <span v-if="getActiveScopeProfiles(ext).length === 0" class="scope-empty-inline">暂无环境</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button class="danger outline" @click="settingsStore.removeExtension(ext)" 
                                style="padding:4px 12px; font-size:11px;" data-i18n="settingsExtRemove">
                                {{ $t('settingsExtRemove') }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Advanced Tab -->
                <div v-if="settingsStore.activeTab === 'advanced'" class="settings-section">
                    <h3 style="margin-bottom:15px; color:var(--accent);" data-i18n="settingsAdvTitle">{{ $t('settingsAdvTitle') }}</h3>

                    <!-- Developer Features - Unified Tech Style -->
                    <div style="margin-bottom: 25px;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
                            <div style="width:4px; height:20px; background:linear-gradient(180deg, var(--accent), #7c3aed); border-radius:2px;"></div>
                            <h4 style="margin:0; color:var(--text-primary); font-size:15px; font-weight:600; letter-spacing:0.5px;"
                                data-i18n="devFeaturesTitle">
                                {{ $t('devFeaturesTitle') }}
                            </h4>
                        </div>

                        <div style="border:1px solid var(--border); border-radius:12px; padding:4px; background:var(--card-bg);">
                            <!-- UA/WebGL Customize Toggle -->
                            <label class="dev-toggle-item" style="display:flex; align-items:center; gap:14px; padding:14px 16px; cursor:pointer; border-radius:8px; transition:all 0.2s;">
                                <div class="toggle-switch" style="position:relative; width:44px; height:24px; flex-shrink:0;">
                                    <input type="checkbox" :checked="settingsStore.enableUaWebglModify"
                                        style="opacity:0; width:0; height:0; position:absolute;"
                                        @change="e => settingsStore.toggleUaWebglModify(e.target.checked)">
                                    <div class="toggle-track" :style="{ background: settingsStore.enableUaWebglModify ? 'var(--accent)' : 'var(--border)' }"
                                        style="position:absolute; inset:0; border-radius:12px; transition:0.3s;">
                                    </div>
                                    <div class="toggle-knob" :style="{ left: settingsStore.enableUaWebglModify ? '22px' : '2px' }"
                                        style="position:absolute; top:2px; width:20px; height:20px; background:#fff; border-radius:50%; transition:0.3s; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                                    </div>
                                </div>
                                <div style="flex:1;">
                                    <div style="font-size:13px; font-weight:500; color:var(--text-primary);"
                                        data-i18n="uaWebglToggle">{{ $t('uaWebglToggle') }}</div>
                                    <div style="font-size:11px; color:var(--text-secondary); opacity:0.8;"
                                        data-i18n="uaWebglToggleHint">{{ $t('uaWebglToggleHint') }}</div>
                                    <div style="font-size:11px; color:#ffb3b3; margin-top:4px;"
                                        data-i18n="uaWebglToggleWarn">{{ $t('uaWebglToggleWarn') }}</div>
                                </div>
                            </label>

                            <div style="height:1px; background:var(--border); margin:0 16px;"></div>

                            <!-- Remote Debugging Toggle -->
                            <label class="dev-toggle-item" style="display:flex; align-items:center; gap:14px; padding:14px 16px; cursor:pointer; border-radius:8px; transition:all 0.2s;">
                                <div class="toggle-switch" style="position:relative; width:44px; height:24px; flex-shrink:0;">
                                    <input type="checkbox" :checked="settingsStore.enableRemoteDebugging"
                                        style="opacity:0; width:0; height:0; position:absolute;"
                                        @change="e => settingsStore.toggleRemoteDebugging(e.target.checked)">
                                    <div class="toggle-track" :style="{ background: settingsStore.enableRemoteDebugging ? 'var(--accent)' : 'var(--border)' }"
                                        style="position:absolute; inset:0; border-radius:12px; transition:0.3s;">
                                    </div>
                                    <div class="toggle-knob" :style="{ left: settingsStore.enableRemoteDebugging ? '22px' : '2px' }"
                                        style="position:absolute; top:2px; width:20px; height:20px; background:#fff; border-radius:50%; transition:0.3s; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                                    </div>
                                </div>
                                <div style="flex:1;">
                                    <div style="font-size:13px; font-weight:500; color:var(--text-primary);"
                                        data-i18n="debugToggle">{{ $t('debugToggle') }}</div>
                                    <div style="font-size:11px; color:var(--text-secondary); opacity:0.8;"
                                        data-i18n="debugToggleHint">{{ $t('debugToggleHint') }}</div>
                                </div>
                            </label>

                            <div style="height:1px; background:var(--border); margin:0 16px;"></div>

                            <!-- Custom Args Toggle -->
                            <label class="dev-toggle-item" style="display:flex; align-items:center; gap:14px; padding:14px 16px; cursor:pointer; border-radius:8px; transition:all 0.2s;">
                                <div class="toggle-switch" style="position:relative; width:44px; height:24px; flex-shrink:0;">
                                    <input type="checkbox" :checked="settingsStore.enableCustomArgs"
                                        style="opacity:0; width:0; height:0; position:absolute;"
                                        @change="e => settingsStore.toggleCustomArgs(e.target.checked)">
                                    <div class="toggle-track" :style="{ background: settingsStore.enableCustomArgs ? 'var(--accent)' : 'var(--border)' }"
                                        style="position:absolute; inset:0; border-radius:12px; transition:0.3s;">
                                    </div>
                                    <div class="toggle-knob" :style="{ left: settingsStore.enableCustomArgs ? '22px' : '2px' }"
                                        style="position:absolute; top:2px; width:20px; height:20px; background:#fff; border-radius:50%; transition:0.3s; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                                    </div>
                                </div>
                                <div style="flex:1;">
                                    <div style="font-size:13px; font-weight:500; color:var(--text-primary);"
                                        data-i18n="argsToggle">{{ $t('argsToggle') }}</div>
                                    <div style="font-size:11px; color:var(--text-secondary); opacity:0.8;"
                                        data-i18n="argsToggleHint">{{ $t('argsToggleHint') }}</div>
                                </div>
                            </label>

                            <div style="height:1px; background:var(--border); margin:0 16px;"></div>

                            <!-- API Server Toggle -->
                            <label class="dev-toggle-item" style="display:flex; align-items:center; gap:14px; padding:14px 16px; cursor:pointer; border-radius:8px; transition:all 0.2s;">
                                <div class="toggle-switch" style="position:relative; width:44px; height:24px; flex-shrink:0;">
                                    <input type="checkbox" :checked="settingsStore.enableApiServer"
                                        style="opacity:0; width:0; height:0; position:absolute;"
                                        @change="e => settingsStore.toggleApiServer(e.target.checked)">
                                    <div class="toggle-track" :style="{ background: settingsStore.enableApiServer ? 'var(--accent)' : 'var(--border)' }"
                                        style="position:absolute; inset:0; border-radius:12px; transition:0.3s;">
                                    </div>
                                    <div class="toggle-knob" :style="{ left: settingsStore.enableApiServer ? '22px' : '2px' }"
                                        style="position:absolute; top:2px; width:20px; height:20px; background:#fff; border-radius:50%; transition:0.3s; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                                    </div>
                                </div>
                                <div style="flex:1;">
                                    <div style="font-size:13px; font-weight:500; color:var(--text-primary);"
                                        data-i18n="apiToggle">{{ $t('apiToggle') }}</div>
                                    <div style="font-size:11px; color:var(--text-secondary); opacity:0.8;"
                                        data-i18n="apiToggleHint">{{ $t('apiToggleHint') }}</div>
                                </div>
                                <span v-if="settingsStore.apiStarting"
                                    style="font-size:10px; padding:3px 8px; background:rgba(243,156,18,0.18); color:#f39c12; border-radius:10px; font-weight:600;">● {{ $t('apiStarting') }}</span>
                                <span v-else-if="settingsStore.apiRunning"
                                    style="font-size:10px; padding:3px 8px; background:rgba(76,175,80,0.2); color:#4CAF50; border-radius:10px; font-weight:500;">● Live</span>
                            </label>

                            <!-- API Port Config (shown when enabled) -->
                            <div v-if="settingsStore.enableApiServer"
                                style="padding:12px 16px; margin:4px 12px 12px; background:var(--input-bg); border-radius:8px; border:1px solid var(--border);">
                                <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                                    <code style="font-size:12px; color:var(--accent);">http://localhost:{{ settingsStore.apiPort }}</code>
                                    <input type="number" v-model.number="tempApiPort" min="1024" max="65535"
                                        style="width:80px; padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--input-bg); color:var(--text-primary); font-size:12px;">
                                    <button class="outline" @click="handleSaveApiPort" :disabled="settingsStore.apiStarting"
                                        style="padding:6px 14px; font-size:11px;">Apply</button>
                                    <a href="#" @click.prevent="handleOpenApiDocs"
                                        style="font-size:11px; color:var(--accent); margin-left:auto;"
                                        data-i18n="apiDocs">📄 Docs</a>
                                </div>
                                <div v-if="settingsStore.apiStarting"
                                    style="margin-top:10px; font-size:11px; color:var(--text-secondary);">
                                    {{ $t('apiStartingHint') }}
                                </div>
                            </div>

                            <div style="height:1px; background:var(--border); margin:0 16px;"></div>

                            <!-- Window Close Behavior -->
                            <div style="padding:14px 16px;">
                                <div style="font-size:13px; font-weight:500; color:var(--text-primary);"
                                    data-i18n="closeBehaviorTitle">{{ $t('closeBehaviorTitle') }}</div>
                                <div style="font-size:11px; color:var(--text-secondary); opacity:0.8; margin-top:4px;"
                                    data-i18n="closeBehaviorHint">{{ $t('closeBehaviorHint') }}</div>
                                <div style="margin-top:8px;">
                                    <select :value="settingsStore.closeBehavior"
                                        style="width:100%; max-width:260px; margin:0; font-size:12px; padding:7px 10px;"
                                        @change="(e) => settingsStore.setCloseBehavior(e.target.value)">
                                        <option value="tray" data-i18n="closeBehaviorTray">{{ $t('closeBehaviorTray') }}</option>
                                        <option value="quit" data-i18n="closeBehaviorQuit">{{ $t('closeBehaviorQuit') }}</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Watermark Style Section -->
                    <div style="margin-bottom: 25px;">
                        <h4 style="margin-bottom:10px; color:var(--text-primary); font-size:14px;"
                            data-i18n="watermarkTitle">{{ $t('watermarkTitle') }}</h4>
                        <p style="font-size:12px; opacity:0.7; margin-bottom:15px;" data-i18n="watermarkDesc">
                            {{ $t('watermarkDesc') }}
                        </p>

                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <!-- 方案5: 增强水印 (默认) -->
                            <label :style="{ borderColor: settingsStore.watermarkStyle === 'enhanced' ? 'var(--accent)' : 'var(--border)' }"
                                style="display:flex; align-items:flex-start; gap:10px; padding:12px; border:1px solid; border-radius:6px; cursor:pointer; transition:0.2s;">
                                <input type="radio" name="watermarkStyle" value="enhanced"
                                    style="margin-top:3px; width:auto; cursor:pointer;"
                                    :checked="settingsStore.watermarkStyle === 'enhanced'"
                                    @change="settingsStore.saveWatermarkStyle('enhanced')">
                                <div style="flex:1;">
                                    <div style="font-weight:bold; margin-bottom:5px; color:var(--text-primary);"
                                        data-i18n="watermarkEnhancedLabel">
                                        {{ $t('watermarkEnhancedLabel') }}
                                    </div>
                                    <div style="font-size:11px; color:var(--text-secondary); line-height:1.5;"
                                        data-i18n="watermarkEnhancedDesc">
                                        {{ $t('watermarkEnhancedDesc') }}
                                    </div>
                                </div>
                            </label>

                            <!-- 方案1: 顶部横幅 -->
                            <label :style="{ borderColor: settingsStore.watermarkStyle === 'banner' ? 'var(--accent)' : 'var(--border)' }"
                                style="display:flex; align-items:flex-start; gap:10px; padding:12px; border:1px solid; border-radius:6px; cursor:pointer; transition:0.2s;">
                                <input type="radio" name="watermarkStyle" value="banner"
                                    style="margin-top:3px; width:auto; cursor:pointer;"
                                    :checked="settingsStore.watermarkStyle === 'banner'"
                                    @change="settingsStore.saveWatermarkStyle('banner')">
                                <div style="flex:1;">
                                    <div style="font-weight:bold; margin-bottom:5px; color:var(--text-primary);"
                                        data-i18n="watermarkBannerLabel">
                                        {{ $t('watermarkBannerLabel') }}
                                    </div>
                                    <div style="font-size:11px; color:var(--text-secondary); line-height:1.5;"
                                        data-i18n="watermarkBannerDesc">
                                        {{ $t('watermarkBannerDesc') }}
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- Data Directory Section -->
                    <div style="margin-bottom: 25px;">
                        <h4 style="margin-bottom:10px; color:var(--text-primary); font-size:14px;"
                            data-i18n="dataPathTitle">{{ $t('dataPathTitle') }}</h4>
                        <p style="font-size:12px; opacity:0.7; margin-bottom:15px;" data-i18n="dataPathDesc">
                            {{ $t('dataPathDesc') }}
                        </p>

                        <div style="background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:8px; padding:15px;">
                            <div style="margin-bottom:12px;">
                                <label style="font-size:11px; opacity:0.6; margin-bottom:5px; display:block;"
                                    data-i18n="dataPathCurrent">{{ $t('dataPathCurrent') }}</label>
                                <div id="currentDataPath"
                                    style="font-size:12px; font-family:monospace; background:rgba(0,0,0,0.3); padding:8px 12px; border-radius:6px; word-break:break-all; color:var(--accent);">
                                    {{ settingsStore.currentDataPath || 'Loading...' }}
                                </div>
                            </div>

                            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                                <button class="outline" @click="handleSelectDataDirectory" style="flex:1; min-width:120px;"
                                    data-i18n="dataPathBrowse">
                                    {{ $t('dataPathBrowse') }}
                                </button>
                                <button v-if="!settingsStore.isDefaultDataPath" class="outline" @click="handleResetDataDirectory"
                                    style="flex:1; min-width:120px;" data-i18n="dataPathReset">
                                    {{ $t('dataPathReset') }}
                                </button>
                            </div>

                            <div v-if="showRestartWarning" style="margin-top:12px; padding:10px; background:rgba(255,193,7,0.1); border:1px solid rgba(255,193,7,0.3); border-radius:6px;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span style="font-size:16px;">⚠️</span>
                                    <span style="font-size:11px; color:var(--warning);"
                                        data-i18n="dataPathRestart">{{ $t('dataPathRestart') }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal-footer">
                <button @click="uiStore.closeSettings()" data-i18n="btnClose">{{ $t('btnClose') }}</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useUIStore } from '../store/useUIStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { settingService } from '../services/setting.service';
import { ipcService } from '../services/ipc.service';

const uiStore = useUIStore();
const settingsStore = useSettingsStore();

const tempApiPort = ref(12138);
const showRestartWarning = ref(false);
const showStoreSearch = ref(false);
const storeSearchQuery = ref('');
const storeSearchResults = ref([]);
const storeSearching = ref(false);
const profileOptions = ref([]);
const installingExtension = ref(false);
const installingStoreId = ref('');
const installProgressPercent = ref(0);
const installProgressMessage = ref('');
const scopeGroupState = ref({});

onMounted(async () => {
    settingService.onExtensionInstallProgress((payload) => {
        if (!payload) return;
        installingExtension.value = !payload.done;
        installProgressPercent.value = Number(payload.percent || 0);
        installProgressMessage.value = payload.message || '';
        if (payload.done) {
            installProgressPercent.value = 100;
        }
    });

    await settingsStore.loadSettings();
    await loadProfileOptions();
    await handleSearchStore();
});

watch(() => settingsStore.apiPort, (newVal) => {
    tempApiPort.value = newVal;
}, { immediate: true });

const handleSelectExtension = async () => {
    const path = await settingService.selectExtensionFolder();
    if (path) {
        try {
            installingExtension.value = true;
            installProgressPercent.value = 0;
            installProgressMessage.value = '准备安装扩展...';
            await settingsStore.addExtension(path);
            uiStore.showAlert(window.t('settingsExtAdded'));
        } finally {
            installingExtension.value = false;
        }
    }
};

const handleSelectCrx = async () => {
    const path = await settingService.selectExtensionCrx();
    if (path) {
        try {
            installingExtension.value = true;
            installProgressPercent.value = 0;
            installProgressMessage.value = '准备安装 CRX...';
            await settingsStore.addCrxExtension(path);
            uiStore.showAlert('CRX 扩展安装成功');
        } finally {
            installingExtension.value = false;
        }
    }
};

const loadProfileOptions = async () => {
    try {
        profileOptions.value = await ipcService.invoke('get-profiles') || [];
    } catch (e) {
        profileOptions.value = [];
    }
};

const handleSearchStore = async () => {
    storeSearching.value = true;
    try {
        storeSearchResults.value = await settingService.searchExtensionStore(storeSearchQuery.value);
    } catch (e) {
        storeSearchResults.value = [];
        uiStore.showAlert(`商店搜索失败: ${e.message}`);
    } finally {
        storeSearching.value = false;
    }
};

const handleInstallStore = async (item) => {
    try {
        installingExtension.value = true;
        installingStoreId.value = item?.id || '';
        installProgressPercent.value = 0;
        installProgressMessage.value = '准备从商店安装...';
        await settingsStore.addStoreExtension(item);
        uiStore.showAlert(`已安装: ${item.name}`);
    } catch (e) {
        uiStore.showAlert(`安装失败: ${e.message}`);
    } finally {
        installingStoreId.value = '';
        installingExtension.value = false;
    }
};

const handleExtensionScopeChange = async (ext, mode) => {
    const applyMode = mode === 'selected' ? 'selected' : 'all';
    const profileIds = applyMode === 'selected'
        ? Array.from(ext.profileIds || []).map(v => String(v || '')).filter(Boolean)
        : [];
    try {
        await settingsStore.updateExtensionScope(ext.id, applyMode, profileIds);
    } catch (e) {
        uiStore.showAlert(`保存范围失败: ${e.message}`);
    }
};

const getScopeGroups = (ext) => {
    const allProfiles = Array.isArray(profileOptions.value) ? profileOptions.value : [];
    const groups = [{
        key: '__all__',
        label: '全部',
        profiles: allProfiles
    }];
    const tagMap = new Map();
    for (const profile of allProfiles) {
        const tags = Array.isArray(profile.tags) ? profile.tags : [];
        for (const tag of tags) {
            const key = String(tag || '').trim();
            if (!key) continue;
            if (!tagMap.has(key)) tagMap.set(key, []);
            tagMap.get(key).push(profile);
        }
    }
    const sortedTags = Array.from(tagMap.keys()).sort((a, b) => a.localeCompare(b));
    for (const tag of sortedTags) {
        groups.push({ key: `tag:${tag}`, label: tag, profiles: tagMap.get(tag) || [] });
    }
    return groups;
};

const getActiveScopeGroupKey = (ext) => {
    const extId = String(ext?.id || '');
    if (!extId) return '__all__';
    const groups = getScopeGroups(ext);
    const current = scopeGroupState.value[extId];
    if (current && groups.some(g => g.key === current)) return current;
    return '__all__';
};

const setActiveScopeGroup = (ext, groupKey) => {
    const extId = String(ext?.id || '');
    if (!extId) return;
    const normalized = String(groupKey || '__all__');
    scopeGroupState.value = {
        ...scopeGroupState.value,
        [extId]: normalized
    };
};

const getActiveScopeGroup = (ext) => {
    const key = getActiveScopeGroupKey(ext);
    const groups = getScopeGroups(ext);
    return groups.find(group => group.key === key) || groups[0] || { key: '__all__', label: '全部', profiles: [] };
};

const getActiveScopeProfiles = (ext) => {
    const group = getActiveScopeGroup(ext);
    return Array.isArray(group?.profiles) ? group.profiles : [];
};

const getActiveScopeGroupLabel = (ext) => {
    const group = getActiveScopeGroup(ext);
    return String(group?.label || '全部');
};

const isGroupFullySelected = (ext, group) => {
    const selectedSet = new Set((ext.profileIds || []).map(v => String(v || '')));
    const currentProfiles = Array.isArray(group?.profiles) ? group.profiles : [];
    if (currentProfiles.length === 0) return false;
    return currentProfiles.every(profile => selectedSet.has(String(profile.id || '')));
};

const toggleSelectGroup = async (ext, group) => {
    const currentProfiles = Array.isArray(group?.profiles) ? group.profiles : [];
    const selectedSet = new Set((ext.profileIds || []).map(v => String(v || '')));
    const allSelected = currentProfiles.length > 0 && currentProfiles.every(profile => selectedSet.has(String(profile.id || '')));
    if (allSelected) {
        for (const profile of currentProfiles) {
            selectedSet.delete(String(profile.id || ''));
        }
    } else {
        for (const profile of currentProfiles) {
            selectedSet.add(String(profile.id || ''));
        }
    }
    const selected = Array.from(selectedSet).filter(Boolean);
    try {
        await settingsStore.updateExtensionScope(ext.id, 'selected', selected);
    } catch (e) {
        uiStore.showAlert(`保存环境列表失败: ${e.message}`);
    }
};

const toggleProfileCard = async (ext, profileId) => {
    const pid = String(profileId || '');
    if (!pid) return;
    const selectedSet = new Set((ext.profileIds || []).map(v => String(v || '')));
    if (selectedSet.has(pid)) selectedSet.delete(pid);
    else selectedSet.add(pid);
    const selected = Array.from(selectedSet).filter(Boolean);
    try {
        await settingsStore.updateExtensionScope(ext.id, 'selected', selected);
    } catch (e) {
        uiStore.showAlert(`保存环境列表失败: ${e.message}`);
    }
};

const handleSaveApiPort = async () => {
    if (tempApiPort.value < 1024 || tempApiPort.value > 65535) {
        uiStore.showAlert(window.t('apiPortInvalid'));
        return;
    }
    await settingsStore.saveApiPort(tempApiPort.value);
    uiStore.showAlert(window.t('apiPortSaved'));
};

const handleOpenApiDocs = () => {
    ipcService.openUrl('https://browser.geekez.net/doc.html#doc-api');
};

const handleSelectDataDirectory = async () => {
    const path = await settingService.selectDataDirectory();
    if (!path) return;

    uiStore.showConfirm(window.t('dataPathConfirmMigrate'), async () => {
        uiStore.showAlert(window.t('dataPathMigrating'), false);
        try {
            const res = await settingService.setDataDirectory(path, true);
            if (res.success) {
                showRestartWarning.value = true;
                uiStore.showAlert(window.t('dataPathSuccess'));
            } else {
                uiStore.showAlert(window.t('dataPathError') + res.error);
            }
        } catch (e) {
            uiStore.showAlert(window.t('dataPathError') + e.message);
        }
    });
};

const handleResetDataDirectory = async () => {
    uiStore.showConfirm(window.t('dataPathConfirmReset'), async () => {
        const res = await settingService.resetDataDirectory();
        if (res.success) {
            showRestartWarning.value = true;
            uiStore.showAlert(window.t('dataPathResetSuccess'));
        }
    });
};


</script>

<style scoped>
.ext-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    background: var(--bg-color);
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 8px;
}

.dev-toggle-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

.ext-install-toolbar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 12px;
}

.ext-toolbar-btn,
.ext-search-btn,
.ext-install-btn {
    text-transform: none;
    white-space: nowrap;
    font-family: 'Segoe UI', 'Roboto Mono', monospace;
    font-size: clamp(12px, 1.1vw, 16px);
    line-height: 1;
    min-height: 36px;
    padding: 0 14px;
    letter-spacing: 0;
}

.ext-search-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    margin-bottom: 8px;
    align-items: center;
}

.ext-search-btn,
.ext-install-btn {
    min-width: 92px;
}

@media (max-width: 1024px) {
    .ext-toolbar-btn,
    .ext-search-btn,
    .ext-install-btn {
        font-size: 12px;
        min-height: 34px;
        padding: 0 10px;
    }

    .ext-search-btn,
    .ext-install-btn {
        min-width: 78px;
    }
}

.scope-panel {
    margin-top: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.08);
}

.scope-layout {
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr);
    gap: 10px;
}

.scope-group-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.1);
}

.scope-group-btn {
    text-transform: none;
    min-height: 28px;
    padding: 0 8px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
}

.scope-group-btn.active {
    background: rgba(0, 224, 255, 0.18);
    border-color: var(--accent);
}

.scope-group-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.scope-group-count {
    font-size: 10px;
    opacity: 0.75;
    line-height: 1;
}

.scope-profile-pane {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.06);
}

.scope-profile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
}

.scope-group-name {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--text-primary);
    white-space: nowrap;
}

.scope-group-select-btn {
    text-transform: none;
    min-height: 24px;
    padding: 0 6px;
    font-size: 11px;
    line-height: 1;
    flex-shrink: 0;
}

.scope-profile-col {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    min-height: 28px;
}

.scope-profile-chip {
    text-transform: none;
    min-height: 0;
    height: 22px;
    padding: 0 5px;
    font-size: 12px;
    line-height: 1;
    width: auto;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.5;
}

.scope-profile-chip.selected {
    background: rgba(0, 224, 255, 0.18);
    border-color: var(--accent);
    opacity: 1;
}

.scope-empty-inline {
    font-size: 12px;
    opacity: 0.65;
    line-height: 1;
}

</style>
