<template>
    <div id="proxyModal" class="modal-overlay" :class="{ active: uiStore.proxyModalVisible }">
        <div class="modal-content" style="max-height: 90vh; height: 85vh; width: 90%; max-width: 800px; display: flex; flex-direction: column; overflow: hidden; padding: 25px;">
            <div class="modal-header">
                <span data-i18n="manageChain">{{ $t('manageChain') }}</span>
                <span style="cursor:pointer" @click="uiStore.closeProxyManager()">✕</span>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-shrink:0; background: rgba(0,0,0,0.05); padding:10px; border-radius:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <select v-model="proxyStore.settings.mode" @change="proxyStore.saveSettings" style="width:160px; margin-bottom:0;">
                        <option v-for="m in proxyStore.modes" :key="m.value" :value="m.value">{{ $t(m.labelKey || m.label) }}</option>
                    </select>
                </div>
                <label style="display:flex; align-items:center; gap:5px; font-size:12px; cursor:pointer;">
                    <input type="checkbox" v-model="proxyStore.settings.notify" @change="proxyStore.saveSettings" style="width:auto; margin:0;"> 
                    <span data-i18n="notify">{{ $t('notify') }}</span>
                </label>
            </div>

            <div class="tab-header" style="flex-shrink:0;">
                <div class="tab-btn no-drag" :class="{ active: proxyStore.currentGroup === 'manual' }" @click="proxyStore.switchGroup('manual')">
                    {{ $t('groupManual') }}
                </div>
                <div v-for="sub in proxyStore.subscriptions" :key="sub.id" 
                    class="tab-btn no-drag" :class="{ active: proxyStore.currentGroup === sub.id }" 
                    @click="proxyStore.switchGroup(sub.id)">
                    {{ sub.name || 'Sub' }}
                </div>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.1); padding:8px 12px; border-radius:4px; margin-bottom:10px; flex-shrink:0;">
                <div style="font-weight:bold; font-size:13px; color:var(--accent);">
                    {{ currentGroupName }} ({{ proxyStore.currentGroupNodes.length }})
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="outline" @click="handleTestGroup" style="font-size:11px;">
                        ⚡ {{ $t('btnTestGroup') }}
                    </button>
                    <button v-if="proxyStore.currentGroup !== 'manual'" class="outline" @click="handleEditSub" style="font-size:11px;">
                        {{ $t('btnEditSub') }}
                    </button>
                    <button class="outline" @click="handleNewSub" style="font-size:11px;">
                        {{ $t('btnImportSub') }}
                    </button>
                    <button class="outline" @click="uiStore.batchAddProxyModalVisible = true" style="font-size:11px;">
                        + {{ $t('batchAdd') || 'Add Nodes' }}
                    </button>
                </div>
            </div>

            <div class="proxy-list-container" style="flex:1; overflow-y:auto; min-height: 100px; margin: 10px 0; border: 1px solid var(--border); border-radius: 4px; padding: 5px;">
                <div v-for="p in proxyStore.currentGroupNodes" :key="p.id" 
                    class="proxy-row no-drag" 
                    :style="isNodeSelected(p.id) ? { background: 'rgba(0,224,255,0.08)' } : {}">
                    <div class="proxy-left">
                        <input :type="proxyStore.settings.mode === 'single' ? 'radio' : 'checkbox'" 
                            :name="'ps_' + p.id" 
                            :checked="isNodeActive(p)"
                            @change="handleNodeToggle(p.id)"
                            style="cursor:pointer; margin:0;" class="no-drag">
                    </div>
                    <div class="proxy-mid">
                        <div class="proxy-header">
                            <span class="proxy-proto">{{ getNodeProto(p.url) }}</span>
                            <span class="proxy-remark" :title="p.remark">{{ p.remark || 'Node' }}</span>
                            <span v-if="p.latency !== undefined" 
                                class="proxy-latency" 
                                :style="getLatencyStyle(p)"
                                :title="p.latencyErr">
                                {{ getLatencyText(p) }}
                            </span>
                            <span v-else-if="proxyStore.testingIds.has(p.id)" class="proxy-latency" style="border:1px solid var(--text-secondary); opacity:0.5;">...</span>
                            <span v-else class="proxy-latency" style="border:1px solid var(--text-secondary); opacity:0.3;">-</span>
                        </div>
                    </div>
                    <div class="proxy-right">
                        <button class="outline no-drag" @click="proxyStore.testLatency(p.id)" :disabled="proxyStore.testingIds.has(p.id)">
                            {{ proxyStore.testingIds.has(p.id) ? '...' : $t('btnTest') }}
                        </button>
                        <button v-if="proxyStore.currentGroup === 'manual'" class="outline no-drag" @click="handleEditNode(p)">
                            {{ $t('btnEdit') }}
                        </button>
                        <button class="danger no-drag" @click="proxyStore.deleteProxy(p.id)">✕</button>
                    </div>
                </div>
                <div v-if="proxyStore.currentGroupNodes.length === 0" style="text-align:center; padding:40px; opacity:0.5;">
                    {{ $t('msgNoData') || 'No Nodes found' }}
                </div>
            </div>

            <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border); flex-shrink:0; display:flex; justify-content:flex-end; gap:10px;">
                <button class="primary" @click="uiStore.closeProxyManager()" style="min-width: 140px; font-weight: 600;">{{ $t('done') }}</button>
            </div>
        </div>
    </div>

    <!-- Batch Add Modal (Now handled here or can be separate component) -->
    <div v-if="uiStore.batchAddProxyModalVisible" class="modal-overlay active" style="z-index: 1300;">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <span>{{ $t('batchAdd') || 'Batch Add Nodes' }}</span>
                <span style="cursor:pointer" @click="uiStore.batchAddProxyModalVisible = false">✕</span>
            </div>
            <p style="font-size:12px; opacity:0.7; margin: 10px 0;">Paste links here (one per line). Supports vmess, vless, trojan, ss, socks5.</p>
            <textarea v-model="batchInput" style="height:250px; font-family:monospace; font-size:11px; width: 100%; box-sizing: border-box;" placeholder="vmess://...&#10;ss://..."></textarea>
            <div style="text-align:right; margin-top:15px;">
                <button class="primary" @click="handleSubmitBatch" :disabled="!batchInput.trim()">{{ $t('save') }}</button>
            </div>
        </div>
    </div>

    <div v-if="editNodeModalVisible" class="modal-overlay active" style="z-index: 1300;" @mousedown.self="closeEditNodeModal">
        <div class="modal-content" style="max-width: 560px;">
            <div class="modal-header">
                <span>{{ $t('btnEdit') }} {{ $t('remark') }}</span>
                <span style="cursor:pointer" @click="closeEditNodeModal">✕</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
                <label style="font-size:12px; opacity:0.75;">{{ $t('remark') }}</label>
                <input v-model="editNodeForm.remark" type="text" maxlength="120" />

                <label style="font-size:12px; opacity:0.75;">{{ $t('proxyLink') }}</label>
                <textarea
                    v-model="editNodeForm.url"
                    rows="5"
                    spellcheck="false"
                    autocomplete="off"
                    placeholder="vmess:// / vless:// / trojan:// / ss:// / socks:// / http:// / Direct"
                ></textarea>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
                <button class="outline" @click="closeEditNodeModal">{{ $t('cancel') }}</button>
                <button class="primary" @click="handleSubmitEditNode">{{ $t('save') }}</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useUIStore } from '../store/useUIStore';
