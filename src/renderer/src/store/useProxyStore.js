import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ipcService } from '../services/ipc.service';
import { proxyService } from '../services/proxy.service';
import { getProxyRemark, uuidv4 } from '../utils/helpers';

export const useProxyStore = defineStore('proxy', () => {
    // State
    const settings = ref({
        preProxies: [],
        subscriptions: [],
        mode: 'single',
        notify: false,
        selectedId: null,
        enablePreProxy: false
    });
    const currentGroup = ref('manual');
    const testingIds = ref(new Set());

    // Getters
    const modes = [
        { value: 'single', label: 'Single Node', labelKey: 'modeSingle' },
        { value: 'balance', label: 'Load Balance', labelKey: 'modeBalance' },
        { value: 'failover', label: 'Failover', labelKey: 'modeFailover' }
    ];

    const currentGroupNodes = computed(() => {
        const nodes = settings.value.preProxies || [];
        if (currentGroup.value === 'manual') {
            return nodes.filter(p => !p.groupId || p.groupId === 'manual');
        }
        return nodes.filter(p => p.groupId === currentGroup.value);
    });

    const manualNodes = computed(() => (settings.value.preProxies || []).filter(p => !p.groupId || p.groupId === 'manual'));
    const subscriptions = computed(() => settings.value.subscriptions || []);

    const proxyStatusText = computed(() => {
        if (!settings.value.enablePreProxy) return "OFF";
        const count = settings.value.mode === 'single' 
            ? (settings.value.selectedId ? 1 : 0)
            : (settings.value.preProxies || []).filter(p => p.enable !== false).length;
        
        let modeText = "";
        if (settings.value.mode === 'single') modeText = window.t ? window.t('modeSingle') : 'Single';
        else if (settings.value.mode === 'balance') modeText = window.t ? window.t('modeBalance') : 'Balance';
        else modeText = window.t ? window.t('modeFailover') : 'Failover';
        
        return `${modeText} [${count}]`;
    });

    const proxyStatusStyle = computed(() => {
        if (!settings.value.enablePreProxy) return { color: 'var(--text-secondary)', border: '1px solid var(--border)' };
        return { color: 'var(--accent)', border: '1px solid var(--accent)' };
    });

    const setTesting = (id, active) => {
        const next = new Set(testingIds.value);
        if (active) next.add(id);
        else next.delete(id);
        testingIds.value = next;
    };

    // Actions
    const loadSettings = async () => {
        try {
            const data = await ipcService.getSettings();
            if (data) settings.value = { ...settings.value, ...data };
        } catch (e) {
            console.error('[ProxyStore] Failed to load settings:', e);
        }
    };

    const saveSettings = async () => {
        try {
            const payload = JSON.parse(JSON.stringify(settings.value || {}));
            await ipcService.saveSettings(payload);
        } catch (e) {
            console.error('[ProxyStore] Failed to save settings:', e);
            throw e;
        }
    };

    const switchGroup = (groupId) => {
        currentGroup.value = groupId;
    };

    const testLatency = async (id) => {
        const p = settings.value.preProxies.find(x => x.id === id);
        if (!p) return;

        setTesting(id, true);
        try {
            const res = await proxyService.testLatency(p.url);
            p.latency = res.latency;
            p.latencyErr = res.error;
        } finally {
            setTesting(id, false);
        }
    };

    const testCurrentGroup = async () => {
        const list = currentGroupNodes.value;
        if (list.length === 0) return;

        const concurrency = Math.min(6, Math.max(1, list.length));
        let cursor = 0;

        const worker = async () => {
            while (true) {
                const index = cursor++;
                if (index >= list.length) return;

                const node = list[index];
                setTesting(node.id, true);
                try {
                    const res = await proxyService.testLatency(node.url);
                    const target = settings.value.preProxies.find(x => x.id === node.id);
                    if (target) {
                        target.latency = res.latency;
                        target.latencyErr = res.error;
                    }
                } finally {
                    setTesting(node.id, false);
                }
            }
        };

        await Promise.all(Array.from({ length: concurrency }, () => worker()));

        // If in single mode, auto-switch to best node after current round finishes.
        if (settings.value.mode === 'single') {
            let best = null, min = 99999;
            list.forEach(p => { if (p.latency > 0 && p.latency < min) { min = p.latency; best = p; } });
            if (best) {
                settings.value.selectedId = best.id;
            }
        }
    };

    const deleteProxy = async (id) => {
        settings.value.preProxies = settings.value.preProxies.filter(p => p.id !== id);
        await saveSettings();
    };

    const toggleProxy = async (id) => {
        const p = settings.value.preProxies.find(x => x.id === id);
        if (p) {
            p.enable = !p.enable;
            await saveSettings();
        }
    };

    const selectProxy = async (id) => {
        settings.value.selectedId = id;
        await saveSettings();
    };

    const syncSub = async (subId) => {
        const sub = settings.value.subscriptions.find(s => s.id === subId);
        if (!sub) return;

        const res = await proxyService.syncSubscription(sub);
        if (res.success) {
            settings.value.preProxies = settings.value.preProxies.filter(p => p.groupId !== subId).concat(res.nodes);
            sub.lastUpdated = Date.now();
            await saveSettings();
        }
        return res;
    };

    const addSubscription = async (subData) => {
        const res = await proxyService.syncSubscription({ url: subData.url, id: subData.id });
        if (res.success) {
            subData.lastUpdated = Date.now();
            settings.value.subscriptions.push(subData);
            settings.value.preProxies = settings.value.preProxies.concat(res.nodes);
            await saveSettings();
            return { success: true, count: res.count, unsupportedInsecureCount: res.unsupportedInsecureCount || 0 };
        }
        return { success: false, error: res.error };
    };

    const updateSubscription = async (subData) => {
        const idx = settings.value.subscriptions.findIndex(s => s.id === subData.id);
        if (idx !== -1) {
            settings.value.subscriptions[idx] = { ...settings.value.subscriptions[idx], ...subData };
            const res = await syncSub(subData.id);
            if (res && !res.success) return res;
            await saveSettings();
            return { success: true, unsupportedInsecureCount: res?.unsupportedInsecureCount || 0 };
        }
        return { success: false, error: 'Not found' };
    };

    const deleteSub = async (subId) => {
        settings.value.subscriptions = settings.value.subscriptions.filter(s => s.id !== subId);
        settings.value.preProxies = settings.value.preProxies.filter(p => p.groupId !== subId);
        if (currentGroup.value === subId) currentGroup.value = 'manual';
        await saveSettings();
    };

    const batchAddProxy = async (text, groupId = 'manual') => {
        if (!text) return 0;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return 0;

        let addedCount = 0;
        const newNodes = [];
        for (const line of lines) {
            if (!line.includes('://') && !line.includes(':')) continue;
            const remark = getProxyRemark(line) || 'Batch Node';
            newNodes.push({
                id: uuidv4(),
                remark,
                url: line,
                enable: true,
                groupId: groupId
            });
            addedCount++;
        }

        if (newNodes.length > 0) {
            settings.value.preProxies = [...settings.value.preProxies, ...newNodes];
            await saveSettings();
            return addedCount;
        }
        return 0;
    };

    return {
        settings,
        currentGroup,
        testingIds,
        modes,
        currentGroupNodes,
        manualNodes,
        subscriptions,
        proxyStatusText,
        proxyStatusStyle,
        loadSettings,
        saveSettings,
        switchGroup,
        testLatency,
        testCurrentGroup,
        deleteProxy,
        toggleProxy,
        selectProxy,
        syncSub,
        addSubscription,
        updateSubscription,
        deleteSub,
        batchAddProxy
    };
});