import { useProxyStore } from '../store/useProxyStore';
import { getProxyRemark, getUnsupportedXrayInsecureWarning } from '../utils/helpers';

const uiStore = useUIStore();
const proxyStore = useProxyStore();

const batchInput = ref('');
const editNodeModalVisible = ref(false);
const editNodeForm = ref({
    id: '',
    remark: '',
    url: ''
});

const currentGroupName = computed(() => {
    if (proxyStore.currentGroup === 'manual') return 'Manual';
    const sub = proxyStore.subscriptions.find(s => s.id === proxyStore.currentGroup);
    return sub ? sub.name : 'Sub';
});

const isNodeSelected = (id) => {
    return proxyStore.settings.mode === 'single' && proxyStore.settings.selectedId === id;
};

const isNodeActive = (node) => {
    if (proxyStore.settings.mode === 'single') return isNodeSelected(node.id);
    return node.enable !== false;
};

const handleNodeToggle = (id) => {
    if (proxyStore.settings.mode === 'single') {
        proxyStore.selectProxy(id);
    } else {
        proxyStore.toggleProxy(id);
    }
};

const getNodeProto = (url) => {
    return (url.split('://')[0] || 'UNK').toUpperCase();
};

const getLatencyText = (node) => {
    if (node.latency === -1 || node.latency === 9999) return 'Fail';
    return node.latency + 'ms';
};

const getLatencyStyle = (node) => {
    if (node.latency === -1 || node.latency === 9999) return { borderColor: '#e74c3c', color: '#e74c3c' };
    const color = node.latency < 500 ? '#27ae60' : (node.latency < 1000 ? '#f39c12' : '#e74c3c');
    return { borderColor: color, color: color };
};

const handleTestGroup = async () => {
    await proxyStore.testCurrentGroup();
};

const handleEditSub = () => {
    const sub = proxyStore.subscriptions.find(s => s.id === proxyStore.currentGroup);
    if (!sub) return;
    uiStore.currentSubEdit = sub;
    uiStore.subEditModalVisible = true;
};

const handleNewSub = () => {
    uiStore.currentSubEdit = null;
    uiStore.subEditModalVisible = true;
};

const handleEditNode = (node) => {
    if (!node) return;
    editNodeForm.value = {
        id: node.id,
        remark: node.remark || '',
        url: node.url || ''
    };
    editNodeModalVisible.value = true;
};

const closeEditNodeModal = () => {
    editNodeModalVisible.value = false;
};

const handleSubmitEditNode = async () => {
    const targetId = editNodeForm.value.id;
    const target = proxyStore.settings.preProxies.find(p => p.id === targetId);
    if (!target) {
        closeEditNodeModal();
        return;
    }

    const url = String(editNodeForm.value.url || '').trim();
    if (!url) {
        uiStore.showAlert('代理链接不能为空');
        return;
    }

    const remark = String(editNodeForm.value.remark || '').trim();
    const insecureWarning = getUnsupportedXrayInsecureWarning([url]);
    target.url = url;
    target.remark = remark || getProxyRemark(url) || target.remark || 'Node';
    await proxyStore.saveSettings();
    closeEditNodeModal();
    if (insecureWarning) {
        uiStore.showAlert(insecureWarning);
    }
};

const handleSubmitBatch = async () => {
    if (!batchInput.value.trim()) return;

    const insecureWarning = getUnsupportedXrayInsecureWarning(batchInput.value);
    const count = await proxyStore.batchAddProxy(batchInput.value, proxyStore.currentGroup);
    if (count > 0) {
        let message = window.t('batchAddSuccess') || `Successfully added ${count} nodes.`;
        if (insecureWarning) message += `\n\n${insecureWarning}`;
        uiStore.showAlert(message);
        batchInput.value = '';
        uiStore.batchAddProxyModalVisible = false;
        await proxyStore.loadSettings();
    } else {
        uiStore.showAlert(window.t('batchAddFail') || 'No valid proxy nodes found.');
    }
};

onMounted(() => {
    proxyStore.loadSettings();
});
</script>
